import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MCPClient } from '@/lib/mcp-client';
import {
  AuthRequiredError,
  TenantAccessError,
  resolveTenantContext,
} from '@/lib/tenant-context';
import type { AdAccountHierarchyCampaign, EntityPerformance, TargetingSnapshot } from '@/lib/shared-types';

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
  campaignId: string
): Promise<EntityPerformance> {
  try {
    const result = await mcpClient.callTool('get_insights', {
      level: 'campaign',
      campaignId,
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
  return {
    countries: Array.isArray(raw?.countries) ? raw.countries.map((entry: unknown) => String(entry)) : [],
    ageMin: typeof raw?.ageMin === 'number' ? raw.ageMin : undefined,
    ageMax: typeof raw?.ageMax === 'number' ? raw.ageMax : undefined,
    gender: raw?.gender === 'male' || raw?.gender === 'female' || raw?.gender === 'all' ? raw.gender : 'all',
    interests: Array.isArray(raw?.interests) ? raw.interests.map((entry: unknown) => String(entry)) : [],
    behaviors: Array.isArray(raw?.behaviors) ? raw.behaviors.map((entry: unknown) => String(entry)) : [],
  };
}

function handleError(error: unknown): NextResponse {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 401 });
  }
  if (error instanceof TenantAccessError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }
  const message = error instanceof Error ? error.message : 'Failed to load campaign.';
  return NextResponse.json({ success: false, error: message }, { status: 500 });
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

    const mcpClient = new MCPClient({
      tenantId,
      userId: context.userId,
      isPlatformAdmin: context.isPlatformAdmin,
    });

    const raw: any = await mcpClient.callTool('get_campaign_by_id', { campaignId });
    if (!raw || !raw.id) {
      return NextResponse.json(
        { success: false, error: 'Campaign not found.' },
        { status: 404 }
      );
    }

    const actualAccountId = normalizeAdAccountId(String(raw.accountId || ''));
    const accountMismatch = actualAccountId !== '' && actualAccountId !== adAccountId;

    const performance = await getInsightsSafe(mcpClient, campaignId);

    const campaign: AdAccountHierarchyCampaign = {
      id: String(raw.id),
      accountId: actualAccountId || adAccountId,
      name: String(raw.name || campaignId),
      status: raw.status === 'active' || raw.status === 'paused' ? raw.status : 'paused',
      objective: String(raw.objective || ''),
      budget: {
        daily: typeof raw.budget?.daily === 'number' ? raw.budget.daily / 100 : undefined,
        lifetime: typeof raw.budget?.lifetime === 'number' ? raw.budget.lifetime / 100 : undefined,
        remaining: toNumber(raw.budget?.remaining) / 100,
      },
      targeting: mapTargeting(raw.targeting),
      targetingSummary: '',
      performance,
      adSets: [],
      startDate: raw.startDate ? toIso(raw.startDate) : undefined,
      createdAt: toIso(raw.createdAt),
      updatedAt: toIso(raw.updatedAt),
    };

    return NextResponse.json({
      success: true,
      tenantId,
      businessId,
      adAccountId,
      campaign,
      ...(accountMismatch ? { accountMismatch: true, actualAccountId } : {}),
    });
  } catch (error) {
    return handleError(error);
  }
}
