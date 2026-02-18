import type { RequestContext } from './core/types.js';
import { GraphClient } from './core/graph-client.js';
import type { FacebookInsights, GetInsightsParams } from '../types/facebook.js';

interface CacheEntry {
  expiresAt: number;
  value: FacebookInsights;
}

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value) || 0;
  return 0;
}

function parseInteger(value: unknown): number {
  if (typeof value === 'number') return Math.floor(value);
  if (typeof value === 'string') return Number.parseInt(value, 10) || 0;
  return 0;
}

export function getEmptyInsights(): FacebookInsights {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cpm: 0,
    cpc: 0,
    conversions: 0,
    costPerConversion: 0,
    reach: 0,
    frequency: 0,
  };
}

export function mapInsightsRow(row: Record<string, unknown> | undefined): FacebookInsights {
  if (!row) return getEmptyInsights();
  return {
    spend: parseNumber(row.spend),
    impressions: parseInteger(row.impressions),
    clicks: parseInteger(row.clicks),
    ctr: parseNumber(row.ctr),
    cpm: parseNumber(row.cpm),
    cpc: parseNumber(row.cpc),
    conversions: parseInteger(row.conversions),
    costPerConversion: parseNumber(row.cost_per_conversion),
    reach: parseInteger(row.reach),
    frequency: parseNumber(row.frequency),
  };
}

export class InsightsApi {
  private readonly graphClient: GraphClient;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(graphClient: GraphClient, cacheTtlMs: number) {
    this.graphClient = graphClient;
    this.cacheTtlMs = cacheTtlMs;
  }

  async getInsights(ctx: RequestContext, params: GetInsightsParams): Promise<FacebookInsights> {
    const targetId =
      params.level === 'account'
        ? params.accountId
        : params.level === 'campaign'
          ? params.campaignId
          : params.level === 'adset'
            ? params.adSetId
            : params.adId;

    if (!targetId) {
      throw new Error(`Missing required ID for insights level "${params.level}"`);
    }

    const fields = params.fields || [
      'spend',
      'impressions',
      'clicks',
      'ctr',
      'cpm',
      'cpc',
      'conversions',
      'cost_per_conversion',
      'reach',
      'frequency',
    ];

    const cacheKey = this.buildCacheKey(ctx, params.level, targetId, params.datePreset, fields);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const response = await this.graphClient.request<{ data?: Record<string, unknown>[] }>(ctx, {
      method: 'GET',
      path: `${targetId}/insights`,
      query: {
        fields: fields.join(','),
        date_preset: params.datePreset || 'last_30d',
      },
    });

    const row = response.data?.data?.[0];
    const mapped = mapInsightsRow(row);
    this.cache.set(cacheKey, {
      expiresAt: Date.now() + this.cacheTtlMs,
      value: mapped,
    });

    return mapped;
  }

  private buildCacheKey(
    ctx: RequestContext,
    level: string,
    targetId: string,
    datePreset: string | undefined,
    fields: string[]
  ): string {
    const stableFields = [...fields].sort().join(',');
    return `${ctx.tenantId}:${level}:${targetId}:${datePreset || 'last_30d'}:${stableFields}`;
  }
}
