import { DsaSource, Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { GraphApiError, GraphClient } from './core/graph-client.js';
import { normalizeAdAccountId } from './core/tenant-registry.js';
import type { RequestContext } from './core/types.js';
import type {
  DsaAutofillBeneficiarySource,
  DsaAutofillConfidence,
  DsaAutofillPayerSource,
  DsaAutofillSuggestion,
  DsaAutofillSuggestionsResult,
} from '../types/facebook.js';

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

interface PersistDsaSettingsInput {
  dsaBeneficiary: string;
  dsaPayor: string;
  dsaSource: DsaSource;
  businessId?: string | null;
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

export class DsaAutofillPermissionDeniedError extends Error {
  readonly code = 'PERMISSION_DENIED';

  constructor(message = 'Unable to fetch data from Meta due to missing permissions.') {
    super(message);
    this.name = 'DsaAutofillPermissionDeniedError';
  }
}

interface DsaAutofillInput {
  businessId: string;
  adAccountId: string;
  pageId?: string;
}

interface GraphBusinessNode {
  id: string;
  name: string;
  verificationStatus?: string;
}

interface GraphAdAccountNode {
  id: string;
  name: string;
  currency?: string;
  timezoneName?: string;
  businessId?: string;
  businessName?: string;
}

interface GraphPageNode {
  id: string;
  name: string;
  businessId?: string;
  businessName?: string;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseBusinessNode(value: unknown): GraphBusinessNode | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = normalizeString(record.id);
  const name = normalizeString(record.name);
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    verificationStatus: normalizeString(record.verification_status) || undefined,
  };
}

function parseAdAccountNode(value: unknown): GraphAdAccountNode | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = normalizeString(record.id);
  const accountId = normalizeString(record.account_id);
  const normalizedId = id || (accountId ? normalizeAdAccountId(accountId) : null);
  const name = normalizeString(record.name);
  if (!normalizedId || !name) {
    return null;
  }
  const business = asRecord(record.business);
  return {
    id: normalizedId,
    name,
    currency: normalizeString(record.currency) || undefined,
    timezoneName: normalizeString(record.timezone_name) || undefined,
    businessId: normalizeString(business?.id) || undefined,
    businessName: normalizeString(business?.name) || undefined,
  };
}

function parsePageNode(value: unknown): GraphPageNode | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = normalizeString(record.id);
  const name = normalizeString(record.name);
  if (!id || !name) {
    return null;
  }
  const business = asRecord(record.business);
  return {
    id,
    name,
    businessId: normalizeString(business?.id) || undefined,
    businessName: normalizeString(business?.name) || undefined,
  };
}

function extractGraphErrorCode(error: GraphApiError): number | null {
  const root = asRecord(error.data);
  const graphError = asRecord(root?.error);
  const code = graphError?.code;
  return typeof code === 'number' ? code : null;
}

function extractGraphErrorMessage(error: GraphApiError): string {
  const root = asRecord(error.data);
  const graphError = asRecord(root?.error);
  return (
    normalizeString(graphError?.message) ||
    normalizeString(error.message) ||
    'Graph API request failed.'
  );
}

function isPermissionDeniedGraphError(error: unknown): error is GraphApiError {
  if (!(error instanceof GraphApiError)) return false;
  if (error.status === 401 || error.status === 403) {
    return true;
  }
  const code = extractGraphErrorCode(error);
  return code === 10 || code === 190 || code === 200 || code === 294;
}

function isMissingObjectGraphError(error: unknown): error is GraphApiError {
  if (!(error instanceof GraphApiError)) return false;
  if (error.status === 404) {
    return true;
  }
  const code = extractGraphErrorCode(error);
  if (code === 100 || code === 803) {
    return true;
  }
  return extractGraphErrorMessage(error).toLowerCase().includes('unsupported get request');
}

