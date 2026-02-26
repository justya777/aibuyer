import type { RequestContext } from './core/types.js';
import { GraphClient } from './core/graph-client.js';
import { logger } from '../utils/logger.js';

type AdSetTargetingInput = {
  geoLocations?: {
    countries?: string[];
    regions?: string[];
    cities?: string[];
  };
  ageMin?: number;
  ageMax?: number;
  genders?: number[];
  interests?: string[];
  behaviors?: string[];
  customAudiences?: string[];
  locales?: Array<number | string>;
  targetingAutomation?: {
    advantageAudience?: number | boolean;
  };
};

interface SearchResult {
  id?: string;
  key?: string;
  name?: string;
}

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  romania: 'RO',
  poland: 'PL',
  germany: 'DE',
  france: 'FR',
  italy: 'IT',
  spain: 'ES',
  netherlands: 'NL',
  belgium: 'BE',
  austria: 'AT',
  sweden: 'SE',
  denmark: 'DK',
  finland: 'FI',
  portugal: 'PT',
  greece: 'GR',
  ireland: 'IE',
  bulgaria: 'BG',
  croatia: 'HR',
  hungary: 'HU',
  slovakia: 'SK',
  slovenia: 'SI',
  lithuania: 'LT',
  latvia: 'LV',
  estonia: 'EE',
  luxembourg: 'LU',
  cyprus: 'CY',
  malta: 'MT',
  czechia: 'CZ',
  'czech republic': 'CZ',
  norway: 'NO',
  uk: 'GB',
  'united kingdom': 'GB',
  canada: 'CA',
};

function normalizeCountryCode(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return COUNTRY_NAME_TO_CODE[trimmed.toLowerCase()] || null;
}

export function parseGenderFromInput(genders?: number[]): 'all' | 'male' | 'female' {
  if (!genders || genders.length === 0) return 'all';
  if (genders.includes(1) && genders.includes(2)) return 'all';
  if (genders.includes(1)) return 'male';
  if (genders.includes(2)) return 'female';
  return 'all';
}

interface LocaleCacheEntry {
  id: number;
  name?: string;
  cachedAt: number;
}

const LOCALE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const localeCache = new Map<string, LocaleCacheEntry>();

export class TargetingApi {
  private readonly graphClient: GraphClient;

  constructor(graphClient: GraphClient) {
    this.graphClient = graphClient;
  }

  async buildAdSetTargeting(
    ctx: RequestContext,
    targetingInput?: AdSetTargetingInput
  ): Promise<Record<string, unknown> | undefined> {
    if (!targetingInput) return undefined;

    const targeting: Record<string, unknown> = {};
    if (targetingInput.geoLocations) {
      const geo: Record<string, unknown> = {};
      if (targetingInput.geoLocations.countries?.length) {
        const normalizedCountries = targetingInput.geoLocations.countries
          .map((country) => normalizeCountryCode(country))
          .filter((country): country is string => Boolean(country));
        if (normalizedCountries.length > 0) {
          geo.countries = normalizedCountries;
        } else {
          logger.warn('Ignoring unsupported country targeting values', {
            tenantId: ctx.tenantId,
          });
        }
      }
      // Regions/cities need structured keys from Graph search; skip raw strings to avoid invalid parameter errors.
      if (Object.keys(geo).length > 0) targeting.geo_locations = geo;
    }

    if (typeof targetingInput.ageMin === 'number') targeting.age_min = targetingInput.ageMin;
    if (typeof targetingInput.ageMax === 'number') targeting.age_max = targetingInput.ageMax;

    if (targetingInput.genders?.length) {
      const valid = targetingInput.genders.filter((g) => g === 1 || g === 2);
      if (valid.length > 0) targeting.genders = valid;
    }

    const flexibleSpecClause: Record<string, unknown> = {};

    if (targetingInput.interests?.length) {
      const interests = await this.searchInterests(ctx, targetingInput.interests);
      if (interests.length > 0) {
        flexibleSpecClause.interests = interests.map((interest) => ({
          id: interest.id,
          name: interest.name,
        }));
      }
    }

    if (targetingInput.behaviors?.length) {
      const behaviors = await this.searchBehaviors(ctx, targetingInput.behaviors);
      if (behaviors.length > 0) {
        flexibleSpecClause.behaviors = behaviors.map((behavior) => ({
          id: behavior.id,
          name: behavior.name,
        }));
      }
    }

    if (targetingInput.customAudiences?.length) {
      flexibleSpecClause.custom_audiences = targetingInput.customAudiences.map((id) => ({ id }));
    }

    if (Object.keys(flexibleSpecClause).length > 0) {
      // Meta expects detailed targeting segments (interests/behaviors/custom audiences) in flexible_spec.
      targeting.flexible_spec = [flexibleSpecClause];
    }

    if (targetingInput.locales?.length) {
      const localeIds = await this.resolveLocales(ctx, targetingInput.locales);
      if (localeIds.length > 0) {
        targeting.locales = localeIds;
      }
    }

    const rawAdvantageAudience = targetingInput.targetingAutomation?.advantageAudience;
    if (rawAdvantageAudience != null) {
      const normalizedAdvantageAudience =
        typeof rawAdvantageAudience === 'boolean'
          ? rawAdvantageAudience
            ? 1
            : 0
          : Number(rawAdvantageAudience) === 1
            ? 1
            : 0;
      targeting.targeting_automation = {
        advantage_audience: normalizedAdvantageAudience,
      };
    }

    if (Object.keys(targeting).length === 0) return undefined;
    return targeting;
  }

