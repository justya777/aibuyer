import type {
  AutofillDsaParams,
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
  GetDsaAutofillSuggestionsParams,
  DsaAutofillSuggestionsResult,
  GetCampaignsParams,
  GetInsightsParams,
  GetDsaSettingsParams,
  ListTenantPagesParams,
  GetPagesParams,
  PreflightCreateCampaignBundleParams,
  SetDsaSettingsParams,
  SetDefaultPageForAdAccountParams,
  SyncTenantAssetsParams,
  TenantPageOption,
  UpdateAdParams,
  UpdateAdSetParams,
  UpdateCampaignParams,
} from '../types/facebook.js';
import { AuditResult } from '@prisma/client';
import { getEnvConfig, type EnvConfig } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { AccountsApi } from './accounts.js';
import { AdSetsApi } from './adsets.js';
import { AdsApi } from './ads.js';
import { CampaignsApi } from './campaigns.js';
import { GraphClient } from './core/graph-client.js';
import { PageResolver } from './core/page-resolution.js';
import { PolicyEngine } from './core/policy-engine.js';
import { normalizeAdAccountId, normalizePageId, TenantRegistry } from './core/tenant-registry.js';
import type { RequestContext } from './core/types.js';
import { EnvTokenProvider } from './core/token-provider.js';
import { InsightsApi } from './insights.js';
import { PixelsApi, type FacebookPixel } from './pixels.js';
import { TargetingApi } from './targeting.js';
import { AuditLogService } from '../services/audit-log-service.js';
import { PolicyViolationError, TenantIsolationError } from './core/types.js';
import { DsaComplianceError, DsaService, extractCountryCodesFromTargeting, isEuTargeting } from './dsa.js';

type MutationWithWarnings<T> = T & { policyWarnings?: string[] };

interface FacadeDependencies {
  env?: EnvConfig;
  tenantRegistry?: TenantRegistry;
  graphClient?: GraphClient;
  policyEngine?: PolicyEngine;
  auditLogService?: AuditLogService;
  dsaService?: DsaService;
}

interface ActorContext {
  tenantId: string;
  userId?: string;
  isPlatformAdmin?: boolean;
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
  private readonly pixelsApi: PixelsApi;
  private readonly auditLogService: AuditLogService;
  private readonly dsaService: DsaService;

  constructor(deps: FacadeDependencies = {}) {
    this.env = deps.env || getEnvConfig();
    this.tenantRegistry = deps.tenantRegistry || new TenantRegistry();

    const tokenProvider = new EnvTokenProvider({
      tenantTokenMapRaw: this.env.tenantSuTokenMapRaw,
      globalToken: this.env.globalSystemUserToken,
    });
    this.graphClient =
      deps.graphClient ||
      new GraphClient(tokenProvider, {
        apiVersion: this.env.graphApiVersion,
        retry: this.env.graphRetry,
        tenantRegistry: this.tenantRegistry,
      });

    this.policyEngine = deps.policyEngine || new PolicyEngine(this.env.policy);
    this.auditLogService = deps.auditLogService || new AuditLogService();
    this.dsaService = deps.dsaService || new DsaService(this.graphClient);
    const pageResolver = new PageResolver(this.tenantRegistry);
    this.targetingApi = new TargetingApi(this.graphClient);
    this.accountsApi = new AccountsApi(this.graphClient);
    this.campaignsApi = new CampaignsApi(this.graphClient);
    this.adSetsApi = new AdSetsApi(this.graphClient, this.targetingApi, this.dsaService, pageResolver);
    this.adsApi = new AdsApi(this.graphClient, pageResolver, this.dsaService);
    this.insightsApi = new InsightsApi(this.graphClient, this.env.insightsCacheTtlMs);
    this.pixelsApi = new PixelsApi(this.graphClient);
  }

  getTenantRegistry(): TenantRegistry {
    return this.tenantRegistry;
  }

  async inferTenantIdByAdAccount(
    adAccountId: string,
    userId?: string,
    isPlatformAdmin?: boolean
  ): Promise<string | undefined> {
    return this.tenantRegistry.inferTenantIdByAdAccount(adAccountId, userId, isPlatformAdmin);
  }