function isBusinessVerifiedStatus(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toUpperCase();
  return normalized.includes('VERIFIED') && !normalized.includes('NOT_VERIFIED');
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

  async getDsaSettings(ctx: RequestContext, adAccountId: string): Promise<DsaSettings | null> {
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

  async setDsaSettings(
    ctx: RequestContext,
    adAccountId: string,
    input: {
      dsaBeneficiary: string;
      dsaPayor: string;
      source?: DsaSource;
      businessId?: string | null;
    }
  ): Promise<DsaSettings> {
    const normalizedAdAccountId = normalizeAdAccountId(adAccountId);
    const normalizedBeneficiary = input.dsaBeneficiary.trim();
    const normalizedPayor = input.dsaPayor.trim();
    const source = input.source || DsaSource.MANUAL;
    const payload: PersistDsaSettingsInput = {
      dsaBeneficiary: normalizedBeneficiary,
      dsaPayor: normalizedPayor,
      dsaSource: source,
      businessId: input.businessId,
    };
    const persisted = await this.persistDsaSettings(ctx, normalizedAdAccountId, payload);
    return {
      dsaBeneficiary: persisted.dsaBeneficiary || normalizedBeneficiary,
      dsaPayor: persisted.dsaPayor || normalizedPayor,
      dsaSource: persisted.dsaSource,
      dsaUpdatedAt: persisted.dsaUpdatedAt,
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
    const existing = await this.getDsaSettings(ctx, normalizedAdAccountId);
    if (existing) {
      return existing;
    }

    const recommendation = await this.fetchDsaRecommendationsFromMeta(ctx, normalizedAdAccountId);
    const fallback = recommendation || (await this.buildAutomaticTenantFallback(ctx));
    if (!fallback) {
      throw new DsaComplianceError();
    }
    const source = recommendation ? DsaSource.RECOMMENDATION : DsaSource.MANUAL;
    const persisted = await this.persistDsaSettings(ctx, normalizedAdAccountId, {
      dsaBeneficiary: fallback.dsaBeneficiary,
      dsaPayor: fallback.dsaPayor,
      dsaSource: source,
    });

    return {
      dsaBeneficiary: persisted.dsaBeneficiary || fallback.dsaBeneficiary,
      dsaPayor: persisted.dsaPayor || fallback.dsaPayor,
      dsaSource: persisted.dsaSource,
      dsaUpdatedAt: persisted.dsaUpdatedAt,
    };
  }

  async getDsaAutofillSuggestions(
    ctx: RequestContext,
    input: DsaAutofillInput
  ): Promise<DsaAutofillSuggestionsResult> {
    const normalizedAdAccountId = normalizeAdAccountId(input.adAccountId);
    const [business, adAccount, page, tenantFallback] = await Promise.all([
      this.fetchBusinessMetadata(ctx, input.businessId),
      this.fetchAdAccountMetadata(ctx, normalizedAdAccountId),
      this.fetchPageMetadata(ctx, input.pageId),
      this.buildAutomaticTenantFallback(ctx),
    ]);
    const tenantName = tenantFallback?.dsaBeneficiary || ctx.tenantId;
    const businessAligned = Boolean(
      business?.id &&
        adAccount?.businessId &&
        business.id === input.businessId &&
        adAccount.businessId === input.businessId
    );
    const pageAligned = Boolean(page?.businessId && page.businessId === input.businessId);
    const businessVerified = isBusinessVerifiedStatus(business?.verificationStatus);

    const beneficiary = this.buildBeneficiarySuggestion({
      business,
      page,
      tenantName,
      businessAligned,
      pageAligned,
      businessVerified,
    });
    const payer = this.buildPayerSuggestion({
      business,
      adAccount,
      tenantName,
      businessAligned,
      pageAligned,
      businessVerified,
    });

    return {
      beneficiary,
      payer,
      meta: {
        business: business
          ? {
              id: business.id,
              name: business.name,
              verification_status: business.verificationStatus,
            }
          : undefined,
        adAccount: adAccount
          ? {
              id: adAccount.id,
              name: adAccount.name,
              currency: adAccount.currency,
              timezone_name: adAccount.timezoneName,
            }
          : undefined,
        page: page
          ? {
              id: page.id,
              name: page.name,
            }
          : undefined,
      },
    };
  }

  private async persistDsaSettings(
    ctx: RequestContext,
    normalizedAdAccountId: string,
    payload: PersistDsaSettingsInput
  ): Promise<{
    dsaBeneficiary: string;
    dsaPayor: string;
    dsaSource: DsaSource;
    dsaUpdatedAt: Date;
  }> {
    const now = new Date();
    try {
      const persisted = await this.dbClient.adAccountSettings.upsert({
        where: {
          tenantId_adAccountId: {
            tenantId: ctx.tenantId,
            adAccountId: normalizedAdAccountId,
          },
        },
        update: {
          businessId: payload.businessId === undefined ? undefined : payload.businessId,
          dsaBeneficiary: payload.dsaBeneficiary,
          dsaPayor: payload.dsaPayor,
          dsaSource: payload.dsaSource,
          dsaUpdatedAt: now,
        },
        create: {
          tenantId: ctx.tenantId,
          businessId: payload.businessId ?? null,
          adAccountId: normalizedAdAccountId,
          dsaBeneficiary: payload.dsaBeneficiary,
          dsaPayor: payload.dsaPayor,
          dsaSource: payload.dsaSource,
          dsaUpdatedAt: now,
        },
      });
      if (!persisted) {
        return {
          dsaBeneficiary: payload.dsaBeneficiary,
          dsaPayor: payload.dsaPayor,
          dsaSource: payload.dsaSource,
          dsaUpdatedAt: now,
        };
      }
      return {
        dsaBeneficiary: persisted.dsaBeneficiary || payload.dsaBeneficiary,
        dsaPayor: persisted.dsaPayor || payload.dsaPayor,
        dsaSource: persisted.dsaSource,
        dsaUpdatedAt: persisted.dsaUpdatedAt,
      };
    } catch (error) {
      if (isMissingAdAccountSettingsTableError(error)) {
        logger.warn('AdAccountSettings table missing; skipping DSA DB persist', {
          tenantId: ctx.tenantId,
          adAccountId: normalizedAdAccountId,
        });
        return {
          dsaBeneficiary: payload.dsaBeneficiary,
          dsaPayor: payload.dsaPayor,
          dsaSource: payload.dsaSource,
          dsaUpdatedAt: now,
        };
      }
      throw error;
    }
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

  private async fetchBusinessMetadata(
    ctx: RequestContext,
    businessId: string
  ): Promise<GraphBusinessNode | null> {
    try {
      const response = await this.graphClient.request<Record<string, unknown>>(ctx, {
        method: 'GET',
        path: businessId,
        query: {
          fields: 'id,name,verification_status',
        },
      });
      return parseBusinessNode(response.data);
    } catch (error) {
      if (isPermissionDeniedGraphError(error)) {
        throw new DsaAutofillPermissionDeniedError(extractGraphErrorMessage(error));
      }
      if (isMissingObjectGraphError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async fetchAdAccountMetadata(
    ctx: RequestContext,
    adAccountId: string
  ): Promise<GraphAdAccountNode | null> {
    try {
      const response = await this.graphClient.request<Record<string, unknown>>(ctx, {
        method: 'GET',
        path: adAccountId,
        query: {
          fields: 'id,name,account_id,currency,timezone_name,business{id,name}',
        },
      });
      return parseAdAccountNode(response.data);
    } catch (error) {
      if (isPermissionDeniedGraphError(error)) {
        throw new DsaAutofillPermissionDeniedError(extractGraphErrorMessage(error));
      }
      if (isMissingObjectGraphError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async fetchPageMetadata(
    ctx: RequestContext,
    pageId: string | undefined
  ): Promise<GraphPageNode | null> {
    if (!pageId) {
      return null;
    }
    const normalizedPageId = pageId.trim();
    if (!normalizedPageId) {
      return null;
    }

    const mappedPage = await this.dbClient.tenantPage.findUnique({
      where: {
        tenantId_pageId: {
          tenantId: ctx.tenantId,
          pageId: normalizedPageId,
        },
      },
      select: { pageId: true },
    });
    if (!mappedPage) {
      logger.info('Skipping DSA autofill page lookup because page is not mapped to tenant', {
        tenantId: ctx.tenantId,
        pageId: normalizedPageId,
      });
      return null;
    }

    try {
      const response = await this.graphClient.request<Record<string, unknown>>(ctx, {
        method: 'GET',
        path: normalizedPageId,
        query: {
          fields: 'id,name,business{id,name}',
        },
      });
      return parsePageNode(response.data);
    } catch (error) {
      if (isPermissionDeniedGraphError(error)) {
        throw new DsaAutofillPermissionDeniedError(extractGraphErrorMessage(error));
      }
      if (isMissingObjectGraphError(error)) {
        logger.info('Ignoring missing page metadata during DSA autofill', {
          tenantId: ctx.tenantId,
          pageId: normalizedPageId,
        });
        return null;
      }
      throw error;
    }
  }

  private resolveConfidence(
    fallbackUsed: boolean,
    businessAligned: boolean,
    pageAligned: boolean,
    businessVerified: boolean
  ): DsaAutofillConfidence {
    if (fallbackUsed) {
      return 'LOW';
    }
    if (businessAligned || businessVerified) {
      return 'HIGH';
    }
    if (pageAligned) {
      return 'MEDIUM';
    }
    return 'MEDIUM';
  }

  private appendConfidenceReason(
    reasons: string[],
    confidence: DsaAutofillConfidence,
    options: { businessAligned: boolean; pageAligned: boolean; businessVerified: boolean; fallbackUsed: boolean }
  ): void {
    if (confidence === 'HIGH') {
      if (options.businessAligned) {
        reasons.push('Ad account business matches the selected Business Portfolio.');
      }
      if (options.businessVerified) {
        reasons.push('Business Portfolio is verified in Meta.');
      }
      if (!options.businessAligned && !options.businessVerified) {
        reasons.push('Meta business identity data is strongly aligned.');
      }
      return;
    }

    if (confidence === 'MEDIUM') {
      if (options.pageAligned) {
        reasons.push('Default Page is associated with the selected Business Portfolio.');
      } else {
        reasons.push('Meta metadata is partially available, but ownership alignment is incomplete.');
      }
      return;
    }

    if (options.fallbackUsed) {
      reasons.push('Used tenant fallback because Meta metadata was unavailable.');
    } else {
      reasons.push('Confidence is low due to limited metadata alignment.');
    }
  }

  private buildBeneficiarySuggestion(input: {
    business: GraphBusinessNode | null;
    page: GraphPageNode | null;
    tenantName: string;
    businessAligned: boolean;
    pageAligned: boolean;
    businessVerified: boolean;
  }): DsaAutofillSuggestion<DsaAutofillBeneficiarySource> {
    let value = input.tenantName;
    let source: DsaAutofillBeneficiarySource = 'TENANT_FALLBACK';
    const reasons: string[] = [];

    if (input.business?.name) {
      value = input.business.name;
      source = 'BUSINESS_NAME';
      reasons.push('Used Business Portfolio name from Meta.');
    } else if (
      input.page?.businessName &&
      (!input.business?.name || input.page.businessName.toLowerCase() !== input.business.name.toLowerCase())
    ) {
      value = input.page.businessName;
      source = 'PAGE_BUSINESS_NAME';
      reasons.push('Used Page owner business name from Meta.');
    } else if (input.page?.name) {
      value = input.page.name;
      source = 'PAGE_NAME';
      reasons.push('Used default Page name from Meta.');
    } else {
      reasons.push('No Business or Page identity metadata was available.');
    }

    const confidence = this.resolveConfidence(
      source === 'TENANT_FALLBACK',
      input.businessAligned,
      input.pageAligned,
      input.businessVerified
    );
    this.appendConfidenceReason(reasons, confidence, {
      businessAligned: input.businessAligned,
      pageAligned: input.pageAligned,
      businessVerified: input.businessVerified,
      fallbackUsed: source === 'TENANT_FALLBACK',
    });

    return {
      value,
      source,
      confidence,
      reasons,
    };
  }

  private buildPayerSuggestion(input: {
    business: GraphBusinessNode | null;
    adAccount: GraphAdAccountNode | null;
    tenantName: string;
    businessAligned: boolean;
    pageAligned: boolean;
    businessVerified: boolean;
  }): DsaAutofillSuggestion<DsaAutofillPayerSource> {
    let value = input.tenantName;
    let source: DsaAutofillPayerSource = 'TENANT_FALLBACK';
    const reasons: string[] = [];

    if (input.adAccount?.name) {
      value = input.adAccount.name;
      source = 'AD_ACCOUNT_NAME';
      reasons.push('Used Ad Account name from Meta.');
    } else if (input.business?.name) {
      value = input.business.name;
      source = 'BUSINESS_NAME';
      reasons.push('Used Business Portfolio name from Meta.');
    } else {
      reasons.push('No Ad Account or Business identity metadata was available.');
    }

    const confidence = this.resolveConfidence(
      source === 'TENANT_FALLBACK',
      input.businessAligned,
      input.pageAligned,
      input.businessVerified
    );
    this.appendConfidenceReason(reasons, confidence, {
      businessAligned: input.businessAligned,
      pageAligned: input.pageAligned,
      businessVerified: input.businessVerified,
      fallbackUsed: source === 'TENANT_FALLBACK',
    });

    return {
      value,
      source,
      confidence,
      reasons,
    };
  }
}

export async function attachDsaPayloadForEuTargeting(
  dsaService: DsaService,
  ctx: RequestContext,
  adAccountId: string,
  targeting: unknown,
  payload: Record<string, unknown>
): Promise<void> {
  const countries = extractCountryCodesFromTargeting(targeting);
  if (!isEuTargeting(countries)) {
    return;
  }

  const dsaSettings = await dsaService.ensureDsaForAdAccount(ctx, adAccountId);
  payload.dsa_beneficiary = dsaSettings.dsaBeneficiary;
  payload.dsa_payor = dsaSettings.dsaPayor;
}