  private async searchInterests(
    ctx: RequestContext,
    names: string[]
  ): Promise<Array<{ id: string; name: string }>> {
    const results: Array<{ id: string; name: string }> = [];

    for (const name of names) {
      try {
        const response = await this.graphClient.request<{ data?: SearchResult[] }>(ctx, {
          method: 'GET',
          path: 'search',
          query: {
            type: 'adinterest',
            q: name,
            limit: 1,
          },
        });
        const first = response.data.data?.[0];
        if (first?.id && first?.name) {
          results.push({ id: first.id, name: first.name });
        }
      } catch (error) {
        logger.warn(`Unable to resolve Facebook interest "${name}"`, {
          tenantId: ctx.tenantId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  private async searchBehaviors(
    ctx: RequestContext,
    names: string[]
  ): Promise<Array<{ id: string; name: string }>> {
    const results: Array<{ id: string; name: string }> = [];

    for (const name of names) {
      try {
        const response = await this.graphClient.request<{ data?: SearchResult[] }>(ctx, {
          method: 'GET',
          path: 'search',
          query: {
            type: 'adTargetingCategory',
            class: 'behaviors',
            q: name,
            limit: 1,
          },
        });
        const first = response.data.data?.[0];
        if (first?.id && first?.name) {
          results.push({ id: first.id, name: first.name });
        }
      } catch (error) {
        logger.warn(`Unable to resolve Facebook behavior "${name}"`, {
          tenantId: ctx.tenantId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  private async resolveLocales(ctx: RequestContext, locales: Array<number | string>): Promise<number[]> {
    const localeIds: number[] = [];
    const resolved: Array<{ input: string | number; id: number; name?: string; cached: boolean }> = [];
    const now = Date.now();

    for (const locale of locales) {
      if (typeof locale === 'number') {
        localeIds.push(locale);
        resolved.push({ input: locale, id: locale, cached: false });
        continue;
      }

      const asNumber = Number.parseInt(locale, 10);
      if (Number.isFinite(asNumber) && asNumber.toString() === locale) {
        localeIds.push(asNumber);
        resolved.push({ input: locale, id: asNumber, cached: false });
        continue;
      }

      const cacheKey = locale.toLowerCase().trim();
      const cached = localeCache.get(cacheKey);
      if (cached && now - cached.cachedAt < LOCALE_CACHE_TTL_MS) {
        localeIds.push(cached.id);
        resolved.push({ input: locale, id: cached.id, name: cached.name, cached: true });
        continue;
      }

      try {
        const response = await this.graphClient.request<{ data?: SearchResult[] }>(ctx, {
          method: 'GET',
          path: 'search',
          query: {
            type: 'adlocale',
            q: locale,
            limit: 5,
          },
        });
        const results = response.data.data ?? [];
        const first = results[0];
        if (first?.key) {
          const parsed = Number.parseInt(first.key, 10);
          if (Number.isFinite(parsed)) {
            localeIds.push(parsed);
            localeCache.set(cacheKey, { id: parsed, name: first.name, cachedAt: now });
            resolved.push({ input: locale, id: parsed, name: first.name, cached: false });
          }
        } else {
          logger.warn(`No locale results from Meta for "${locale}"`, {
            tenantId: ctx.tenantId,
            candidates: results.slice(0, 3).map((r) => ({ key: r.key, name: r.name })),
          });
        }
      } catch (error) {
        logger.warn(`Unable to resolve Facebook locale "${locale}"`, {
          tenantId: ctx.tenantId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Resolved locales', {
      tenantId: ctx.tenantId,
      input: locales,
      resolved,
    });

    return localeIds;
  }
}
