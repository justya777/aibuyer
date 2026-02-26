import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MCPClient } from '@/lib/mcp-client';
import {
  AuthRequiredError,
  TenantAccessError,
  resolveTenantContext,
} from '@/lib/tenant-context';
import { cacheGet, cacheGetStale, cacheSet, isRateLimitMessage, isCoolingDown, markCooldown, clearCooldown, TTL } from '@/lib/api-cache';
import type { AdAccountHierarchyAdSet, EntityPerformance, TargetingSnapshot } from '@/lib/shared-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function normalizeAdAccountId(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toIso(value: unknown): string {
  const parsed = new Date(typeof value === 'string' || typeof value === 'number' ? value : Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function emptyPerformance(): EntityPerformance {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cpm: 0,
    cpc: 0,
    conversions: 0,
    costPerConversion: 0,
  };
}

async function getInsightsSafe(
  mcpClient: MCPClient,
  adSetId: string
): Promise<EntityPerformance> {
  try {
    const result = await mcpClient.callTool('get_insights', {
      level: 'adset',
      adSetId,
      datePreset: 'last_7d',
    });
    if (!result || typeof result !== 'object') return emptyPerformance();
    return {
      spend: toNumber((result as any).spend),
      impressions: toNumber((result as any).impressions),
      clicks: toNumber((result as any).clicks),
      ctr: toNumber((result as any).ctr),
      cpm: toNumber((result as any).cpm),
      cpc: toNumber((result as any).cpc),
      conversions: toNumber((result as any).conversions),
      costPerConversion: toNumber((result as any).costPerConversion),
    };
  } catch {
    return emptyPerformance();
  }
}

function mapTargeting(raw: any): TargetingSnapshot {
  const gender: 'male' | 'female' | 'all' | undefined =
    raw?.gender === 'male' || raw?.gender === 'female' || raw?.gender === 'all' ? raw.gender : undefined;
  return {
    countries: Array.isArray(raw?.countries) ? raw.countries.map((entry: unknown) => String(entry)) : [],
    ageMin: typeof raw?.ageMin === 'number' ? raw.ageMin : undefined,
    ageMax: typeof raw?.ageMax === 'number' ? raw.ageMax : undefined,
    ...(gender ? { gender } : {}),
    interests: Array.isArray(raw?.interests) ? raw.interests.map((entry: unknown) => String(entry)) : [],
    behaviors: Array.isArray(raw?.behaviors) ? raw.behaviors.map((entry: unknown) => String(entry)) : [],
  };
}

function buildTargetingSummary(targeting: TargetingSnapshot): string {
  const hasAnyData =
    targeting.countries.length > 0 ||
    typeof targeting.ageMin === 'number' ||
    typeof targeting.ageMax === 'number' ||
    (targeting.gender && targeting.gender !== 'all') ||
    targeting.interests.length > 0;

  if (!hasAnyData) return '';

  const parts: string[] = [];
  if (targeting.countries.length > 0) {
    parts.push(targeting.countries.slice(0, 2).join(', '));
  }

  const isDefaultAge =
    (targeting.ageMin === 18 || targeting.ageMin === undefined) &&
    (targeting.ageMax === 65 || targeting.ageMax === undefined);
  const hasExplicitAge = (typeof targeting.ageMin === 'number' || typeof targeting.ageMax === 'number') && !isDefaultAge;
  const hasExplicitGender = targeting.gender === 'male' || targeting.gender === 'female';

  if (hasExplicitAge) {
    const genderLabel = hasExplicitGender
      ? (targeting.gender === 'male' ? 'Men' : 'Women')
      : '';
    const ageStr = `${targeting.ageMin ?? '?'}-${targeting.ageMax ?? '?'}`;
    parts.push(genderLabel ? `${genderLabel} ${ageStr}` : ageStr);
  } else if (hasExplicitGender) {
    parts.push(targeting.gender === 'male' ? 'Men' : 'Women');
  }

  return parts.join(' \u2022 ');
}

