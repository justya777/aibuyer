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

export interface EntityPerformance {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  conversions: number;
  costPerConversion: number;
}

export interface TargetingSnapshot {
  countries: string[];
  ageMin?: number;
  ageMax?: number;
  gender?: 'male' | 'female' | 'all';
  interests: string[];
  behaviors: string[];
  languages?: string[];
}

export interface AdAccountHierarchyAd {
  id: string;
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
  };
  performance: EntityPerformance;
  createdAt: string;
  updatedAt: string;
}

export interface AdAccountHierarchyAdSet {
  id: string;
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
  targeting: TargetingSnapshot;
  targetingSummary: string;
  performance: EntityPerformance;
  ads: AdAccountHierarchyAd[];
  createdAt: string;
  updatedAt: string;
}

export interface AdAccountHierarchyCampaign {
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
  targeting: TargetingSnapshot;
  targetingSummary: string;
  performance: EntityPerformance;
  adSets: AdAccountHierarchyAdSet[];
  startDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdAccountQuickMetrics {
  spend7d: number;
  ctr7d: number;
  activeCampaigns: number;
  activeAdSets: number;
  activeAds: number;
}

export interface AdAccountHealthIndicators {
  billingOk: boolean;
  dsaOk: boolean;
  pageConnected: boolean;
}

export interface AdAccountHierarchyPayload {
  adAccount: {
    adAccountId: string;
    name: string;
    status: string | null;
    defaultPageId: string | null;
    dsaBeneficiary: string | null;
    dsaPayor: string | null;
    dsaConfigured: boolean;
  };
  quickMetrics: AdAccountQuickMetrics;
  health: AdAccountHealthIndicators;
  campaigns: AdAccountHierarchyCampaign[];
  adSets: AdAccountHierarchyAdSet[];
  ads: AdAccountHierarchyAd[];
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

export type ExecutionStepType = 'campaign' | 'adset' | 'ad' | 'validation' | 'error';

export type ExecutionStepStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'error'
  | 'retrying'
  | 'warning';

export interface CreatedEntityIds {
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  adSetIds?: string[];
  adIds?: string[];
}

export interface ExecutionStep {
  id: string;
  order: number;
  title: string;
  type: ExecutionStepType;
  status: ExecutionStepStatus;
  summary: string;
  userTitle?: string;
  userMessage?: string;
  nextSteps?: string[];
  rationale?: string;
  technicalDetails?: string;
  fixesApplied?: string[];
  attempts?: number;
  meta?: Record<string, any>;
  debug?: Record<string, any>;
  createdIds?: CreatedEntityIds;
  startedAt: string;
  finishedAt?: string;
}

export interface ExecutionSummary {
  stepsCompleted: number;
  totalSteps: number;
  retries: number;
  finalStatus: 'success' | 'error' | 'partial';
  finalMessage: string;
  createdIds?: CreatedEntityIds;
}

export interface ExecutionBlockingError {
  code: 'DSA_REQUIRED' | 'DEFAULT_PAGE_REQUIRED' | 'PAYMENT_METHOD_REQUIRED';
  category?: string;
  blocking?: boolean;
  userTitle?: string;
  userMessage?: string;
  message: string;
  nextSteps: string[];
  debug?: Record<string, unknown>;
  action?:
    | {
        type: 'OPEN_DSA_SETTINGS';
        tenantId: string;
        adAccountId: string;
      }
    | {
        type: 'OPEN_DEFAULT_PAGE_SETTINGS';
        tenantId: string;
        adAccountId: string;
      };
}

export type ExecutionStreamEvent =
  | {
      type: 'timeline.start';
      runId?: string;
      executionId: string;
      ts: string;
    }
  | {
      type: 'step.start' | 'step.update' | 'step.success' | 'step.error';
      runId?: string;
      stepId: string;
      label: string;
      status: ExecutionStepStatus;
      summary?: string;
      userTitle?: string;
      userMessage?: string;
      nextSteps?: string[];
      rationale?: string;
      debug?: Record<string, unknown>;
      ids?: CreatedEntityIds;
      ts: string;
      step?: ExecutionStep;
    }
  | {
      type: 'timeline.done';
      runId?: string;
      success: boolean;
      createdIds?: CreatedEntityIds;
      summary: ExecutionSummary;
      ts: string;
    }
  | {
      type: 'step_update';
      step: ExecutionStep;
    }
  | {
      type: 'execution_summary';
      summary: ExecutionSummary;
    }
  | {
      type: 'execution_error';
      error: ExecutionBlockingError | { message: string };
    }
  | {
      type: 'done';
      summary: ExecutionSummary;
    };

export interface TimelineEvent {
  runId: string;
  stepId: string;
  stepIndex: number;
  tool: string;
  label: string;
  status: 'running' | 'retrying' | 'success' | 'error';
  startTs: string;
  endTs?: string;
  userSummary: string;
  decisionReason?: string;
  autofixes: string[];
  metaError?: {
    code: number;
    subcode?: number;
    user_title?: string;
    user_msg?: string;
    fbtrace_id?: string;
  };
  created?: Partial<CreatedEntityIds>;
  payloadPreview?: Record<string, unknown>;
  responsePreview?: Record<string, unknown>;
}

export interface TargetingConstraints {
  language?: string;
  localeIds?: number[];
  localeNames?: string[];
  ageMin?: number;
  ageMax?: number;
  countries?: string[];
  gender?: 'all' | 'male' | 'female';
  interests?: string[];
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
