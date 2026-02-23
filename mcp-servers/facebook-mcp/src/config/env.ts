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
  globalSystemUserToken?: string;
  tenantSuTokenMapRaw?: string;
  graphApiVersion: string;
  insightsCacheTtlMs: number;
  graphRetry: GraphRetryConfig;
  policy: PolicyConfig;
}

let cachedConfig: EnvConfig | null = null;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseOptionalToken(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function validateTenantTokenMapJson(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('TENANT_SU_TOKEN_MAP must be valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('TENANT_SU_TOKEN_MAP must be a JSON object keyed by tenantId.');
  }

  for (const [tenantId, token] of Object.entries(parsed as Record<string, unknown>)) {
    if (!tenantId.trim()) {
      throw new Error('TENANT_SU_TOKEN_MAP contains an empty tenantId key.');
    }
    if (typeof token !== 'string' || !token.trim()) {
      throw new Error(`TENANT_SU_TOKEN_MAP has an invalid token for tenantId=${tenantId}.`);
    }
  }

  return raw;
}

export function loadEnvConfig(): EnvConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const globalSystemUserToken = parseOptionalToken(
    process.env.GLOBAL_SYSTEM_USER_TOKEN ||
      process.env.GLOBAL_SU_TOKEN ||
      process.env.META_SYSTEM_USER_TOKEN
  );
  const tenantSuTokenMapRaw = validateTenantTokenMapJson(
    parseOptionalToken(process.env.TENANT_SU_TOKEN_MAP)
  );
  if (!globalSystemUserToken && !tenantSuTokenMapRaw) {
    throw new Error(
      'Configure at least one token source: TENANT_SU_TOKEN_MAP or GLOBAL_SYSTEM_USER_TOKEN.'
    );
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
    globalSystemUserToken,
    tenantSuTokenMapRaw,
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
  };

  return cachedConfig;
}

export function getEnvConfig(): EnvConfig {
  return cachedConfig || loadEnvConfig();
}
