import dotenv from 'dotenv';

export type PolicyEnforcementMode = 'allow_with_warning' | 'block';

export interface TenantAccessConfig {
  allowedAdAccountIds: string[];
  systemUserTokenRef: string;
}

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
  graphApiVersion: string;
  insightsCacheTtlMs: number;
  tenantTokenMap: Record<string, string>;
  tenantAccessMap: Record<string, TenantAccessConfig>;
  graphRetry: GraphRetryConfig;
  policy: PolicyConfig;
  fbDsaBeneficiary?: string;
  fbDsaPayor?: string;
  fbPageId?: string;
  frontendUrl?: string;
  ngrokUrl?: string;
}

let envLoaded = false;
let cachedConfig: EnvConfig | null = null;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseJsonRecord<T>(raw: string | undefined, varName: string): Record<string, T> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, T>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${varName} must be a JSON object`);
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `Invalid ${varName}. Expected JSON object. ${
        error instanceof Error ? error.message : 'Unknown parse error'
      }`
    );
  }
}

function normalizeAdAccountId(adAccountId: string): string {
  return adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
}

function parseTenantAccessMap(raw: string | undefined): Record<string, TenantAccessConfig> {
  const input = parseJsonRecord<{
    allowedAdAccountIds?: string[];
    systemUserTokenRef?: string;
  }>(raw, 'TENANT_ACCESS_MAP');

  const output: Record<string, TenantAccessConfig> = {};
  for (const [tenantId, cfg] of Object.entries(input)) {
    const allowedAdAccountIds = Array.isArray(cfg?.allowedAdAccountIds)
      ? cfg.allowedAdAccountIds.map((id) => normalizeAdAccountId(id))
      : [];
    const systemUserTokenRef = cfg?.systemUserTokenRef || tenantId;

    output[tenantId] = {
      allowedAdAccountIds,
      systemUserTokenRef,
    };
  }

  return output;
}

export function loadEnvConfig(): EnvConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  if (!envLoaded) {
    dotenv.config();
    envLoaded = true;
  }

  const tenantTokenMap = parseJsonRecord<string>(
    process.env.TENANT_SU_TOKEN_MAP,
    'TENANT_SU_TOKEN_MAP'
  );
  const tenantAccessMap = parseTenantAccessMap(process.env.TENANT_ACCESS_MAP);

  const policyModeEnv = (process.env.POLICY_ENFORCEMENT_MODE || 'allow_with_warning')
    .toLowerCase()
    .trim();
  const enforcementMode: PolicyEnforcementMode =
    policyModeEnv === 'block' ? 'block' : 'allow_with_warning';

  cachedConfig = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parsePositiveInt(process.env.PORT, 3001),
    logLevel: process.env.LOG_LEVEL || 'info',
    graphApiVersion: process.env.GRAPH_API_VERSION || 'v23.0',
    insightsCacheTtlMs: parsePositiveInt(process.env.INSIGHTS_CACHE_TTL_MS, 60_000),
    tenantTokenMap,
    tenantAccessMap,
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
    frontendUrl: process.env.FRONTEND_URL,
    ngrokUrl: process.env.NGROK_URL,
  };

  return cachedConfig;
}

export function getEnvConfig(): EnvConfig {
  return cachedConfig || loadEnvConfig();
}
