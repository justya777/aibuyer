import type {
  CreateAdSetParams,
  DuplicateAdSetOptions,
  FacebookAdSet,
  GetAdSetsParams,
  UpdateAdSetParams,
} from '../types/facebook.js';
import { GraphClient } from './core/graph-client.js';
import { PageResolver } from './core/page-resolution.js';
import { normalizeAdAccountId } from './core/tenant-registry.js';
import type { RequestContext } from './core/types.js';
import { DsaService, extractCountryCodesFromTargeting, isEuTargeting } from './dsa.js';
import { TargetingApi, parseGenderFromInput } from './targeting.js';

function mapAdSetStatus(status: string): 'active' | 'paused' | 'deleted' {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE':
      return 'active';
    case 'DELETED':
      return 'deleted';
    default:
      return 'paused';
  }
}

function extractFlexibleSegments(
  targeting: Record<string, unknown>,
  field: 'interests' | 'behaviors' | 'custom_audiences'
): Array<Record<string, unknown>> {
  const direct = Array.isArray(targeting[field]) ? (targeting[field] as Array<Record<string, unknown>>) : [];
  const flexibleSpec = Array.isArray(targeting.flexible_spec)
    ? (targeting.flexible_spec as Array<Record<string, unknown>>)
    : [];
  const fromFlexible = flexibleSpec
    .flatMap((spec) => (Array.isArray(spec[field]) ? (spec[field] as Array<Record<string, unknown>>) : []));
  return [...direct, ...fromFlexible];
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value) || 0;
  return 0;
}

function normalizePromotedObjectInput(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const pageId =
    typeof raw.pageId === 'string'
      ? raw.pageId
      : typeof raw.page_id === 'string'
        ? raw.page_id
        : undefined;
  const pixelId =
    typeof raw.pixelId === 'string'
      ? raw.pixelId
      : typeof raw.pixel_id === 'string'
        ? raw.pixel_id
        : undefined;
  const customEventType =
    typeof raw.customEventType === 'string'
      ? raw.customEventType
      : typeof raw.custom_event_type === 'string'
        ? raw.custom_event_type
        : undefined;

  const promotedObject: Record<string, unknown> = {};
  if (pageId) promotedObject.page_id = pageId;
  if (pixelId) promotedObject.pixel_id = pixelId;
  if (customEventType) promotedObject.custom_event_type = customEventType;
  return Object.keys(promotedObject).length > 0 ? promotedObject : null;
}

function mapAdSet(record: Record<string, unknown>): FacebookAdSet {
  const targeting = (record.targeting || {}) as Record<string, unknown>;
  const geoLocations = (targeting.geo_locations || {}) as Record<string, unknown>;
  const interests = extractFlexibleSegments(targeting, 'interests');
  const behaviors = extractFlexibleSegments(targeting, 'behaviors');
  const customAudiences = extractFlexibleSegments(targeting, 'custom_audiences');

  return {
    id: String(record.id || ''),
    accountId: normalizeAdAccountId(String(record.account_id || '')),
    campaignId: String(record.campaign_id || ''),
    name: String(record.name || ''),
    status: mapAdSetStatus(String(record.status || 'PAUSED')),
    optimizationGoal: String(record.optimization_goal || ''),
    billingEvent: String(record.billing_event || ''),
    budget: {
      daily: record.daily_budget != null ? toNumber(record.daily_budget) : undefined,
      lifetime: record.lifetime_budget != null ? toNumber(record.lifetime_budget) : undefined,
      remaining:
        record.daily_budget != null
          ? toNumber(record.daily_budget)
          : record.lifetime_budget != null
            ? toNumber(record.lifetime_budget)
            : 0,
    },
    targeting: {
      countries: Array.isArray(geoLocations.countries)
        ? geoLocations.countries.map((country) => String(country))
        : [],
      ageMin: targeting.age_min != null ? Number(targeting.age_min) : undefined,
      ageMax: targeting.age_max != null ? Number(targeting.age_max) : undefined,
      gender: parseGenderFromInput(
        Array.isArray(targeting.genders)
          ? targeting.genders.map((gender) => Number(gender))
          : undefined
      ),
      interests: interests
        .map((interest) => ((interest || {}) as Record<string, unknown>).name)
        .filter(Boolean)
        .map((interest) => String(interest)),
      behaviors: behaviors
        .map((behavior) => ((behavior || {}) as Record<string, unknown>).name)
        .filter(Boolean)
        .map((behavior) => String(behavior)),
      customAudiences: customAudiences
        .map((audience) => ((audience || {}) as Record<string, unknown>).id)
        .filter(Boolean)
        .map((audience) => String(audience)),
      locales: Array.isArray(targeting.locales)
        ? targeting.locales.map((locale) => Number(locale)).filter((locale) => Number.isFinite(locale))
        : undefined,
    },
    performance: {
      spend: 0,
      impressions: 0,
      clicks: 0,
      ctr: 0,
      cpm: 0,
      cpc: 0,
      conversions: 0,
      costPerConversion: 0,
    },
    startDate: record.created_time ? new Date(String(record.created_time)) : new Date(),
    createdAt: record.created_time ? new Date(String(record.created_time)) : new Date(),
    updatedAt: record.updated_time ? new Date(String(record.updated_time)) : new Date(),
  };
}

