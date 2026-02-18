import type {
  CreateCampaignParams,
  DuplicateCampaignOptions,
  FacebookCampaign,
  GetCampaignsParams,
  UpdateCampaignParams,
} from '../types/facebook.js';
import { normalizeAdAccountId } from './core/tenant-registry.js';
import type { RequestContext } from './core/types.js';
import { GraphClient } from './core/graph-client.js';

function mapCampaignStatus(status: string): 'active' | 'paused' | 'deleted' {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE':
      return 'active';
    case 'DELETED':
      return 'deleted';
    default:
      return 'paused';
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value) || 0;
  return 0;
}

function mapCampaign(record: Record<string, unknown>): FacebookCampaign {
  return {
    id: String(record.id || ''),
    accountId: normalizeAdAccountId(String(record.account_id || '')),
    name: String(record.name || ''),
    status: mapCampaignStatus(String(record.status || 'PAUSED')),
    objective: String(record.objective || ''),
    budget: {
      daily: record.daily_budget != null ? toNumber(record.daily_budget) : undefined,
      lifetime: record.lifetime_budget != null ? toNumber(record.lifetime_budget) : undefined,
      remaining: toNumber(record.budget_remaining),
    },
    targeting: {
      countries: [],
      gender: 'all',
      interests: [],
      behaviors: [],
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
    startDate: record.start_time ? new Date(String(record.start_time)) : new Date(),
    endDate: record.stop_time ? new Date(String(record.stop_time)) : undefined,
    createdAt: record.created_time ? new Date(String(record.created_time)) : new Date(),
    updatedAt: record.updated_time ? new Date(String(record.updated_time)) : new Date(),
  };
}

export class CampaignsApi {
  private readonly graphClient: GraphClient;

  constructor(graphClient: GraphClient) {
    this.graphClient = graphClient;
  }

  async getCampaigns(ctx: RequestContext, params: GetCampaignsParams): Promise<FacebookCampaign[]> {
    const accountId = normalizeAdAccountId(params.accountId);
    const response = await this.graphClient.request<{ data?: Array<Record<string, unknown>> }>(ctx, {
      method: 'GET',
      path: `${accountId}/campaigns`,
      query: {
        limit: params.limit || 50,
        fields:
          'id,name,status,objective,account_id,created_time,updated_time,start_time,stop_time,daily_budget,lifetime_budget,budget_remaining',
        effective_status:
          params.status?.join(',') ||
          'ACTIVE,PAUSED,PENDING_REVIEW,DISAPPROVED,PREAPPROVED,PENDING_BILLING_INFO,CAMPAIGN_PAUSED,ADSET_PAUSED,IN_PROCESS,WITH_ISSUES',
      },
    });

    return (response.data.data || []).map((campaign) => mapCampaign(campaign));
  }

  async getCampaignAccountId(ctx: RequestContext, campaignId: string): Promise<string> {
    const response = await this.graphClient.request<Record<string, unknown>>(ctx, {
      method: 'GET',
      path: campaignId,
      query: { fields: 'account_id' },
    });
    const accountId = String(response.data.account_id || '');
    if (!accountId) {
      throw new Error(`Could not resolve account_id for campaign ${campaignId}`);
    }
    return normalizeAdAccountId(accountId);
  }

  async getCampaignBudget(
    ctx: RequestContext,
    campaignId: string
  ): Promise<{ dailyBudget?: number; lifetimeBudget?: number }> {
    const response = await this.graphClient.request<Record<string, unknown>>(ctx, {
      method: 'GET',
      path: campaignId,
      query: { fields: 'daily_budget,lifetime_budget' },
    });
    return {
      dailyBudget:
        response.data.daily_budget != null ? toNumber(response.data.daily_budget) : undefined,
      lifetimeBudget:
        response.data.lifetime_budget != null ? toNumber(response.data.lifetime_budget) : undefined,
    };
  }

  async createCampaign(ctx: RequestContext, params: CreateCampaignParams): Promise<FacebookCampaign> {
    const accountId = normalizeAdAccountId(params.accountId);
    const payload: Record<string, unknown> = {
      name: params.name,
      objective: params.objective,
      status: params.status || 'PAUSED',
      special_ad_categories: [],
    };

    if (params.dailyBudget != null) payload.daily_budget = params.dailyBudget;
    if (params.lifetimeBudget != null) payload.lifetime_budget = params.lifetimeBudget;

    const response = await this.graphClient.request<{ id?: string }>(ctx, {
      method: 'POST',
      path: `${accountId}/campaigns`,
      body: payload,
    });

    if (!response.data.id) {
      throw new Error('Facebook API did not return campaign id');
    }
    return this.readCampaignById(ctx, response.data.id);
  }

  async updateCampaign(ctx: RequestContext, params: UpdateCampaignParams): Promise<FacebookCampaign> {
    const payload: Record<string, unknown> = {};
    if (params.name != null) payload.name = params.name;
    if (params.status != null) payload.status = params.status;
    if (params.dailyBudget != null) payload.daily_budget = params.dailyBudget;
    if (params.lifetimeBudget != null) payload.lifetime_budget = params.lifetimeBudget;

    await this.graphClient.request(ctx, {
      method: 'POST',
      path: params.campaignId,
      body: payload,
    });

    return this.readCampaignById(ctx, params.campaignId);
  }

  async duplicateCampaign(
    ctx: RequestContext,
    campaignId: string,
    options: Omit<DuplicateCampaignOptions, 'tenantId'>
  ): Promise<{ copiedCampaignId: string }> {
    const payload: Record<string, unknown> = {
      deep_copy: options.deepCopy ?? true,
      rename_strategy: options.renameStrategy || 'ONLY_TOP_LEVEL_RENAME',
      status_option: options.statusOption || 'PAUSED',
    };
    if (options.renamePrefix) payload.rename_prefix = options.renamePrefix;
    if (options.renameSuffix) payload.rename_suffix = options.renameSuffix;

    const response = await this.graphClient.request<{ copied_campaign_id?: string }>(ctx, {
      method: 'POST',
      path: `${campaignId}/copies`,
      body: payload,
    });

    if (!response.data.copied_campaign_id) {
      throw new Error('Facebook API did not return copied_campaign_id');
    }

    return { copiedCampaignId: response.data.copied_campaign_id };
  }

  private async readCampaignById(ctx: RequestContext, campaignId: string): Promise<FacebookCampaign> {
    const response = await this.graphClient.request<Record<string, unknown>>(ctx, {
      method: 'GET',
      path: campaignId,
      query: {
        fields:
          'id,name,status,objective,account_id,daily_budget,lifetime_budget,budget_remaining,created_time,updated_time,start_time,stop_time',
      },
    });
    return mapCampaign(response.data);
  }
}
