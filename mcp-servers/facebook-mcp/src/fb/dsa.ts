import { DsaSource, Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { GraphClient } from './core/graph-client.js';
import { normalizeAdAccountId } from './core/tenant-registry.js';
import type { RequestContext } from './core/types.js';

const EU_COUNTRIES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'IS',
  'LI',
  'NO',
]);

export interface DsaSettings {
  dsaBeneficiary: string;
  dsaPayor: string;
  dsaSource: DsaSource;
  dsaUpdatedAt: Date;
}

export class DsaComplianceError extends Error {
  readonly code = 'DSA_REQUIRED';
  readonly nextSteps: string[];

  constructor(message = 'Set DSA payor/beneficiary in tenant settings') {
    super(message);
    this.name = 'DsaComplianceError';
    this.nextSteps = [
      'Open tenant DSA settings for this ad account.',
      'Autofill from Meta recommendations or enter beneficiary/payor manually.',
      'Retry the campaign workflow after DSA settings are saved.',
    ];
  }
}

export function isEuTargeting(countries: string[]): boolean {
  return countries.some((country) => EU_COUNTRIES.has(country.toUpperCase().trim()));
}

function collectCountryCodes(value: unknown, countries: Set<string>): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === 'countries' && Array.isArray(raw)) {
      for (const country of raw) {
        if (typeof country === 'string' && country.trim()) {
          countries.add(country.toUpperCase().trim());
        }
      }
      continue;
    }

    if (raw && typeof raw === 'object') {
      collectCountryCodes(raw, countries);
    }
  }
}

export function extractCountryCodesFromTargeting(targeting: unknown): string[] {
  const countries = new Set<string>();
  collectCountryCodes(targeting, countries);
  return [...countries];
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseRecommendations(data: unknown): { dsaBeneficiary: string; dsaPayor: string } | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const root = data as Record<string, unknown>;
  const dataArray = Array.isArray(root.data) ? root.data : [];
  const candidates: Array<Record<string, unknown>> = [
    root,
    ...dataArray.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')),
  ];

  for (const candidate of candidates) {
    const dsaBeneficiary =
      normalizeString(candidate.dsa_beneficiary) ||
      normalizeString(candidate.recommended_dsa_beneficiary) ||
      normalizeString(candidate.beneficiary) ||
      normalizeString(candidate.recommended_beneficiary);
    const dsaPayor =
      normalizeString(candidate.dsa_payor) ||
      normalizeString(candidate.recommended_dsa_payor) ||
      normalizeString(candidate.payor) ||
      normalizeString(candidate.recommended_payor);

    if (dsaBeneficiary && dsaPayor) {
      return { dsaBeneficiary, dsaPayor };
    }
  }

  return null;
}

function isMissingAdAccountSettingsTableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2021';
  }

  const message = error instanceof Error ? error.message : '';
  return message.includes('AdAccountSettings') && message.includes('does not exist');
}

export class DsaService {
  private readonly graphClient: GraphClient;
  private readonly dbClient: PrismaClient;

  constructor(graphClient: GraphClient, dbClient: PrismaClient = prisma) {
    this.graphClient = graphClient;
    this.dbClient = dbClient;
  }

  async getDsaSettingsFromDb(
    ctx: RequestContext,
    adAccountId: string
  ): Promise<DsaSettings | null> {
    const normalizedAdAccountId = normalizeAdAccountId(adAccountId);
    let settings;
    try {
      settings = await this.dbClient.adAccountSettings.findUnique({
        where: {
          tenantId_adAccountId: {
            tenantId: ctx.tenantId,
            adAccountId: normalizedAdAccountId,
          },
        },
      });
    } catch (error) {
      if (isMissingAdAccountSettingsTableError(error)) {
        logger.warn('AdAccountSettings table missing; skipping DSA DB read', {
          tenantId: ctx.tenantId,
          adAccountId: normalizedAdAccountId,
        });
        return null;
      }
      throw error;
    }

    if (!settings?.dsaBeneficiary || !settings?.dsaPayor) {
      return null;
    }

    return {
      dsaBeneficiary: settings.dsaBeneficiary,
      dsaPayor: settings.dsaPayor,
      dsaSource: settings.dsaSource,
      dsaUpdatedAt: settings.dsaUpdatedAt,
    };
  }