export class AdSetsApi {
  private readonly graphClient: GraphClient;
  private readonly targetingApi: TargetingApi;
  private readonly dsaService: DsaService;
  private readonly pageResolver: PageResolver;

  constructor(
    graphClient: GraphClient,
    targetingApi: TargetingApi,
    dsaService?: DsaService,
    pageResolver: PageResolver = new PageResolver()
  ) {
    this.graphClient = graphClient;
    this.targetingApi = targetingApi;
    this.dsaService = dsaService || new DsaService(graphClient);
    this.pageResolver = pageResolver;
  }

  async getAdSets(ctx: RequestContext, params: GetAdSetsParams): Promise<FacebookAdSet[]> {
    const response = await this.graphClient.request<{ data?: Array<Record<string, unknown>> }>(ctx, {
      method: 'GET',
      path: `${params.campaignId}/adsets`,
      query: {
        limit: params.limit || 50,
        fields:
          'id,name,status,optimization_goal,billing_event,daily_budget,lifetime_budget,targeting,created_time,updated_time,campaign_id,account_id',
        effective_status: params.status?.join(','),
      },
    });
    return (response.data.data || []).map((record) => mapAdSet(record));
  }

  async getAdSetAccountId(ctx: RequestContext, adSetId: string): Promise<string> {
    const response = await this.graphClient.request<Record<string, unknown>>(ctx, {
      method: 'GET',
      path: adSetId,
      query: { fields: 'account_id' },
    });
    const accountId = String(response.data.account_id || '');
    if (!accountId) {
      throw new Error(`Could not resolve account_id for ad set ${adSetId}`);
    }
    return normalizeAdAccountId(accountId);
  }

  async getAdSetBudget(
    ctx: RequestContext,
    adSetId: string
  ): Promise<{ dailyBudget?: number; lifetimeBudget?: number }> {
    const response = await this.graphClient.request<Record<string, unknown>>(ctx, {
      method: 'GET',
      path: adSetId,
      query: { fields: 'daily_budget,lifetime_budget' },
    });
    return {
      dailyBudget:
        response.data.daily_budget != null ? toNumber(response.data.daily_budget) : undefined,
      lifetimeBudget:
        response.data.lifetime_budget != null ? toNumber(response.data.lifetime_budget) : undefined,
    };
  }

  async createAdSet(ctx: RequestContext, params: CreateAdSetParams): Promise<FacebookAdSet> {
    const accountId = normalizeAdAccountId(params.accountId);
    const payload: Record<string, unknown> = {
      name: params.name,
      campaign_id: params.campaignId,
      optimization_goal: params.optimizationGoal,
      billing_event: params.billingEvent,
      status: params.status || 'PAUSED',
    };

    let promotedObject = params.promotedObject
      ? normalizePromotedObjectInput(params.promotedObject)
      : null;
    if (this.requiresPromotedPageId(params, promotedObject)) {
      const explicitPageId =
        typeof promotedObject?.page_id === 'string' ? String(promotedObject.page_id) : undefined;
      const resolvedPageId = await this.pageResolver.resolvePageId(ctx, accountId, explicitPageId);
      promotedObject = {
        ...(promotedObject || {}),
        page_id: resolvedPageId,
      };
    }
    if (promotedObject) {
      payload.promoted_object = promotedObject;
    }

    if (params.dailyBudget != null) payload.daily_budget = params.dailyBudget;
    if (params.lifetimeBudget != null) payload.lifetime_budget = params.lifetimeBudget;
    if (params.bidAmount != null) payload.bid_amount = params.bidAmount;

    // Meta rejects requests that set both campaign-level and ad set-level budgets.
    // Keep validation at policy layer, but remove ad set budget at Graph layer when campaign budget exists.
    const campaignBudgetResponse = await this.graphClient.request<Record<string, unknown>>(ctx, {
      method: 'GET',
      path: params.campaignId,
      query: { fields: 'daily_budget,lifetime_budget' },
    });
    const hasCampaignBudget =
      campaignBudgetResponse.data.daily_budget != null ||
      campaignBudgetResponse.data.lifetime_budget != null;
    if (hasCampaignBudget) {
      delete payload.daily_budget;
      delete payload.lifetime_budget;
    }

    const targeting = await this.targetingApi.buildAdSetTargeting(ctx, params.targeting);
    if (targeting) {
      payload.targeting = targeting;
      await this.attachDsaComplianceIfNeeded(ctx, accountId, payload, targeting);
    }

    const response = await this.graphClient.request<{ id?: string }>(ctx, {
      method: 'POST',
      path: `${accountId}/adsets`,
      body: payload,
    });

    if (!response.data.id) {
      throw new Error('Facebook API did not return ad set id');
    }

    return this.readAdSetById(ctx, response.data.id);
  }

