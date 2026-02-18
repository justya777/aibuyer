import type {
  CreateAdParams,
  CreateAdSetParams,
  CreateCampaignParams,
  DuplicateAdOptions,
  DuplicateAdSetOptions,
  DuplicateCampaignOptions,
  FacebookAccount,
  FacebookAd,
  FacebookAdSet,
  FacebookCampaign,
  FacebookInsights,
  FacebookPage,
  GetAccountsParams,
  GetAdSetsParams,
  GetAdsParams,
  GetCampaignsParams,
  GetInsightsParams,
  GetPagesParams,
  UpdateAdParams,
  UpdateAdSetParams,
  UpdateCampaignParams,
} from '../types/facebook.js';
import { getEnvConfig, type EnvConfig } from '../config/env.js';
import { AccountsApi } from './accounts.js';
import { AdSetsApi } from './adsets.js';
import { AdsApi } from './ads.js';
import { CampaignsApi } from './campaigns.js';
import { GraphClient } from './core/graph-client.js';
import { PolicyEngine } from './core/policy-engine.js';
import { TenantRegistry } from './core/tenant-registry.js';
import type { RequestContext } from './core/types.js';
import { EnvTokenProvider } from './core/token-provider.js';
import { InsightsApi } from './insights.js';
import { TargetingApi } from './targeting.js';

type MutationWithWarnings<T> = T & { policyWarnings?: string[] };

interface FacadeDependencies {
  env?: EnvConfig;
  tenantRegistry?: TenantRegistry;
  graphClient?: GraphClient;
  policyEngine?: PolicyEngine;
}

export class FacebookServiceFacade {
  private readonly env: EnvConfig;
  private readonly tenantRegistry: TenantRegistry;
  private readonly graphClient: GraphClient;
  private readonly policyEngine: PolicyEngine;
  private readonly accountsApi: AccountsApi;
  private readonly campaignsApi: CampaignsApi;
  private readonly targetingApi: TargetingApi;
  private readonly adSetsApi: AdSetsApi;
  private readonly adsApi: AdsApi;
  private readonly insightsApi: InsightsApi;

  constructor(deps: FacadeDependencies = {}) {
    this.env = deps.env || getEnvConfig();
    this.tenantRegistry = deps.tenantRegistry || new TenantRegistry(this.env.tenantAccessMap);

    const tokenProvider = new EnvTokenProvider(this.env.tenantTokenMap, this.tenantRegistry);
    this.graphClient =
      deps.graphClient ||
      new GraphClient(tokenProvider, {
        apiVersion: this.env.graphApiVersion,
        retry: this.env.graphRetry,
      });

    this.policyEngine = deps.policyEngine || new PolicyEngine(this.env.policy);
    this.targetingApi = new TargetingApi(this.graphClient);
    this.accountsApi = new AccountsApi(this.graphClient);
    this.campaignsApi = new CampaignsApi(this.graphClient);
    this.adSetsApi = new AdSetsApi(this.graphClient, this.targetingApi, {
      dsaBeneficiary: this.env.fbDsaBeneficiary,
      dsaPayor: this.env.fbDsaPayor,
    });
    this.adsApi = new AdsApi(this.graphClient, { defaultPageId: this.env.fbPageId });
    this.insightsApi = new InsightsApi(this.graphClient, this.env.insightsCacheTtlMs);
  }

  getTenantRegistry(): TenantRegistry {
    return this.tenantRegistry;
  }

  inferTenantIdByAdAccount(adAccountId: string): string | undefined {
    return this.tenantRegistry.inferTenantIdByAdAccount(adAccountId);
  }

  async getAccounts(params: GetAccountsParams): Promise<FacebookAccount[]> {
    const tenantId = this.requireTenantForTenantOnlyReads(params.tenantId, 'get_accounts');
    const ctx = this.buildContext(tenantId);
    const allowedAdAccountIds = this.tenantRegistry.getAllowedAdAccountIds(tenantId);
    return this.accountsApi.getAccounts(ctx, params, allowedAdAccountIds);
  }

