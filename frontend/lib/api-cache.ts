type CacheEntry<T = unknown> = {
  data: T;
  storedAt: number;
};

export const TTL = {
  HIERARCHY: 30_000,
  INSIGHTS: 120_000,
  DEFAULT: 60_000,
} as const;

const DEFAULT_TTL_MS = TTL.DEFAULT;

const globalKey = '__apiCacheStore';
const cooldownKey = '__apiCooldownStore';
const globalScope = globalThis as unknown as Record<string, unknown>;

function getStore(): Map<string, CacheEntry> {
  if (!globalScope[globalKey]) {
    globalScope[globalKey] = new Map<string, CacheEntry>();
  }
  return globalScope[globalKey] as Map<string, CacheEntry>;
}

interface CooldownEntry {
  until: number;
  consecutiveHits: number;
}

function getCooldownStore(): Map<string, CooldownEntry> {
  if (!globalScope[cooldownKey]) {
    globalScope[cooldownKey] = new Map<string, CooldownEntry>();
  }
  return globalScope[cooldownKey] as Map<string, CooldownEntry>;
}

const BASE_COOLDOWN_MS = 10_000;
const MAX_COOLDOWN_MS = 300_000;

export function markCooldown(accountKey: string): number {
  const store = getCooldownStore();
  const existing = store.get(accountKey);
  const consecutiveHits = (existing?.consecutiveHits ?? 0) + 1;
  const cooldownMs = Math.min(BASE_COOLDOWN_MS * 2 ** (consecutiveHits - 1), MAX_COOLDOWN_MS);
  store.set(accountKey, { until: Date.now() + cooldownMs, consecutiveHits });
  return cooldownMs;
}

export function isCoolingDown(accountKey: string): { cooling: boolean; retryAfterMs: number } {
  const store = getCooldownStore();
  const entry = store.get(accountKey);
  if (!entry) return { cooling: false, retryAfterMs: 0 };
  const remaining = entry.until - Date.now();
  if (remaining <= 0) {
    return { cooling: false, retryAfterMs: 0 };
  }
  return { cooling: true, retryAfterMs: remaining };
}

export function clearCooldown(accountKey: string): void {
  getCooldownStore().delete(accountKey);
}

function buildKey(parts: string[]): string {
  return parts.filter(Boolean).join(':');
}

export function cacheGet<T = unknown>(keyParts: string[], ttlMs = DEFAULT_TTL_MS): T | null {
  const store = getStore();
  const key = buildKey(keyParts);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > ttlMs) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function cacheGetStale<T = unknown>(keyParts: string[]): T | null {
  const store = getStore();
  const key = buildKey(keyParts);
  const entry = store.get(key);
  if (!entry) return null;
  return entry.data as T;
}

export function cacheGetWithAge<T = unknown>(
  keyParts: string[],
  ttlMs = DEFAULT_TTL_MS
): { data: T; ageMs: number; stale: boolean } | null {
  const store = getStore();
  const key = buildKey(keyParts);
  const entry = store.get(key);
  if (!entry) return null;
  const ageMs = Date.now() - entry.storedAt;
  return { data: entry.data as T, ageMs, stale: ageMs > ttlMs };
}

export function cacheSet<T = unknown>(keyParts: string[], data: T): void {
  const store = getStore();
  const key = buildKey(keyParts);
  store.set(key, { data, storedAt: Date.now() });
  pruneIfNeeded(store);
}

function pruneIfNeeded(store: Map<string, CacheEntry>): void {
  if (store.size < 200) return;
  const now = Date.now();
  const maxAge = 5 * 60_000;
  for (const [key, entry] of store) {
    if (now - entry.storedAt > maxAge) {
      store.delete(key);
    }
  }
}

export function cacheSetSnapshot<T = unknown>(
  adAccountId: string,
  campaignId: string,
  data: T
): void {
  cacheSet(['snapshot', adAccountId, campaignId], data);
}

export function cacheGetSnapshot<T = unknown>(
  adAccountId: string,
  campaignId: string
): T | null {
  return cacheGetStale<T>(['snapshot', adAccountId, campaignId]);
}

export function isRateLimitMessage(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const lower = msg.toLowerCase();
  return (
    lower.includes('too many calls') ||
    lower.includes('too many api calls') ||
    lower.includes('user request limit reached') ||
    lower.includes('code=4') ||
    lower.includes('code=17') ||
    lower.includes('code=32') ||
    lower.includes('subcode=2446079') ||
    lower.includes('2446079')
  );
}

export function estimateRetryAfterMs(error: unknown): number {
  const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (msg.includes('2446079') || msg.toLowerCase().includes('too many api calls')) {
    return 10_000;
  }
  return 5_000;
}