  async updateAdSet(ctx: RequestContext, params: UpdateAdSetParams): Promise<FacebookAdSet> {
    const payload: Record<string, unknown> = {};
    if (params.name != null) payload.name = params.name;
    if (params.status != null) payload.status = params.status;
    if (params.optimizationGoal != null) payload.optimization_goal = params.optimizationGoal;
    if (params.billingEvent != null) payload.billing_event = params.billingEvent;
    if (params.dailyBudget != null) payload.daily_budget = params.dailyBudget;
    if (params.lifetimeBudget != null) payload.lifetime_budget = params.lifetimeBudget;

    await this.graphClient.request(ctx, {
      method: 'POST',
      path: params.adSetId,
      body: payload,
    });

    return this.readAdSetById(ctx, params.adSetId);
  }

  async duplicateAdSet(
    ctx: RequestContext,
    adSetId: string,
    options: Omit<DuplicateAdSetOptions, 'tenantId'>
  ): Promise<{ copiedAdSetId: string }> {
    const payload: Record<string, unknown> = {
      deep_copy: options.deepCopy ?? true,
      rename_strategy: options.renameStrategy || 'ONLY_TOP_LEVEL_RENAME',
      status_option: options.statusOption || 'PAUSED',
    };
    if (options.campaignId) payload.campaign_id = options.campaignId;
    if (options.renamePrefix) payload.rename_prefix = options.renamePrefix;
    if (options.renameSuffix) payload.rename_suffix = options.renameSuffix;

    const response = await this.graphClient.request<{ copied_adset_id?: string }>(ctx, {
      method: 'POST',
      path: `${adSetId}/copies`,
      body: payload,
    });

    if (!response.data.copied_adset_id) {
      throw new Error('Facebook API did not return copied_adset_id');
    }

    return { copiedAdSetId: response.data.copied_adset_id };
  }

  private async readAdSetById(ctx: RequestContext, adSetId: string): Promise<FacebookAdSet> {
    const response = await this.graphClient.request<Record<string, unknown>>(ctx, {
      method: 'GET',
      path: adSetId,
      query: {
        fields:
          'id,name,status,optimization_goal,billing_event,daily_budget,lifetime_budget,targeting,created_time,updated_time,campaign_id,account_id',
      },
    });
    return mapAdSet(response.data);
  }

  private async attachDsaComplianceIfNeeded(
    ctx: RequestContext,
    accountId: string,
    payload: Record<string, unknown>,
    targeting: Record<string, unknown>
  ): Promise<void> {
    const countries = extractCountryCodesFromTargeting(targeting);
    if (!isEuTargeting(countries)) {
      return;
    }

    const dsaSettings = await this.dsaService.ensureDsaForAdAccount(ctx, accountId);
    payload.dsa_beneficiary = dsaSettings.dsaBeneficiary;
    payload.dsa_payor = dsaSettings.dsaPayor;
  }

  private requiresPromotedPageId(
    params: CreateAdSetParams,
    promotedObject: Record<string, unknown> | null
  ): boolean {
    const optimizationGoal = String(params.optimizationGoal || '').toUpperCase();
    if (optimizationGoal.includes('LEAD')) {
      return true;
    }
    return typeof promotedObject?.page_id === 'string' && Boolean(promotedObject.page_id);
  }
}
