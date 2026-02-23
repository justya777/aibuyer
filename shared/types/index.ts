export interface FacebookAccount {
  id: string;
  businessId?: string;
  name: string;
  status: 'active' | 'inactive' | 'limited' | 'disabled';
  currency: string;
  timezone: string;
  lastActivity: Date;
  createdAt: Date;
  
  // Performance Metrics
  metrics: {
    ctr: number; // Click-through rate
    cpm: number; // Cost per mille
    cpc: number; // Cost per click
    budget: number; // Total budget
    spend: number; // Amount spent
    impressions: number;
    clicks: number;
    conversions: number;
    reach: number;
    frequency: number;
  };
  
  // Current campaigns count
  activeCampaigns: number;
  totalCampaigns: number;
}

export interface BusinessPortfolio {
  tenantId: string;
  businessId: string;
  label?: string | null;
  lastSyncAt?: Date | string | null;
  createdAt: Date | string;
}

export interface TenantAdAccountView {
  id: string;
  tenantId: string;
  businessId: string;
  adAccountId: string;
  name: string;
  status: string | null;
  currency: string | null;
  timezoneName: string | null;
  lastSyncedAt: Date | string;
  defaultPageId: string | null;
  dsaBeneficiary: string | null;
  dsaPayor: string | null;
  dsaSource: string | null;
  dsaUpdatedAt: Date | string | null;
}

export interface TenantPageView {
  id: string;
  tenantId: string;
  businessId: string;
  pageId: string;
  name: string;
  source: 'CONFIRMED_BM' | 'FALLBACK_UNVERIFIED';
  confirmed: boolean;
  lastSeenAt?: Date | string;
}

export interface AppSelectionState {
  selectedTenantId: string | null;
  selectedBusinessId: string | null;
  selectedAdAccountId: string | null;
}

export interface Campaign {
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

export interface AIAction {
  id: string;
  timestamp: Date;
  type: 'campaign_create' | 'campaign_update' | 'campaign_pause' | 'campaign_delete' | 'budget_adjust' | 'targeting_update' | 'adset_create' | 'ad_create';
  accountId: string;
  campaignId?: string;
  action: string;
  reasoning: string;
  parameters: Record<string, any>;
  result: 'success' | 'error' | 'pending';
  success?: boolean; // Added for compatibility with existing code
  errorMessage?: string;
  executionTime?: number;
}

export interface AICommand {
  id: string;
  command: string;
  accountId?: string;
  timestamp: Date;
  status: 'pending' | 'processing' | 'completed' | 'error';
  response?: string;
  actions: AIAction[];
}

export interface MCPServerConfig {
  name: string;
  type: 'facebook' | 'octo-browser' | 'keitaro' | 'master';
  endpoint: string;
  status: 'connected' | 'disconnected' | 'error';
  lastPing?: Date;
}

export interface DashboardStats {
  totalAccounts: number;
  activeAccounts: number;
  totalSpend: number;
  totalBudget: number;
  avgCTR: number;
  avgCPM: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
}
