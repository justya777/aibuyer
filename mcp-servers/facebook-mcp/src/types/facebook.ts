// Shared types from the main shared directory
export interface FacebookPage {
  id: string;
  name: string;
  category: string;
  tasks: string[]; // Permissions like 'MANAGE', 'CREATE_CONTENT', 'ADVERTISE'
  accessToken?: string;
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
    locales?: number[]; // Language targeting using Facebook locale IDs
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
    title?: string;
    body?: string;
    imageUrl?: string;
    videoUrl?: string;
    linkUrl?: string;
    urlParameters?: string; // URL tracking parameters (e.g., utm_campaign={{campaign.name}}&pixel=test)
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

// MCP Tool Parameter Types
export interface GetAccountsParams {
  limit?: number;
  fields?: string[];
}

export interface GetPagesParams {
  limit?: number;
  fields?: string[];
}

export interface GetCampaignsParams {
  accountId: string;
  limit?: number;
  status?: string[];
}

export interface CreateCampaignParams {
  accountId: string;
  name: string;
  objective: string;
  status?: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
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

export interface UpdateCampaignParams {
  campaignId: string;
  name?: string;
  status?: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
}

export interface GetInsightsParams {
  accountId?: string;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  level: 'account' | 'campaign' | 'adset' | 'ad';
  fields?: string[];
  datePreset?: string;
}

// Ad Set Parameter Types
export interface GetAdSetsParams {
  campaignId: string;
  limit?: number;
  status?: string[];
}

export interface CreateAdSetParams {
  accountId: string;
  campaignId: string;
  name: string;
  optimizationGoal: string;
  billingEvent: string;
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
    locales?: number[]; // Language targeting using Facebook locale IDs
  };
}

export interface UpdateAdSetParams {
  adSetId: string;
  name?: string;
  status?: string;
  optimizationGoal?: string;
  billingEvent?: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
}

// Ad Parameter Types
export interface GetAdsParams {
  adSetId?: string;
  campaignId?: string;
  limit?: number;
  status?: string[];
}

export interface CreateAdParams {
  accountId: string;
  adSetId: string;
  name: string;
  status?: string;
  creative: {
    title?: string;
    body?: string;
    imageUrl?: string;
    videoUrl?: string;
    linkUrl?: string;
    urlParameters?: string; // URL tracking parameters (e.g., utm_campaign={{campaign.name}}&pixel=test)
    callToAction?: string;
    displayLink?: string;
  };
}

export interface UpdateAdParams {
  adId: string;
  name?: string;
  status?: string;
  creative?: {
    title?: string;
    body?: string;
    imageUrl?: string;
    videoUrl?: string;
    linkUrl?: string;
    urlParameters?: string; // URL tracking parameters (e.g., utm_campaign={{campaign.name}}&pixel=test)
    callToAction?: string;
    displayLink?: string;
  };
}

// Facebook API Response Types
export interface FacebookApiError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id: string;
}

export interface FacebookApiResponse<T = any> {
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
