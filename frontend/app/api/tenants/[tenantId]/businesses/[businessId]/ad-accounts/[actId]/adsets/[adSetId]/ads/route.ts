import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MCPClient } from '@/lib/mcp-client';
import {
  AuthRequiredError,
  TenantAccessError,
  resolveTenantContext,
} from '@/lib/tenant-context';
import { cacheGet, cacheGetStale, cacheSet, isRateLimitMessage } from '@/lib/api-cache';
import type { AdAccountHierarchyAd, EntityPerformance } from '@/lib/shared-types';

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
  adId: string
): Promise<EntityPerformance> {
  try {
    const result = await mcpClient.callTool('get_insights', {
      level: 'ad',
      adId,
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

function handleError(error: unknown): NextResponse {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 401 });
  }
  if (error instanceof TenantAccessError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }
  return NextResponse.json(
    { success: false, error: error instanceof Error ? error.message : 'Failed to load ads.' },
    { status: 500 }
  );
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ tenantId: string; businessId: string; actId: string; adSetId: string }>;
  }
) {
  try {
    const { tenantId, businessId, actId, adSetId } = await params;
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

    const cacheKey = ['ads', adAccountId, adSetId];
    const cached = cacheGet<AdAccountHierarchyAd[]>(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, tenantId, businessId, adAccountId, adSetId, ads: cached });
    }

    const mcpClient = new MCPClient({
      tenantId,
      userId: context.userId,
      isPlatformAdmin: context.isPlatformAdmin,
    });
    let rawAds: unknown;
    try {
      rawAds = await mcpClient.callTool('get_ads', {
        adSetId,
        limit: 50,
        status: ['ACTIVE', 'PAUSED', 'ADSET_PAUSED', 'WITH_ISSUES', 'PENDING_REVIEW', 'IN_PROCESS', 'DISAPPROVED', 'PREAPPROVED'],
      });
    } catch (fetchError) {
      if (isRateLimitMessage(fetchError)) {
        const stale = cacheGetStale<AdAccountHierarchyAd[]>(cacheKey);
        if (stale) {
          return NextResponse.json({ success: true, tenantId, businessId, adAccountId, adSetId, ads: stale, rateLimited: true, retryAfterMs: 10000 });
        }
      }
      throw fetchError;
    }
    const source = Array.isArray(rawAds) ? rawAds : [];
    const ads: AdAccountHierarchyAd[] = await Promise.all(
      source.map(async (ad: any) => {
        const adId = String(ad?.id || '');
        return {
          id: adId,
          campaignId: String(ad?.campaignId || ''),
          adSetId: String(ad?.adSetId || adSetId),
          name: String(ad?.name || adId),
          status: ad?.status === 'active' || ad?.status === 'paused' ? ad.status : 'paused',
          creative: {
            title: typeof ad?.creative?.title === 'string' ? ad.creative.title : undefined,
            body: typeof ad?.creative?.body === 'string' ? ad.creative.body : undefined,
            imageUrl: typeof ad?.creative?.imageUrl === 'string' ? ad.creative.imageUrl : undefined,
            videoUrl: typeof ad?.creative?.videoUrl === 'string' ? ad.creative.videoUrl : undefined,
            linkUrl: typeof ad?.creative?.linkUrl === 'string' ? ad.creative.linkUrl : undefined,
          },
          performance: adId ? await getInsightsSafe(mcpClient, adId) : emptyPerformance(),
          createdAt: toIso(ad?.createdAt),
          updatedAt: toIso(ad?.updatedAt),
        };
      })
    );

    cacheSet(cacheKey, ads);
    return NextResponse.json({
      success: true,
      tenantId,
      businessId,
      adAccountId,
      adSetId,
      ads,
    });
  } catch (error) {
    return handleError(error);
  }
}
