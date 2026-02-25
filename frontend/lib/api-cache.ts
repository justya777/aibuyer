type CacheEntry<T = unknown> = {
  data: T;
  storedAt: number;
};

const DEFAULT_TTL_MS = 30_000;

const globalKey = '__apiCacheStore';
const globalScope = globalThis as unknown as Record<string, Map<string, CacheEntry>>;

function getStore(): Map<string, CacheEntry> {
  if (!globalScope[globalKey]) {
    globalScope[globalKey] = new Map<string, CacheEntry>();
  }
  return globalScope[globalKey];
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
