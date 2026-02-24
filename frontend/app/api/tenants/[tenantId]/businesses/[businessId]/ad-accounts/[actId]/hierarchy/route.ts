import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MCPClient } from '@/lib/mcp-client';
import {
  AuthRequiredError,
  TenantAccessError,
  resolveTenantContext,
} from '@/lib/tenant-context';
import type {
  AdAccountHierarchyAd,
  AdAccountHierarchyAdSet,
  AdAccountHierarchyCampaign,
  AdAccountHierarchyPayload,
  EntityPerformance,
  TargetingSnapshot,
} from '@/lib/shared-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  RO: 'Romania',
  US: 'United States',
  GB: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  IT: 'Italy',
  ES: 'Spain',
  NL: 'Netherlands',
  PL: 'Poland',
};

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

function mapPerformance(raw: any): EntityPerformance {
  if (!raw || typeof raw !== 'object') return emptyPerformance();
  return {
    spend: toNumber(raw.spend),
    impressions: toNumber(raw.impressions),
    clicks: toNumber(raw.clicks),
    ctr: toNumber(raw.ctr),
    cpm: toNumber(raw.cpm),
    cpc: toNumber(raw.cpc),
    conversions: toNumber(raw.conversions),
    costPerConversion: toNumber(raw.costPerConversion),
  };
}

function mapTargeting(raw: any): TargetingSnapshot {
  const countries = Array.isArray(raw?.countries) ? raw.countries.map((v: unknown) => String(v)) : [];
  const interests = Array.isArray(raw?.interests) ? raw.interests.map((v: unknown) => String(v)) : [];
  const behaviors = Array.isArray(raw?.behaviors) ? raw.behaviors.map((v: unknown) => String(v)) : [];
  const gender = raw?.gender === 'male' || raw?.gender === 'female' || raw?.gender === 'all' ? raw.gender : 'all';
  const ageMin = typeof raw?.ageMin === 'number' ? raw.ageMin : undefined;
  const ageMax = typeof raw?.ageMax === 'number' ? raw.ageMax : undefined;
  return {
    countries,
    gender,
    ageMin,
    ageMax,
    interests,
    behaviors,
  };
}

function mapCountry(codeOrName: string): string {
  const uppercase = codeOrName.toUpperCase().trim();
  return COUNTRY_CODE_TO_NAME[uppercase] || codeOrName;
}

function buildTargetingSummary(targeting: TargetingSnapshot): string {
  const countryLabel =
    targeting.countries.length > 0
      ? targeting.countries.slice(0, 2).map(mapCountry).join(', ')
      : 'All countries';
  const genderLabel =
    targeting.gender === 'male' ? 'Men' : targeting.gender === 'female' ? 'Women' : 'All genders';
  const ageLabel =
    typeof targeting.ageMin === 'number' || typeof targeting.ageMax === 'number'
      ? `${targeting.ageMin ?? 18}-${targeting.ageMax ?? 65}`
      : '18-65';
  const interestLabel = targeting.interests.length > 0 ? targeting.interests[0] : 'Broad audience';
  return `${countryLabel} • ${genderLabel} ${ageLabel} • ${interestLabel}`;
}

function mergeCampaignTargetingFromAdSets(adSets: AdAccountHierarchyAdSet[]): TargetingSnapshot {
  const countrySet = new Set<string>();
  const interestSet = new Set<string>();
  const behaviorSet = new Set<string>();
  const genders = new Set<'male' | 'female' | 'all'>();
  let ageMin: number | undefined;
  let ageMax: number | undefined;

  for (const adSet of adSets) {
    for (const country of adSet.targeting.countries) countrySet.add(country);
    for (const interest of adSet.targeting.interests) interestSet.add(interest);
    for (const behavior of adSet.targeting.behaviors) behaviorSet.add(behavior);
    if (adSet.targeting.gender) genders.add(adSet.targeting.gender);
    if (typeof adSet.targeting.ageMin === 'number') {
      ageMin = typeof ageMin === 'number' ? Math.min(ageMin, adSet.targeting.ageMin) : adSet.targeting.ageMin;
    }
    if (typeof adSet.targeting.ageMax === 'number') {
      ageMax = typeof ageMax === 'number' ? Math.max(ageMax, adSet.targeting.ageMax) : adSet.targeting.ageMax;
    }
  }

  const gender: 'male' | 'female' | 'all' =
    genders.size === 1 ? (Array.from(genders)[0] as 'male' | 'female' | 'all') : 'all';

  return {
    countries: Array.from(countrySet),
    gender,
    ageMin,
    ageMax,
    interests: Array.from(interestSet),
    behaviors: Array.from(behaviorSet),
  };
}

