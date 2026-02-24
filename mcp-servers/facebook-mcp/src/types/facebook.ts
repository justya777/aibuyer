export interface FacebookPage {
  id: string;
  name: string;
  category: string;
  tasks: string[];
  createdAt?: Date;
}

export interface FacebookAccount {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'limited' | 'disabled';
  currency: string;
  timezone: string;
  lastActivity: Date;
  createdAt: Date;
  metrics: {
    ctr: number;
    cpm: number;
    cpc: number;
    budget: number;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    reach: number;
    frequency: number;
  };
  activeCampaigns: number;
  totalCampaigns: number;
}

export interface FacebookCampaign {
  id: string;
  accountId: string;
  name: string;
  status: 'active' | 'paused' | 'deleted';
  objective: string;
  budget: {
    daily?: number;
    lifetime?: number;
    remaining: number;
  };
  targeting: {
    countries: string[];
    ageMin?: number;
    ageMax?: number;
    gender?: 'male' | 'female' | 'all';
    interests?: string[];
    behaviors?: string[];
  };
  performance: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpm: number;
    cpc: number;
    conversions: number;
    costPerConversion: number;
  };
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface FacebookAdSet {
  id: string;
  accountId: string;
  campaignId: string;
  name: string;
  status: 'active' | 'paused' | 'deleted';
  optimizationGoal: string;
  billingEvent: string;
  budget: {
    daily?: number;
    lifetime?: number;
    remaining: number;
  };
  targeting: {
    countries?: string[];
    ageMin?: number;
    ageMax?: number;
    gender?: 'male' | 'female' | 'all';
    interests?: string[];
    behaviors?: string[];
    customAudiences?: string[];
    locales?: number[];
  };
  performance: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpm: number;
    cpc: number;
    conversions: number;
    costPerConversion: number;
  };
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface FacebookAd {
  id: string;
  accountId: string;
  campaignId: string;
  adSetId: string;
  name: string;
  status: 'active' | 'paused' | 'deleted';
  creative: {
    pageId?: string;
    title?: string;
    body?: string;
    imageUrl?: string;
    videoUrl?: string;
    linkUrl?: string;
    urlParameters?: string;
    callToAction?: string;
    displayLink?: string;
  };
  performance: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpm: number;
    cpc: number;
    conversions: number;
    costPerConversion: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface FacebookInsights {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  conversions: number;
  costPerConversion: number;
  reach: number;
  frequency: number;
  activeCampaigns?: number;
  totalCampaigns?: number;
}

interface ActorScoped {
  userId?: string;
  isPlatformAdmin?: boolean;
}

interface TenantRequired extends ActorScoped {
  tenantId: string;
}

interface TenantScoped extends TenantRequired {}

export interface GetAccountsParams extends TenantScoped {
  limit?: number;
  fields?: string[];
}

export interface GetPagesParams extends TenantScoped {
  limit?: number;
  fields?: string[];
}

export interface TenantPageOption {
  id: string;
  name: string;
  canPromote: boolean;
  source: 'BUSINESS_OWNED' | 'FALLBACK_UNVERIFIED' | 'FALLBACK_CONFIRMED';
  confirmed: boolean;
  tasks: string[];
  lastSeenAt: Date;
}

export interface GetCampaignsParams extends TenantScoped {
  accountId: string;
  limit?: number;
  status?: string[];
}

export interface CreateCampaignParams extends TenantRequired {
  accountId: string;
  name: string;
  objective: string;
  status?: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
  adSetTargeting?: CreateAdSetParams['targeting'];
  targeting?: {
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
  };
}

export interface UpdateCampaignParams extends TenantRequired {
  campaignId: string;
  name?: string;
  status?: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
}

export interface GetInsightsParams extends TenantScoped {
  accountId?: string;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  level: 'account' | 'campaign' | 'adset' | 'ad';
  fields?: string[];
  datePreset?: string;
}

export interface GetAdSetsParams extends TenantScoped {
  campaignId: string;
  limit?: number;
  status?: string[];
}

export interface CreateAdSetParams extends TenantRequired {
  accountId: string;
  campaignId: string;
  name: string;
  optimizationGoal: string;
  billingEvent: string;
  promotedObject?: {
    pageId?: string;
    pixelId?: string;
    customEventType?: string;
  };
  status?: string;
  dailyBudget?: number | null;
  lifetimeBudget?: number | null;
  bidAmount?: number;
  targeting?: {
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
    targetingAutomation?: {
      advantageAudience?: number | boolean;
    };
  };
}

export interface UpdateAdSetParams extends TenantRequired {
  adSetId: string;
  name?: string;
  status?: string;
  optimizationGoal?: string;
  billingEvent?: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
}

export interface GetAdsParams extends TenantScoped {
  adSetId?: string;
  campaignId?: string;
  limit?: number;
  status?: string[];
}

export interface CreateAdParams extends TenantRequired {
  accountId: string;
  adSetId: string;
  name: string;
  status?: string;
  creative: {
    pageId?: string;
    title?: string;
    body?: string;
    imageUrl?: string;
    videoUrl?: string;
    linkUrl?: string;
    urlParameters?: string;
    callToAction?: string;
    displayLink?: string;
  };
}

export interface UpdateAdParams extends TenantRequired {
  adId: string;
  name?: string;
  status?: string;
  creative?: {
    pageId?: string;
    title?: string;
    body?: string;
    imageUrl?: string;
    videoUrl?: string;
    linkUrl?: string;
    urlParameters?: string;
    callToAction?: string;
    displayLink?: string;
  };
}

export interface DuplicateCampaignOptions extends TenantRequired {
  deepCopy?: boolean;
  renameStrategy?: 'DEEP_RENAME' | 'ONLY_TOP_LEVEL_RENAME' | 'NO_RENAME';
  renamePrefix?: string;
  renameSuffix?: string;
  statusOption?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE';
}

export interface DuplicateAdSetOptions extends TenantRequired {
  campaignId?: string;
  deepCopy?: boolean;
  renameStrategy?: 'DEEP_RENAME' | 'ONLY_TOP_LEVEL_RENAME' | 'NO_RENAME';
  renamePrefix?: string;
  renameSuffix?: string;
  statusOption?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE';
}

export interface DuplicateAdOptions extends TenantRequired {
  adSetId?: string;
  renameStrategy?: 'NO_RENAME' | 'ONLY_TOP_LEVEL_RENAME';
  renamePrefix?: string;
  renameSuffix?: string;
  statusOption?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE';
}

export interface PreflightCreateCampaignBundleParams extends TenantRequired {
  accountId: string;
  adSetTargeting?: CreateAdSetParams['targeting'];
}

export interface AutofillDsaParams extends TenantRequired {
  adAccountId: string;
}

export interface GetDsaSettingsParams extends TenantRequired {
  adAccountId: string;
}

export interface SetDsaSettingsParams extends TenantRequired {
  adAccountId: string;
  dsaBeneficiary: string;
  dsaPayor: string;
  businessId?: string;
}

export interface SyncTenantAssetsParams extends TenantRequired {
  businessId?: string;
}

export interface ListTenantPagesParams extends TenantScoped {}

export interface SetDefaultPageForAdAccountParams extends TenantRequired {
  adAccountId: string;
  pageId: string;
}

export interface FacebookApiError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export interface FacebookApiResponse<T = unknown> {
  data?: T;
  error?: FacebookApiError;
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
}