  async getPages(params: GetPagesParams = {}): Promise<FacebookPage[]> {
    const tenantId = this.requireTenantForTenantOnlyReads(params.tenantId, 'get_pages');
    const ctx = this.buildContext(tenantId);
    return this.accountsApi.getPages(ctx, params);
  }

  async getPromotablePages(
    accountId: string,
    tenantId?: string
  ): Promise<Array<{ id: string; name: string; canPromote: boolean }>> {
    const resolvedTenantId = this.resolveTenantByAccount(accountId, tenantId, 'get_promotable_pages');
    this.tenantRegistry.assertAdAccountAllowed(resolvedTenantId, accountId);
    const ctx = this.buildContext(resolvedTenantId, accountId);
    return this.accountsApi.getPromotablePages(ctx, accountId);
  }

  async getCampaigns(params: GetCampaignsParams): Promise<FacebookCampaign[]> {
    const tenantId = this.resolveTenantByAccount(params.accountId, params.tenantId, 'get_campaigns');
    this.tenantRegistry.assertAdAccountAllowed(tenantId, params.accountId);
    const ctx = this.buildContext(tenantId, params.accountId);
    return this.campaignsApi.getCampaigns(ctx, params);
  }

  async createCampaign(params: CreateCampaignParams): Promise<MutationWithWarnings<FacebookCampaign>> {
    this.tenantRegistry.assertAdAccountAllowed(params.tenantId, params.accountId);
    const ctx = this.buildContext(params.tenantId, params.accountId);
    const evaluation = this.policyEngine.evaluateMutation({
      tenantId: params.tenantId,
      operation: 'create_campaign',
      requireExplicitBudget: true,
      nextBudget: {
        dailyBudget: params.dailyBudget,
        lifetimeBudget: params.lifetimeBudget,
      },
      nextStatus: params.status,
      targeting: {
        ageMin: params.targeting?.ageMin,
        ageMax: params.targeting?.ageMax,
        interests: params.targeting?.interests,
      },
    });

    const created = await this.campaignsApi.createCampaign(ctx, params);
    return this.attachWarnings(created, evaluation.warnings);
  }

  async updateCampaign(params: UpdateCampaignParams): Promise<MutationWithWarnings<FacebookCampaign>> {
    const ctx = this.buildContext(params.tenantId);
    const accountId = await this.campaignsApi.getCampaignAccountId(ctx, params.campaignId);
    this.tenantRegistry.assertAdAccountAllowed(params.tenantId, accountId);

    const currentBudget = await this.campaignsApi.getCampaignBudget(
      this.buildContext(params.tenantId, accountId),
      params.campaignId
    );
    const evaluation = this.policyEngine.evaluateMutation({
      tenantId: params.tenantId,
      operation: 'update_campaign',
      currentBudget,
      nextBudget: {
        dailyBudget: params.dailyBudget,
        lifetimeBudget: params.lifetimeBudget,
      },
      nextStatus: params.status,
    });

    const updated = await this.campaignsApi.updateCampaign(
      this.buildContext(params.tenantId, accountId),
      params
    );
    return this.attachWarnings(updated, evaluation.warnings);
  }

  async getInsights(params: GetInsightsParams): Promise<FacebookInsights> {
    const ctx = await this.resolveInsightsContext(params);
    return this.insightsApi.getInsights(ctx, params);
  }

  async getAdSets(params: GetAdSetsParams): Promise<FacebookAdSet[]> {
    const tenantId = this.requireTenantForTenantOnlyReads(params.tenantId, 'get_adsets');
    const ctx = this.buildContext(tenantId);
    const accountId = await this.campaignsApi.getCampaignAccountId(ctx, params.campaignId);
    this.tenantRegistry.assertAdAccountAllowed(tenantId, accountId);
    return this.adSetsApi.getAdSets(this.buildContext(tenantId, accountId), params);
  }