async function getInsightsSafe(
  mcpClient: MCPClient,
  params: { level: 'account' | 'campaign' | 'adset' | 'ad'; accountId?: string; campaignId?: string; adSetId?: string; adId?: string }
): Promise<EntityPerformance> {
  try {
    const result = await mcpClient.callTool('get_insights', {
      ...params,
      datePreset: 'last_7d',
    });
    return mapPerformance(result);
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
    { success: false, error: error instanceof Error ? error.message : 'Failed to load ad account hierarchy.' },
    { status: 500 }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; businessId: string; actId: string }> }
) {
  try {
    const { tenantId, businessId, actId } = await params;
    const adAccountId = normalizeAdAccountId(actId);
    const context = await resolveTenantContext(request, { allowAdminCrossTenant: true });
    if (!context.isPlatformAdmin && context.tenantId !== tenantId) {
      throw new TenantAccessError('Tenant access denied.');
    }

    const [business, adAccount, settings] = await Promise.all([
      db.businessPortfolio.findUnique({
        where: { tenantId_businessId: { tenantId, businessId } },
        select: { businessId: true },
      }),
      db.tenantAdAccount.findFirst({
        where: { tenantId, businessId, adAccountId },
        select: {
          adAccountId: true,
          name: true,
          status: true,
          currency: true,
          timezoneName: true,
        },
      }),
      db.adAccountSettings.findUnique({
        where: { tenantId_adAccountId: { tenantId, adAccountId } },
        select: {
          defaultPageId: true,
          dsaBeneficiary: true,
          dsaPayor: true,
        },
      }),
    ]);

    if (!business) {
      return NextResponse.json(
        { success: false, error: `Business ${businessId} is not mapped to tenant ${tenantId}.` },
        { status: 404 }
      );
    }
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

    const accountInsights = await getInsightsSafe(mcpClient, {
      level: 'account',
      accountId: adAccountId,
    });

    const rawCampaigns = await mcpClient.callTool('get_campaigns', {
      accountId: adAccountId,
      limit: 50,
      status: ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'WITH_ISSUES', 'IN_PROCESS'],
    });
    const campaignsSource = Array.isArray(rawCampaigns) ? rawCampaigns : [];

    const campaigns: AdAccountHierarchyCampaign[] = await Promise.all(
      campaignsSource.map(async (campaign: any) => {
        const campaignId = String(campaign?.id || '');
        const campaignInsights = await getInsightsSafe(mcpClient, {
          level: 'campaign',
          campaignId,
        });

        let rawAdSets: any[] = [];
        try {
          const adSetResult = await mcpClient.callTool('get_adsets', {
            campaignId,
            limit: 50,
            status: ['ACTIVE', 'PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES'],
          });
          rawAdSets = Array.isArray(adSetResult) ? adSetResult : [];
        } catch {
          rawAdSets = [];
        }

        const adSets: AdAccountHierarchyAdSet[] = await Promise.all(
          rawAdSets.map(async (adSet: any) => {
            const adSetId = String(adSet?.id || '');
            const adSetInsights = await getInsightsSafe(mcpClient, {
              level: 'adset',
              adSetId,
            });

            let rawAds: any[] = [];
            try {
              const adResult = await mcpClient.callTool('get_ads', {
                adSetId,
                limit: 50,
                status: ['ACTIVE', 'PAUSED', 'ADSET_PAUSED', 'WITH_ISSUES'],
              });
              rawAds = Array.isArray(adResult) ? adResult : [];
            } catch {
              rawAds = [];
            }

            const ads: AdAccountHierarchyAd[] = await Promise.all(
              rawAds.map(async (ad: any) => {
                const adId = String(ad?.id || '');
                const adInsights = await getInsightsSafe(mcpClient, {
                  level: 'ad',
                  adId,
                });
                return {
                  id: adId,
                  campaignId: String(ad?.campaignId || campaignId),
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
                  performance: adInsights,
                  createdAt: toIso(ad?.createdAt),
                  updatedAt: toIso(ad?.updatedAt),
                };
              })
            );

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
                lifetime:
                  typeof adSet?.budget?.lifetime === 'number' ? adSet.budget.lifetime / 100 : undefined,
                remaining: toNumber(adSet?.budget?.remaining) / 100,
              },
              targeting,
              targetingSummary: buildTargetingSummary(targeting),
              performance: adSetInsights,
              ads,
              createdAt: toIso(adSet?.createdAt),
              updatedAt: toIso(adSet?.updatedAt),
            };
          })
        );

        const rawCampaignTargeting = mapTargeting(campaign?.targeting);
        const shouldUseAdSetTargeting =
          rawCampaignTargeting.countries.length === 0 &&
          rawCampaignTargeting.interests.length === 0 &&
          rawCampaignTargeting.behaviors.length === 0 &&
          typeof rawCampaignTargeting.ageMin !== 'number' &&
          typeof rawCampaignTargeting.ageMax !== 'number';
        const targeting = shouldUseAdSetTargeting ? mergeCampaignTargetingFromAdSets(adSets) : rawCampaignTargeting;

        return {
          id: campaignId,
          accountId: String(campaign?.accountId || adAccountId),
          name: String(campaign?.name || campaignId),
          status:
            campaign?.status === 'active' || campaign?.status === 'paused' ? campaign.status : 'paused',
          objective: String(campaign?.objective || ''),
          budget: {
            daily:
              typeof campaign?.budget?.daily === 'number' ? campaign.budget.daily / 100 : undefined,
            lifetime:
              typeof campaign?.budget?.lifetime === 'number' ? campaign.budget.lifetime / 100 : undefined,
            remaining: toNumber(campaign?.budget?.remaining) / 100,
          },
          targeting,
          targetingSummary: buildTargetingSummary(targeting),
          performance: campaignInsights,
          adSets,
          startDate: campaign?.startDate ? toIso(campaign.startDate) : undefined,
          createdAt: toIso(campaign?.createdAt),
          updatedAt: toIso(campaign?.updatedAt),
        };
      })
    );

    const allAdSets = campaigns.flatMap((campaign) => campaign.adSets);
    const allAds = allAdSets.flatMap((adSet) => adSet.ads);

    const payload: AdAccountHierarchyPayload = {
      adAccount: {
        adAccountId: adAccount.adAccountId,
        name: adAccount.name || adAccount.adAccountId,
        status: adAccount.status || null,
        defaultPageId: settings?.defaultPageId || null,
        dsaBeneficiary: settings?.dsaBeneficiary || null,
        dsaPayor: settings?.dsaPayor || null,
        dsaConfigured: Boolean(settings?.dsaBeneficiary && settings?.dsaPayor),
      },
      quickMetrics: {
        spend7d: accountInsights.spend,
        ctr7d: accountInsights.ctr,
        activeCampaigns: campaigns.filter((campaign) => campaign.status === 'active').length,
        activeAdSets: allAdSets.filter((adSet) => adSet.status === 'active').length,
        activeAds: allAds.filter((ad) => ad.status === 'active').length,
      },
      health: {
        billingOk: String(adAccount.status || '').toUpperCase() !== 'DISABLED',
        dsaOk: Boolean(settings?.dsaBeneficiary && settings?.dsaPayor),
        pageConnected: Boolean(settings?.defaultPageId),
      },
      campaigns,
      adSets: allAdSets,
      ads: allAds,
    };

    return NextResponse.json({
      success: true,
      tenantId,
      businessId,
      adAccountId,
      ...payload,
    });
  } catch (error) {
    return handleError(error);
  }
}