  async fetchDsaRecommendationsFromMeta(
    ctx: RequestContext,
    adAccountId: string
  ): Promise<{ dsaBeneficiary: string; dsaPayor: string } | null> {
    const normalizedAdAccountId = normalizeAdAccountId(adAccountId);
    const response = await this.graphClient.request<Record<string, unknown>>(ctx, {
      method: 'GET',
      path: `${normalizedAdAccountId}/dsa_recommendations`,
    });

    const parsed = parseRecommendations(response.data);
    logger.info('Fetched DSA recommendation metadata', {
      tenantId: ctx.tenantId,
      adAccountId: normalizedAdAccountId,
      hasRecommendation: Boolean(parsed),
    });
    return parsed;
  }

  async ensureDsaForAdAccount(ctx: RequestContext, adAccountId: string): Promise<DsaSettings> {
    const normalizedAdAccountId = normalizeAdAccountId(adAccountId);
    const existing = await this.getDsaSettingsFromDb(ctx, normalizedAdAccountId);
    if (existing) {
      return existing;
    }

    const recommendation = await this.fetchDsaRecommendationsFromMeta(ctx, normalizedAdAccountId);
    const fallback = recommendation || (await this.buildAutomaticTenantFallback(ctx));
    if (!fallback) {
      throw new DsaComplianceError();
    }
    const source = recommendation ? DsaSource.RECOMMENDATION : DsaSource.MANUAL;

    let persisted;
    try {
      persisted = await this.dbClient.adAccountSettings.upsert({
        where: {
          tenantId_adAccountId: {
            tenantId: ctx.tenantId,
            adAccountId: normalizedAdAccountId,
          },
        },
        update: {
          dsaBeneficiary: fallback.dsaBeneficiary,
          dsaPayor: fallback.dsaPayor,
          dsaSource: source,
          dsaUpdatedAt: new Date(),
        },
        create: {
          tenantId: ctx.tenantId,
          adAccountId: normalizedAdAccountId,
          dsaBeneficiary: fallback.dsaBeneficiary,
          dsaPayor: fallback.dsaPayor,
          dsaSource: source,
          dsaUpdatedAt: new Date(),
        },
      });
    } catch (error) {
      if (isMissingAdAccountSettingsTableError(error)) {
        logger.warn('AdAccountSettings table missing; skipping DSA DB persist', {
          tenantId: ctx.tenantId,
          adAccountId: normalizedAdAccountId,
        });
        return {
          dsaBeneficiary: fallback.dsaBeneficiary,
          dsaPayor: fallback.dsaPayor,
          dsaSource: source,
          dsaUpdatedAt: new Date(),
        };
      }
      throw error;
    }

    if (!persisted) {
      return {
        dsaBeneficiary: fallback.dsaBeneficiary,
        dsaPayor: fallback.dsaPayor,
        dsaSource: source,
        dsaUpdatedAt: new Date(),
      };
    }

    return {
      dsaBeneficiary: persisted.dsaBeneficiary || fallback.dsaBeneficiary,
      dsaPayor: persisted.dsaPayor || fallback.dsaPayor,
      dsaSource: persisted.dsaSource,
      dsaUpdatedAt: persisted.dsaUpdatedAt,
    };
  }

  private async buildAutomaticTenantFallback(
    ctx: RequestContext
  ): Promise<{ dsaBeneficiary: string; dsaPayor: string } | null> {
    const tenant = await this.dbClient.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true },
    });
    const tenantName = tenant?.name?.trim();
    if (!tenantName) {
      return null;
    }

    logger.info('Using tenant-name DSA fallback', {
      tenantId: ctx.tenantId,
    });

    return {
      dsaBeneficiary: tenantName,
      dsaPayor: tenantName,
    };
  }
}