  async createAdSet(params: CreateAdSetParams): Promise<MutationWithWarnings<FacebookAdSet>> {
    this.tenantRegistry.assertAdAccountAllowed(params.tenantId, params.accountId);
    const evaluation = this.policyEngine.evaluateMutation({
      tenantId: params.tenantId,
      operation: 'create_adset',
      requireExplicitBudget: true,
      nextBudget: {
        dailyBudget: params.dailyBudget,
        lifetimeBudget: params.lifetimeBudget,
      },
      nextStatus: params.status,
      targeting: {
        ageMin: params.targeting?.ageMin,
        ageMax: params.targeting?.ageMax,
        interests: params.targeting?.interests,
        customAudiences: params.targeting?.customAudiences,
      },
    });

    const created = await this.adSetsApi.createAdSet(
      this.buildContext(params.tenantId, params.accountId),
      params
    );
    return this.attachWarnings(created, evaluation.warnings);
  }

  async updateAdSet(params: UpdateAdSetParams): Promise<MutationWithWarnings<FacebookAdSet>> {
    const ctx = this.buildContext(params.tenantId);
    const accountId = await this.adSetsApi.getAdSetAccountId(ctx, params.adSetId);
    this.tenantRegistry.assertAdAccountAllowed(params.tenantId, accountId);

    const currentBudget = await this.adSetsApi.getAdSetBudget(
      this.buildContext(params.tenantId, accountId),
      params.adSetId
    );
    const evaluation = this.policyEngine.evaluateMutation({
      tenantId: params.tenantId,
      operation: 'update_adset',
      currentBudget,
      nextBudget: {
        dailyBudget: params.dailyBudget,
        lifetimeBudget: params.lifetimeBudget,
      },
      nextStatus: params.status,
    });

    const updated = await this.adSetsApi.updateAdSet(
      this.buildContext(params.tenantId, accountId),
      params
    );
    return this.attachWarnings(updated, evaluation.warnings);
  }

  async getAds(params: GetAdsParams): Promise<FacebookAd[]> {
    const tenantId = this.requireTenantForTenantOnlyReads(params.tenantId, 'get_ads');
    const ctx = this.buildContext(tenantId);

    if (params.adSetId) {
      const accountId = await this.adSetsApi.getAdSetAccountId(ctx, params.adSetId);
      this.tenantRegistry.assertAdAccountAllowed(tenantId, accountId);
      return this.adsApi.getAds(this.buildContext(tenantId, accountId), params);
    }

    if (params.campaignId) {
      const accountId = await this.campaignsApi.getCampaignAccountId(ctx, params.campaignId);
      this.tenantRegistry.assertAdAccountAllowed(tenantId, accountId);
      return this.adsApi.getAds(this.buildContext(tenantId, accountId), params);
    }

    return [];
  }

  async createAd(params: CreateAdParams): Promise<MutationWithWarnings<FacebookAd>> {
    this.tenantRegistry.assertAdAccountAllowed(params.tenantId, params.accountId);
    const evaluation = this.policyEngine.evaluateMutation({
      tenantId: params.tenantId,
      operation: 'create_ad',
      nextStatus: params.status,
    });

    const created = await this.adsApi.createAd(this.buildContext(params.tenantId, params.accountId), params);
    return this.attachWarnings(created, evaluation.warnings);
  }

  async updateAd(params: UpdateAdParams): Promise<MutationWithWarnings<FacebookAd>> {
    const ctx = this.buildContext(params.tenantId);
    const accountId = await this.adsApi.getAdAccountId(ctx, params.adId);
    this.tenantRegistry.assertAdAccountAllowed(params.tenantId, accountId);

    const evaluation = this.policyEngine.evaluateMutation({
      tenantId: params.tenantId,
      operation: 'update_ad',
      nextStatus: params.status,
    });

    const updated = await this.adsApi.updateAd(this.buildContext(params.tenantId, accountId), params);
    return this.attachWarnings(updated, evaluation.warnings);
  }

  async duplicateCampaign(
    campaignId: string,
    options: DuplicateCampaignOptions
  ): Promise<MutationWithWarnings<{ copiedCampaignId: string }>> {
    const ctx = this.buildContext(options.tenantId);
    const accountId = await this.campaignsApi.getCampaignAccountId(ctx, campaignId);
    this.tenantRegistry.assertAdAccountAllowed(options.tenantId, accountId);
    const evaluation = this.policyEngine.evaluateMutation({
      tenantId: options.tenantId,
      operation: 'duplicate_campaign',
      deepCopy: options.deepCopy,
    });

    const result = await this.campaignsApi.duplicateCampaign(
      this.buildContext(options.tenantId, accountId),
      campaignId,
      options
    );
    return this.attachWarnings(result, evaluation.warnings);
  }