  async getAccounts(params: GetAccountsParams): Promise<FacebookAccount[]> {
    const actor = await this.requireActor(params, 'get_accounts');
    const allowedAdAccountIds = await this.tenantRegistry.getAllowedAdAccountIds(
      actor.tenantId,
      actor.userId,
      actor.isPlatformAdmin
    );
    return this.accountsApi.getAccounts(this.buildContext(actor), params, allowedAdAccountIds);
  }

  async getPages(params: GetPagesParams): Promise<FacebookPage[]> {
    const actor = await this.requireActor(params, 'get_pages');
    return this.accountsApi.getPages(this.buildContext(actor), params);
  }

  async listTenantPages(params: ListTenantPagesParams): Promise<TenantPageOption[]> {
    const actor = await this.requireActor(params, 'list_tenant_pages');
    return this.accountsApi.listTenantPages(this.buildContext(actor));
  }

  async syncTenantAssets(params: SyncTenantAssetsParams): Promise<{
    tenantId: string;
    businessId: string;
    fallbackPagesUsed: boolean;
    pagesSynced: number;
    adAccountsSynced: number;
    pagesDiscoveryStrategy: 'owned_pages' | 'client_pages' | 'me_accounts_filtered' | 'none';
    adAccountsDiscoveryStrategy:
      | 'owned_ad_accounts'
      | 'client_ad_accounts'
      | 'me_adaccounts_filtered'
      | 'none';
    autoAssignedDefaultPageId: string | null;
  }> {
    const actor = await this.requireActor(params, 'sync_tenant_assets');
    return this.accountsApi.syncTenantAssets(this.buildContext(actor), params.businessId);
  }

  async setDefaultPageForAdAccount(
    params: SetDefaultPageForAdAccountParams
  ): Promise<{ adAccountId: string; defaultPageId: string }> {
    const actor = await this.requireActor(params, 'set_default_page_for_ad_account');
    const normalizedAdAccountId = normalizeAdAccountId(params.adAccountId);
    const normalizedPageId = normalizePageId(params.pageId);
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      normalizedAdAccountId,
      actor.userId,
      actor.isPlatformAdmin
    );
    await this.tenantRegistry.assertPageAllowed(
      actor.tenantId,
      normalizedPageId,
      actor.userId,
      actor.isPlatformAdmin
    );