function handleError(error: unknown): NextResponse {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 401 });
  }
  if (error instanceof TenantAccessError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }
  return NextResponse.json(
    { success: false, error: error instanceof Error ? error.message : 'Failed to load ad sets.' },
    { status: 500 }
  );
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ tenantId: string; businessId: string; actId: string; campaignId: string }>;
  }
) {
  try {
    const { tenantId, businessId, actId, campaignId } = await params;
    const adAccountId = normalizeAdAccountId(actId);
    const context = await resolveTenantContext(request, { allowAdminCrossTenant: true });
    if (!context.isPlatformAdmin && context.tenantId !== tenantId) {
      throw new TenantAccessError('Tenant access denied.');
    }

    const adAccount = await db.tenantAdAccount.findFirst({
      where: { tenantId, businessId, adAccountId },
      select: { adAccountId: true },
    });
    if (!adAccount) {
      return NextResponse.json(
        { success: false, error: `Ad account ${adAccountId} is not mapped to business ${businessId}.` },
        { status: 404 }
      );
    }

    const cacheKey = ['adsets', adAccountId, campaignId];
    const cached = cacheGet<AdAccountHierarchyAdSet[]>(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, tenantId, businessId, adAccountId, campaignId, adSets: cached });
    }

    const cooldown = isCoolingDown(adAccountId);
    if (cooldown.cooling) {
      const stale = cacheGetStale<AdAccountHierarchyAdSet[]>(cacheKey);
      if (stale) {
        return NextResponse.json({ success: true, tenantId, businessId, adAccountId, campaignId, adSets: stale, rateLimited: true, retryAfterMs: cooldown.retryAfterMs });
      }
      return NextResponse.json(
        { success: false, error: 'Rate limit cooldown active.', rateLimited: true, retryAfterMs: cooldown.retryAfterMs },
        { status: 429 }
      );
    }

    const mcpClient = new MCPClient({
      tenantId,
      userId: context.userId,
      isPlatformAdmin: context.isPlatformAdmin,
    });
    let rawAdSets: unknown;
    try {
      rawAdSets = await mcpClient.callTool('get_adsets', {
        campaignId,
        limit: 50,
        status: ['ACTIVE', 'PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED'],
      });
      clearCooldown(adAccountId);
    } catch (fetchError) {
      if (isRateLimitMessage(fetchError)) {
        const retryAfterMs = markCooldown(adAccountId);
        const stale = cacheGetStale<AdAccountHierarchyAdSet[]>(cacheKey);
        if (stale) {
          return NextResponse.json({ success: true, tenantId, businessId, adAccountId, campaignId, adSets: stale, rateLimited: true, retryAfterMs });
        }
      }
      throw fetchError;
    }
    const source = Array.isArray(rawAdSets) ? rawAdSets : [];
    const adSets: AdAccountHierarchyAdSet[] = await Promise.all(
      source.map(async (adSet: any) => {
        const adSetId = String(adSet?.id || '');
        const targeting = mapTargeting(adSet?.targeting);
        return {
          id: adSetId,
          campaignId: String(adSet?.campaignId || campaignId),
          name: String(adSet?.name || adSetId),
          status: adSet?.status === 'active' || adSet?.status === 'paused' ? adSet.status : 'paused',
          optimizationGoal: String(adSet?.optimizationGoal || ''),
          billingEvent: String(adSet?.billingEvent || ''),
          budget: {
            daily: typeof adSet?.budget?.daily === 'number' ? adSet.budget.daily / 100 : undefined,
            lifetime: typeof adSet?.budget?.lifetime === 'number' ? adSet.budget.lifetime / 100 : undefined,
            remaining: toNumber(adSet?.budget?.remaining) / 100,
          },
          targeting,
          targetingSummary: buildTargetingSummary(targeting),
          performance: adSetId ? await getInsightsSafe(mcpClient, adSetId) : emptyPerformance(),
          ads: [],
          createdAt: toIso(adSet?.createdAt),
          updatedAt: toIso(adSet?.updatedAt),
        };
      })
    );

    cacheSet(cacheKey, adSets);
    return NextResponse.json({
      success: true,
      tenantId,
      businessId,
      adAccountId,
      campaignId,
      adSets,
    });
  } catch (error) {
    return handleError(error);
  }
}
