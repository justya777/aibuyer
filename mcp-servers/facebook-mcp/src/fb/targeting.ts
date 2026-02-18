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
};

interface SearchResult {
  id?: string;
  key?: string;
  name?: string;
}

export function parseGenderFromInput(genders?: number[]): 'all' | 'male' | 'female' {
  if (!genders || genders.length === 0) return 'all';
  if (genders.includes(1) && genders.includes(2)) return 'all';
  if (genders.includes(1)) return 'male';
  if (genders.includes(2)) return 'female';
  return 'all';
}

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
      if (targetingInput.geoLocations.countries?.length) geo.countries = targetingInput.geoLocations.countries;
      if (targetingInput.geoLocations.regions?.length) geo.regions = targetingInput.geoLocations.regions;
      if (targetingInput.geoLocations.cities?.length) geo.cities = targetingInput.geoLocations.cities;
      if (Object.keys(geo).length > 0) targeting.geo_locations = geo;
    }

    if (typeof targetingInput.ageMin === 'number') targeting.age_min = targetingInput.ageMin;
    if (typeof targetingInput.ageMax === 'number') targeting.age_max = targetingInput.ageMax;

    if (targetingInput.genders?.length) {
      const valid = targetingInput.genders.filter((g) => g === 1 || g === 2);
      if (valid.length > 0) targeting.genders = valid;
    }

    if (targetingInput.interests?.length) {
      const interests = await this.searchInterests(ctx, targetingInput.interests);
      if (interests.length > 0) {
        targeting.interests = interests.map((interest) => ({
          id: interest.id,
          name: interest.name,
        }));
      }
    }

    if (targetingInput.behaviors?.length) {
      targeting.behaviors = targetingInput.behaviors.map((name) => ({ name }));
    }

    if (targetingInput.customAudiences?.length) {
      targeting.custom_audiences = targetingInput.customAudiences.map((id) => ({ id }));
    }

    if (targetingInput.locales?.length) {
      const localeIds = await this.resolveLocales(ctx, targetingInput.locales);
      if (localeIds.length > 0) {
        targeting.locales = localeIds;
      }
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

  private async resolveLocales(ctx: RequestContext, locales: Array<number | string>): Promise<number[]> {
    const localeIds: number[] = [];
    for (const locale of locales) {
      if (typeof locale === 'number') {
        localeIds.push(locale);
        continue;
      }

      const asNumber = Number.parseInt(locale, 10);
      if (Number.isFinite(asNumber) && asNumber.toString() === locale) {
        localeIds.push(asNumber);
        continue;
      }

      try {
        const response = await this.graphClient.request<{ data?: SearchResult[] }>(ctx, {
          method: 'GET',
          path: 'search',
          query: {
            type: 'adlocale',
            q: locale,
            limit: 1,
          },
        });
        const first = response.data.data?.[0];
        if (first?.key) {
          const parsed = Number.parseInt(first.key, 10);
          if (Number.isFinite(parsed)) {
            localeIds.push(parsed);
          }
        }
      } catch (error) {
        logger.warn(`Unable to resolve Facebook locale "${locale}"`, {
          tenantId: ctx.tenantId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return localeIds;
  }
}