    await prisma.adAccountSettings.upsert({
      where: {
        tenantId_adAccountId: {
          tenantId: actor.tenantId,
          adAccountId: normalizedAdAccountId,
        },
      },
      update: {
        defaultPageId: normalizedPageId,
      },
      create: {
        tenantId: actor.tenantId,
        adAccountId: normalizedAdAccountId,
        defaultPageId: normalizedPageId,
      },
    });
    await this.accountsApi.confirmFallbackPageSelection(this.buildContext(actor), normalizedPageId);
    return {
      adAccountId: normalizedAdAccountId,
      defaultPageId: normalizedPageId,
    };
  }

  async getPromotablePages(
    accountId: string,
    tenantId?: string,
    userId?: string,
    isPlatformAdmin?: boolean
  ): Promise<Array<{ id: string; name: string; canPromote: boolean }>> {
    const actor = await this.requireActor({ tenantId, userId, isPlatformAdmin }, 'get_promotable_pages');
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      accountId,
      actor.userId,
      actor.isPlatformAdmin
    );
    const ctx = this.buildContext(actor, { adAccountId: accountId });
    return this.accountsApi.getPromotablePages(ctx, accountId);
  }

  async getAdAccountPixels(params: {
    tenantId?: string;
    userId?: string;
    isPlatformAdmin?: boolean;
    accountId: string;
  }): Promise<FacebookPixel[]> {
    const actor = await this.requireActor(params, 'get_ad_account_pixels');
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      params.accountId,
      actor.userId,
      actor.isPlatformAdmin
    );
    const ctx = this.buildContext(actor, { adAccountId: params.accountId });
    return this.pixelsApi.getAdAccountPixels(ctx, params.accountId);
  }

  async getCampaigns(params: GetCampaignsParams): Promise<FacebookCampaign[]> {
    const actor = await this.requireActor(params, 'get_campaigns');
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      params.accountId,
      actor.userId,
      actor.isPlatformAdmin
    );
    const ctx = this.buildContext(actor, { adAccountId: params.accountId });
    return this.campaignsApi.getCampaigns(ctx, params);
  }

  async getCampaignById(params: {
    tenantId?: string;
    userId?: string;
    isPlatformAdmin?: boolean;
    campaignId: string;
  }): Promise<FacebookCampaign> {
    const actor = await this.requireActor(params, 'get_campaign_by_id');
    const baseCtx = this.buildContext(actor, { campaignId: params.campaignId });
    const accountId = await this.campaignsApi.getCampaignAccountId(baseCtx, params.campaignId);
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      accountId,
      actor.userId,
      actor.isPlatformAdmin
    );
    return this.campaignsApi.getCampaignById(
      this.buildContext(actor, { adAccountId: accountId, campaignId: params.campaignId }),
      params.campaignId
    );
  }

  async createCampaign(params: CreateCampaignParams): Promise<MutationWithWarnings<FacebookCampaign>> {
    const actor = await this.requireActor(params, 'create_campaign');
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      params.accountId,
      actor.userId,
      actor.isPlatformAdmin
    );
    await this.preflightCreateCampaignBundle({
      tenantId: actor.tenantId,
      userId: actor.userId,
      isPlatformAdmin: actor.isPlatformAdmin,
      accountId: params.accountId,
      adSetTargeting: params.adSetTargeting,
    });
    const ctx = this.buildContext(actor, { adAccountId: params.accountId });
    const evaluation = this.policyEngine.evaluateMutation({
      tenantId: actor.tenantId,
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

    try {
      const created = await this.campaignsApi.createCampaign(ctx, params);
      await this.logMutation(
        actor,
        'create_campaign',
        created.id,
        `Created campaign ${created.name} in ${params.accountId}`,
        AuditResult.SUCCESS,
        { policyWarnings: evaluation.warnings }
      );
      return this.attachWarnings(created, evaluation.warnings);
    } catch (error) {
      await this.logMutation(
        actor,
        'create_campaign',
        params.accountId,
        `Failed to create campaign ${params.name} in ${params.accountId}`,
        this.classifyAuditResult(error),
        { error: error instanceof Error ? error.message : String(error) }
      );
      throw error;
    }
  }

  async preflightCreateCampaignBundle(
    params: PreflightCreateCampaignBundleParams
  ): Promise<{ ok: true; euTargeting: boolean }> {
    const actor = await this.requireActor(params, 'preflight_create_campaign_bundle');
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      params.accountId,
      actor.userId,
      actor.isPlatformAdmin
    );
    const countries = extractCountryCodesFromTargeting(params.adSetTargeting);
    const euTargeting = isEuTargeting(countries);
    const preflightContext = this.buildContext(actor, { adAccountId: params.accountId });
    if (euTargeting) {
      await this.dsaService.ensureDsaForAdAccount(
        preflightContext,
        params.accountId
      );
    }
    await this.accountsApi.ensurePaymentMethodConfigured(preflightContext, params.accountId);
    return { ok: true, euTargeting };
  }

  async getDsaSettings(params: GetDsaSettingsParams): Promise<{
    adAccountId: string;
    dsaBeneficiary: string | null;
    dsaPayor: string | null;
    source: string | null;
    updatedAt: Date | null;
    configured: boolean;
  }> {
    const actor = await this.requireActor(params, 'get_dsa_settings');
    const normalizedAdAccountId = normalizeAdAccountId(params.adAccountId);
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      normalizedAdAccountId,
      actor.userId,
      actor.isPlatformAdmin
    );
    const settings = await this.dsaService.getDsaSettings(
      this.buildContext(actor, { adAccountId: normalizedAdAccountId }),
      normalizedAdAccountId
    );
    return {
      adAccountId: normalizedAdAccountId,
      dsaBeneficiary: settings?.dsaBeneficiary || null,
      dsaPayor: settings?.dsaPayor || null,
      source: settings?.dsaSource || null,
      updatedAt: settings?.dsaUpdatedAt || null,
      configured: Boolean(settings?.dsaBeneficiary && settings?.dsaPayor),
    };
  }

  async setDsaSettings(params: SetDsaSettingsParams): Promise<{
    adAccountId: string;
    dsaBeneficiary: string;
    dsaPayor: string;
    source: string;
    updatedAt: Date;
    configured: boolean;
  }> {
    const actor = await this.requireActor(params, 'set_dsa_settings');
    const normalizedAdAccountId = normalizeAdAccountId(params.adAccountId);
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      normalizedAdAccountId,
      actor.userId,
      actor.isPlatformAdmin
    );
    const normalizedBeneficiary = params.dsaBeneficiary.trim();
    const normalizedPayor = params.dsaPayor.trim();
    if (!normalizedBeneficiary || !normalizedPayor) {
      throw new Error('dsaBeneficiary and dsaPayor are required.');
    }
    const resolvedBusinessId = params.businessId || (await this.resolveAdAccountBusinessId(actor.tenantId, normalizedAdAccountId));
    const settings = await this.dsaService.setDsaSettings(
      this.buildContext(actor, { adAccountId: normalizedAdAccountId }),
      normalizedAdAccountId,
      {
        dsaBeneficiary: normalizedBeneficiary,
        dsaPayor: normalizedPayor,
        businessId: resolvedBusinessId || null,
      }
    );
    return {
      adAccountId: normalizedAdAccountId,
      dsaBeneficiary: settings.dsaBeneficiary,
      dsaPayor: settings.dsaPayor,
      source: settings.dsaSource,
      updatedAt: settings.dsaUpdatedAt,
      configured: Boolean(settings.dsaBeneficiary && settings.dsaPayor),
    };
  }

  async autofillDsaForAdAccount(
    params: AutofillDsaParams
  ): Promise<{
    adAccountId: string;
    dsaBeneficiary: string;
    dsaPayor: string;
    source: string;
    updatedAt: Date;
    configured: boolean;
  }> {
    const actor = await this.requireActor(params, 'autofill_dsa_for_ad_account');
    const normalizedAdAccountId = normalizeAdAccountId(params.adAccountId);
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      normalizedAdAccountId,
      actor.userId,
      actor.isPlatformAdmin
    );
    const resolvedBusinessId = await this.resolveAdAccountBusinessId(actor.tenantId, normalizedAdAccountId);
    const ensured = await this.dsaService.ensureDsaForAdAccount(
      this.buildContext(actor, { adAccountId: normalizedAdAccountId }),
      normalizedAdAccountId
    );
    const settings = await this.dsaService.setDsaSettings(
      this.buildContext(actor, { adAccountId: normalizedAdAccountId }),
      normalizedAdAccountId,
      {
        dsaBeneficiary: ensured.dsaBeneficiary,
        dsaPayor: ensured.dsaPayor,
        source: ensured.dsaSource,
        businessId: resolvedBusinessId || null,
      }
    );
    return {
      adAccountId: normalizedAdAccountId,
      dsaBeneficiary: settings.dsaBeneficiary,
      dsaPayor: settings.dsaPayor,
      source: settings.dsaSource,
      updatedAt: settings.dsaUpdatedAt,
      configured: Boolean(settings.dsaBeneficiary && settings.dsaPayor),
    };
  }

  async getDsaAutofillSuggestions(
    params: GetDsaAutofillSuggestionsParams
  ): Promise<DsaAutofillSuggestionsResult> {
    const actor = await this.requireActor(params, 'get_dsa_autofill_suggestions');
    const normalizedAdAccountId = normalizeAdAccountId(params.adAccountId);
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      normalizedAdAccountId,
      actor.userId,
      actor.isPlatformAdmin
    );

    const mapping = await prisma.tenantAdAccount.findUnique({
      where: {
        tenantId_adAccountId: {
          tenantId: actor.tenantId,
          adAccountId: normalizedAdAccountId,
        },
      },
      select: { businessId: true },
    });
    if (!mapping) {
      throw new TenantIsolationError(`Ad account ${normalizedAdAccountId} is not mapped to tenant ${actor.tenantId}.`);
    }
    if (mapping.businessId !== params.businessId) {
      throw new TenantIsolationError(
        `Ad account ${normalizedAdAccountId} is not mapped to business ${params.businessId}.`
      );
    }

    return this.dsaService.getDsaAutofillSuggestions(
      this.buildContext(actor, {
        adAccountId: normalizedAdAccountId,
      }),
      {
        businessId: params.businessId,
        adAccountId: normalizedAdAccountId,
        pageId: params.pageId,
      }
    );
  }

  async updateCampaign(params: UpdateCampaignParams): Promise<MutationWithWarnings<FacebookCampaign>> {
    const actor = await this.requireActor(params, 'update_campaign');
    const baseCtx = this.buildContext(actor, { campaignId: params.campaignId });
    const accountId = await this.campaignsApi.getCampaignAccountId(baseCtx, params.campaignId);
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      accountId,
      actor.userId,
      actor.isPlatformAdmin
    );

    const currentBudget = await this.campaignsApi.getCampaignBudget(
      this.buildContext(actor, { adAccountId: accountId, campaignId: params.campaignId }),
      params.campaignId
    );
    const evaluation = this.policyEngine.evaluateMutation({
      tenantId: actor.tenantId,
      operation: 'update_campaign',
      currentBudget,
      nextBudget: {
        dailyBudget: params.dailyBudget,
        lifetimeBudget: params.lifetimeBudget,
      },
      nextStatus: params.status,
    });

    try {
      const updated = await this.campaignsApi.updateCampaign(
        this.buildContext(actor, { adAccountId: accountId, campaignId: params.campaignId }),
        params
      );
      await this.logMutation(
        actor,
        'update_campaign',
        params.campaignId,
        `Updated campaign ${params.campaignId}`,
        AuditResult.SUCCESS,
        { policyWarnings: evaluation.warnings }
      );
      return this.attachWarnings(updated, evaluation.warnings);
    } catch (error) {
      await this.logMutation(
        actor,
        'update_campaign',
        params.campaignId,
        `Failed to update campaign ${params.campaignId}`,
        this.classifyAuditResult(error),
        { error: error instanceof Error ? error.message : String(error) }
      );
      throw error;
    }
  }

  async getInsights(params: GetInsightsParams): Promise<FacebookInsights> {
    const actor = await this.requireActor(params, 'get_insights');
    const ctx = await this.resolveInsightsContext(actor, params);
    return this.insightsApi.getInsights(ctx, params);
  }

  async getAdSets(params: GetAdSetsParams): Promise<FacebookAdSet[]> {
    const actor = await this.requireActor(params, 'get_adsets');
    const ctx = this.buildContext(actor, { campaignId: params.campaignId });
    const accountId = await this.campaignsApi.getCampaignAccountId(ctx, params.campaignId);
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      accountId,
      actor.userId,
      actor.isPlatformAdmin
    );
    return this.adSetsApi.getAdSets(
      this.buildContext(actor, { adAccountId: accountId, campaignId: params.campaignId }),
      params
    );
  }

  async createAdSet(params: CreateAdSetParams): Promise<MutationWithWarnings<FacebookAdSet>> {
    const actor = await this.requireActor(params, 'create_adset');
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      params.accountId,
      actor.userId,
      actor.isPlatformAdmin
    );
    const evaluation = this.policyEngine.evaluateMutation({
      tenantId: actor.tenantId,
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

    try {
      const created = await this.adSetsApi.createAdSet(
        this.buildContext(actor, {
          adAccountId: params.accountId,
          campaignId: params.campaignId,
        }),
        params
      );
      await this.logMutation(
        actor,
        'create_adset',
        created.id,
        `Created ad set ${created.name} in campaign ${params.campaignId}`,
        AuditResult.SUCCESS,
        { policyWarnings: evaluation.warnings }
      );
      return this.attachWarnings(created, evaluation.warnings);
    } catch (error) {
      await this.logMutation(
        actor,
        'create_adset',
        params.campaignId,
        `Failed to create ad set ${params.name}`,
        this.classifyAuditResult(error),
        { error: error instanceof Error ? error.message : String(error) }
      );
      throw error;
    }
  }

  async updateAdSet(params: UpdateAdSetParams): Promise<MutationWithWarnings<FacebookAdSet>> {
    const actor = await this.requireActor(params, 'update_adset');
    const ctx = this.buildContext(actor, { adSetId: params.adSetId });
    const accountId = await this.adSetsApi.getAdSetAccountId(ctx, params.adSetId);
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      accountId,
      actor.userId,
      actor.isPlatformAdmin
    );

    const currentBudget = await this.adSetsApi.getAdSetBudget(
      this.buildContext(actor, { adAccountId: accountId, adSetId: params.adSetId }),
      params.adSetId
    );
    const evaluation = this.policyEngine.evaluateMutation({
      tenantId: actor.tenantId,
      operation: 'update_adset',
      currentBudget,
      nextBudget: {
        dailyBudget: params.dailyBudget,
        lifetimeBudget: params.lifetimeBudget,
      },
      nextStatus: params.status,
    });

    try {
      const updated = await this.adSetsApi.updateAdSet(
        this.buildContext(actor, { adAccountId: accountId, adSetId: params.adSetId }),
        params
      );
      await this.logMutation(
        actor,
        'update_adset',
        params.adSetId,
        `Updated ad set ${params.adSetId}`,
        AuditResult.SUCCESS,
        { policyWarnings: evaluation.warnings }
      );
      return this.attachWarnings(updated, evaluation.warnings);
    } catch (error) {
      await this.logMutation(
        actor,
        'update_adset',
        params.adSetId,
        `Failed to update ad set ${params.adSetId}`,
        this.classifyAuditResult(error),
        { error: error instanceof Error ? error.message : String(error) }
      );
      throw error;
    }
  }

  async getAds(params: GetAdsParams): Promise<FacebookAd[]> {
    const actor = await this.requireActor(params, 'get_ads');
    const ctx = this.buildContext(actor);

    if (params.adSetId) {
      const adSetCtx = this.buildContext(actor, { adSetId: params.adSetId });
      const accountId = await this.adSetsApi.getAdSetAccountId(adSetCtx, params.adSetId);
      await this.tenantRegistry.assertAdAccountAllowed(
        actor.tenantId,
        accountId,
        actor.userId,
        actor.isPlatformAdmin
      );
      return this.adsApi.getAds(
        this.buildContext(actor, { adAccountId: accountId, adSetId: params.adSetId }),
        params
      );
    }

    if (params.campaignId) {
      const campaignCtx = this.buildContext(actor, { campaignId: params.campaignId });
      const accountId = await this.campaignsApi.getCampaignAccountId(campaignCtx, params.campaignId);
      await this.tenantRegistry.assertAdAccountAllowed(
        actor.tenantId,
        accountId,
        actor.userId,
        actor.isPlatformAdmin
      );
      return this.adsApi.getAds(
        this.buildContext(actor, { adAccountId: accountId, campaignId: params.campaignId }),
        params
      );
    }

    return [];
  }

  async createAd(params: CreateAdParams): Promise<MutationWithWarnings<FacebookAd>> {
    const actor = await this.requireActor(params, 'create_ad');
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      params.accountId,
      actor.userId,
      actor.isPlatformAdmin
    );
    const evaluation = this.policyEngine.evaluateMutation({
      tenantId: actor.tenantId,
      operation: 'create_ad',
      nextStatus: params.status,
    });

    try {
      const created = await this.adsApi.createAd(
        this.buildContext(actor, { adAccountId: params.accountId, adSetId: params.adSetId }),
        params
      );
      await this.logMutation(
        actor,
        'create_ad',
        created.id,
        `Created ad ${created.name} in ad set ${params.adSetId}`,
        AuditResult.SUCCESS,
        { policyWarnings: evaluation.warnings }
      );
      return this.attachWarnings(created, evaluation.warnings);
    } catch (error) {
      await this.logMutation(
        actor,
        'create_ad',
        params.adSetId,
        `Failed to create ad ${params.name}`,
        this.classifyAuditResult(error),
        { error: error instanceof Error ? error.message : String(error) }
      );
      throw error;
    }
  }

  async updateAd(params: UpdateAdParams): Promise<MutationWithWarnings<FacebookAd>> {
    const actor = await this.requireActor(params, 'update_ad');
    const ctx = this.buildContext(actor, { adId: params.adId });
    const accountId = await this.adsApi.getAdAccountId(ctx, params.adId);
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      accountId,
      actor.userId,
      actor.isPlatformAdmin
    );

    const evaluation = this.policyEngine.evaluateMutation({
      tenantId: actor.tenantId,
      operation: 'update_ad',
      nextStatus: params.status,
    });

    try {
      const updated = await this.adsApi.updateAd(
        this.buildContext(actor, { adAccountId: accountId, adId: params.adId }),
        params
      );
      await this.logMutation(
        actor,
        'update_ad',
        params.adId,
        `Updated ad ${params.adId}`,
        AuditResult.SUCCESS,
        { policyWarnings: evaluation.warnings }
      );
      return this.attachWarnings(updated, evaluation.warnings);
    } catch (error) {
      await this.logMutation(
        actor,
        'update_ad',
        params.adId,
        `Failed to update ad ${params.adId}`,
        this.classifyAuditResult(error),
        { error: error instanceof Error ? error.message : String(error) }
      );
      throw error;
    }
  }

  async duplicateCampaign(
    campaignId: string,
    options: DuplicateCampaignOptions
  ): Promise<MutationWithWarnings<{ copiedCampaignId: string }>> {
    const actor = await this.requireActor(options, 'duplicate_campaign');
    const ctx = this.buildContext(actor, { campaignId });
    const accountId = await this.campaignsApi.getCampaignAccountId(ctx, campaignId);
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      accountId,
      actor.userId,
      actor.isPlatformAdmin
    );
    const evaluation = this.policyEngine.evaluateMutation({
      tenantId: actor.tenantId,
      operation: 'duplicate_campaign',
      deepCopy: options.deepCopy,
    });

    try {
      const result = await this.campaignsApi.duplicateCampaign(
        this.buildContext(actor, { adAccountId: accountId, campaignId }),
        campaignId,
        options
      );
      await this.logMutation(
        actor,
        'duplicate_campaign',
        campaignId,
        `Duplicated campaign ${campaignId}`,
        AuditResult.SUCCESS,
        { policyWarnings: evaluation.warnings, copiedCampaignId: result.copiedCampaignId }
      );
      return this.attachWarnings(result, evaluation.warnings);
    } catch (error) {
      await this.logMutation(
        actor,
        'duplicate_campaign',
        campaignId,
        `Failed to duplicate campaign ${campaignId}`,
        this.classifyAuditResult(error),
        { error: error instanceof Error ? error.message : String(error) }
      );
      throw error;
    }
  }

  async duplicateAdSet(
    adSetId: string,
    options: DuplicateAdSetOptions
  ): Promise<MutationWithWarnings<{ copiedAdSetId: string }>> {
    const actor = await this.requireActor(options, 'duplicate_adset');
    const ctx = this.buildContext(actor, { adSetId });
    const accountId = await this.adSetsApi.getAdSetAccountId(ctx, adSetId);
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      accountId,
      actor.userId,
      actor.isPlatformAdmin
    );
    const evaluation = this.policyEngine.evaluateMutation({
      tenantId: actor.tenantId,
      operation: 'duplicate_adset',
      deepCopy: options.deepCopy,
    });

    try {
      const result = await this.adSetsApi.duplicateAdSet(
        this.buildContext(actor, { adAccountId: accountId, adSetId }),
        adSetId,
        options
      );
      await this.logMutation(
        actor,
        'duplicate_adset',
        adSetId,
        `Duplicated ad set ${adSetId}`,
        AuditResult.SUCCESS,
        { policyWarnings: evaluation.warnings, copiedAdSetId: result.copiedAdSetId }
      );
      return this.attachWarnings(result, evaluation.warnings);
    } catch (error) {
      await this.logMutation(
        actor,
        'duplicate_adset',
        adSetId,
        `Failed to duplicate ad set ${adSetId}`,
        this.classifyAuditResult(error),
        { error: error instanceof Error ? error.message : String(error) }
      );
      throw error;
    }
  }

  async duplicateAd(
    adId: string,
    options: DuplicateAdOptions
  ): Promise<MutationWithWarnings<{ copiedAdId: string }>> {
    const actor = await this.requireActor(options, 'duplicate_ad');
    const ctx = this.buildContext(actor, { adId });
    const accountId = await this.adsApi.getAdAccountId(ctx, adId);
    await this.tenantRegistry.assertAdAccountAllowed(
      actor.tenantId,
      accountId,
      actor.userId,
      actor.isPlatformAdmin
    );
    const evaluation = this.policyEngine.evaluateMutation({
      tenantId: actor.tenantId,
      operation: 'duplicate_ad',
    });

    try {
      const result = await this.adsApi.duplicateAd(
        this.buildContext(actor, { adAccountId: accountId, adId }),
        adId,
        options
      );
      await this.logMutation(
        actor,
        'duplicate_ad',
        adId,
        `Duplicated ad ${adId}`,
        AuditResult.SUCCESS,
        { policyWarnings: evaluation.warnings, copiedAdId: result.copiedAdId }
      );
      return this.attachWarnings(result, evaluation.warnings);
    } catch (error) {
      await this.logMutation(
        actor,
        'duplicate_ad',
        adId,
        `Failed to duplicate ad ${adId}`,
        this.classifyAuditResult(error),
        { error: error instanceof Error ? error.message : String(error) }
      );
      throw error;
    }
  }

  private async requireActor(
    params: { tenantId?: string; userId?: string; isPlatformAdmin?: boolean },
    toolName: string
  ): Promise<ActorContext> {
    const tenantId = params.tenantId?.trim();
    if (!tenantId) {
      throw new Error(`${toolName} requires tenantId. No default tenant fallback is allowed.`);
    }
    await this.tenantRegistry.assertTenantAccessible(
      tenantId,
      params.userId,
      params.isPlatformAdmin
    );
    return {
      tenantId,
      userId: params.userId,
      isPlatformAdmin: params.isPlatformAdmin,
    };
  }

  private async resolveInsightsContext(
    actor: ActorContext,
    params: GetInsightsParams
  ): Promise<RequestContext> {
    if (params.accountId) {
      await this.tenantRegistry.assertAdAccountAllowed(
        actor.tenantId,
        params.accountId,
        actor.userId,
        actor.isPlatformAdmin
      );
      return this.buildContext(actor, { adAccountId: params.accountId });
    }

    const baseCtx = this.buildContext(actor);

    if (params.campaignId) {
      const campaignCtx = this.buildContext(actor, { campaignId: params.campaignId });
      const accountId = await this.campaignsApi.getCampaignAccountId(campaignCtx, params.campaignId);
      await this.tenantRegistry.assertAdAccountAllowed(
        actor.tenantId,
        accountId,
        actor.userId,
        actor.isPlatformAdmin
      );
      return this.buildContext(actor, { adAccountId: accountId, campaignId: params.campaignId });
    }
    if (params.adSetId) {
      const adSetCtx = this.buildContext(actor, { adSetId: params.adSetId });
      const accountId = await this.adSetsApi.getAdSetAccountId(adSetCtx, params.adSetId);
      await this.tenantRegistry.assertAdAccountAllowed(
        actor.tenantId,
        accountId,
        actor.userId,
        actor.isPlatformAdmin
      );
      return this.buildContext(actor, { adAccountId: accountId, adSetId: params.adSetId });
    }
    if (params.adId) {
      const adCtx = this.buildContext(actor, { adId: params.adId });
      const accountId = await this.adsApi.getAdAccountId(adCtx, params.adId);
      await this.tenantRegistry.assertAdAccountAllowed(
        actor.tenantId,
        accountId,
        actor.userId,
        actor.isPlatformAdmin
      );
      return this.buildContext(actor, { adAccountId: accountId, adId: params.adId });
    }
    return baseCtx;
  }

  private buildContext(
    actor: ActorContext,
    extras: Partial<RequestContext> = {}
  ): RequestContext {
    return {
      tenantId: actor.tenantId,
      userId: actor.userId,
      isPlatformAdmin: actor.isPlatformAdmin,
      ...extras,
    };
  }

  private async resolveAdAccountBusinessId(
    tenantId: string,
    normalizedAdAccountId: string
  ): Promise<string | null> {
    const mapping = await prisma.tenantAdAccount.findUnique({
      where: {
        tenantId_adAccountId: {
          tenantId,
          adAccountId: normalizedAdAccountId,
        },
      },
      select: {
        businessId: true,
      },
    });
    return mapping?.businessId || null;
  }

  private async logMutation(
    actor: ActorContext,
    action: string,
    assetId: string | undefined,
    summary: string,
    result: AuditResult,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.auditLogService.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action,
      assetId,
      summary,
      result,
      metadata,
    });
  }

  private classifyAuditResult(error: unknown): AuditResult {
    if (
      error instanceof PolicyViolationError ||
      error instanceof TenantIsolationError ||
      error instanceof DsaComplianceError
    ) {
      return AuditResult.BLOCKED;
    }
    return AuditResult.ERROR;
  }

  private attachWarnings<T>(result: T, warnings: string[]): MutationWithWarnings<T> {
    if (warnings.length === 0) return result as MutationWithWarnings<T>;
    return {
      ...(result as object),
      policyWarnings: warnings,
    } as MutationWithWarnings<T>;
  }
}