  async duplicateAdSet(
    adSetId: string,
    options: DuplicateAdSetOptions
  ): Promise<MutationWithWarnings<{ copiedAdSetId: string }>> {
    const ctx = this.buildContext(options.tenantId);
    const accountId = await this.adSetsApi.getAdSetAccountId(ctx, adSetId);
    this.tenantRegistry.assertAdAccountAllowed(options.tenantId, accountId);
    const evaluation = this.policyEngine.evaluateMutation({
      tenantId: options.tenantId,
      operation: 'duplicate_adset',
      deepCopy: options.deepCopy,
    });

    const result = await this.adSetsApi.duplicateAdSet(
      this.buildContext(options.tenantId, accountId),
      adSetId,
      options
    );
    return this.attachWarnings(result, evaluation.warnings);
  }

  async duplicateAd(
    adId: string,
    options: DuplicateAdOptions
  ): Promise<MutationWithWarnings<{ copiedAdId: string }>> {
    const ctx = this.buildContext(options.tenantId);
    const accountId = await this.adsApi.getAdAccountId(ctx, adId);
    this.tenantRegistry.assertAdAccountAllowed(options.tenantId, accountId);
    const evaluation = this.policyEngine.evaluateMutation({
      tenantId: options.tenantId,
      operation: 'duplicate_ad',
    });

    const result = await this.adsApi.duplicateAd(
      this.buildContext(options.tenantId, accountId),
      adId,
      options
    );
    return this.attachWarnings(result, evaluation.warnings);
  }

  private requireTenantForTenantOnlyReads(
    tenantId: string | undefined,
    toolName: string
  ): string {
    if (!tenantId) {
      throw new Error(`${toolName} requires tenantId because no accountId is available for inference.`);
    }
    return tenantId;
  }

  private resolveTenantByAccount(
    accountId: string,
    tenantId: string | undefined,
    toolName: string
  ): string {
    if (tenantId) return tenantId;
    const inferred = this.tenantRegistry.inferTenantIdByAdAccount(accountId);
    if (!inferred) {
      throw new Error(
        `${toolName} requires tenantId when accountId cannot be mapped to a tenant via TENANT_ACCESS_MAP.`
      );
    }
    return inferred;
  }

  private async resolveInsightsContext(params: GetInsightsParams): Promise<RequestContext> {
    if (params.accountId) {
      const tenantId = this.resolveTenantByAccount(params.accountId, params.tenantId, 'get_insights');
      this.tenantRegistry.assertAdAccountAllowed(tenantId, params.accountId);
      return this.buildContext(tenantId, params.accountId);
    }

    const tenantId = this.requireTenantForTenantOnlyReads(params.tenantId, 'get_insights');
    const baseCtx = this.buildContext(tenantId);

    if (params.campaignId) {
      const accountId = await this.campaignsApi.getCampaignAccountId(baseCtx, params.campaignId);
      this.tenantRegistry.assertAdAccountAllowed(tenantId, accountId);
      return this.buildContext(tenantId, accountId);
    }
    if (params.adSetId) {
      const accountId = await this.adSetsApi.getAdSetAccountId(baseCtx, params.adSetId);
      this.tenantRegistry.assertAdAccountAllowed(tenantId, accountId);
      return this.buildContext(tenantId, accountId);
    }
    if (params.adId) {
      const accountId = await this.adsApi.getAdAccountId(baseCtx, params.adId);
      this.tenantRegistry.assertAdAccountAllowed(tenantId, accountId);
      return this.buildContext(tenantId, accountId);
    }
    return baseCtx;
  }

  private buildContext(tenantId: string, adAccountId?: string): RequestContext {
    return { tenantId, adAccountId };
  }

  private attachWarnings<T>(result: T, warnings: string[]): MutationWithWarnings<T> {
    if (warnings.length === 0) return result as MutationWithWarnings<T>;
    return {
      ...(result as object),
      policyWarnings: warnings,
    } as MutationWithWarnings<T>;
  }
}
