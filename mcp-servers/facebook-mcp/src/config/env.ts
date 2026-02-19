export type PolicyEnforcementMode = 'allow_with_warning' | 'block';

export interface GraphRetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
}

export interface PolicyConfig {
  enforcementMode: PolicyEnforcementMode;
  maxBudgetIncreasePercent: number;
  maxMutationsPerTenantPerHour: number;
  broadTargetingAgeSpanThreshold: number;
}

export interface EnvConfig {
  nodeEnv: string;
  port: number;
  logLevel: string;
  metaSystemUserToken: string;
  graphApiVersion: string;
  insightsCacheTtlMs: number;
  graphRetry: GraphRetryConfig;
  policy: PolicyConfig;
  fbDsaBeneficiary?: string;
  fbDsaPayor?: string;
  fbPageId?: string;
}

let cachedConfig: EnvConfig | null = null;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function loadEnvConfig(): EnvConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const metaSystemUserToken = process.env.META_SYSTEM_USER_TOKEN;
  if (!metaSystemUserToken || !metaSystemUserToken.trim()) {
    throw new Error('META_SYSTEM_USER_TOKEN is required.');
  }

  const policyModeEnv = (process.env.POLICY_ENFORCEMENT_MODE || 'allow_with_warning')
    .toLowerCase()
    .trim();
  const enforcementMode: PolicyEnforcementMode =
    policyModeEnv === 'block' ? 'block' : 'allow_with_warning';

  cachedConfig = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parsePositiveInt(process.env.PORT, 3001),
    logLevel: process.env.LOG_LEVEL || 'info',
    metaSystemUserToken: metaSystemUserToken.trim(),
    graphApiVersion: process.env.GRAPH_API_VERSION || 'v23.0',
    insightsCacheTtlMs: parsePositiveInt(process.env.INSIGHTS_CACHE_TTL_MS, 60_000),
    graphRetry: {
      maxRetries: parsePositiveInt(process.env.GRAPH_MAX_RETRIES, 3),
      baseDelayMs: parsePositiveInt(process.env.GRAPH_BASE_DELAY_MS, 300),
      maxDelayMs: parsePositiveInt(process.env.GRAPH_MAX_DELAY_MS, 3_000),
      jitterMs: parsePositiveInt(process.env.GRAPH_RETRY_JITTER_MS, 100),
    },
    policy: {
      enforcementMode,
      maxBudgetIncreasePercent: parsePositiveInt(
        process.env.POLICY_MAX_BUDGET_INCREASE_PERCENT,
        50
      ),
      maxMutationsPerTenantPerHour: parsePositiveInt(
        process.env.POLICY_MAX_MUTATIONS_PER_TENANT_PER_HOUR,
        120
      ),
      broadTargetingAgeSpanThreshold: parsePositiveInt(
        process.env.POLICY_BROAD_TARGETING_AGE_SPAN_THRESHOLD,
        35
      ),
    },
    fbDsaBeneficiary: process.env.FB_DSA_BENEFICIARY,
    fbDsaPayor: process.env.FB_DSA_PAYOR,
    fbPageId: process.env.FB_PAGE_ID,
  };

  return cachedConfig;
}

export function getEnvConfig(): EnvConfig {
  return cachedConfig || loadEnvConfig();
}
