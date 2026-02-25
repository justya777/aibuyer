/**
 * Per-account request queue with concurrency limiting.
 * Prevents flooding Meta Graph API by limiting concurrent
 * requests per ad account (act_...).
 */

const MAX_CONCURRENT_PER_ACCOUNT = 2;

interface QueueEntry {
  resolve: (value: void) => void;
}

interface AccountQueue {
  active: number;
  waiting: QueueEntry[];
}

const queues = new Map<string, AccountQueue>();

function getQueue(accountId: string): AccountQueue {
  let q = queues.get(accountId);
  if (!q) {
    q = { active: 0, waiting: [] };
    queues.set(accountId, q);
  }
  return q;
}

function release(accountId: string): void {
  const q = queues.get(accountId);
  if (!q) return;
  q.active--;
  if (q.waiting.length > 0) {
    const next = q.waiting.shift()!;
    q.active++;
    next.resolve();
  }
  if (q.active === 0 && q.waiting.length === 0) {
    queues.delete(accountId);
  }
}

async function acquire(accountId: string): Promise<void> {
  const q = getQueue(accountId);
  if (q.active < MAX_CONCURRENT_PER_ACCOUNT) {
    q.active++;
    return;
  }
  return new Promise<void>((resolve) => {
    q.waiting.push({ resolve });
  });
}

/**
 * Execute an async function with per-account concurrency limiting.
 * At most MAX_CONCURRENT_PER_ACCOUNT requests run simultaneously
 * for the same ad account ID.
 */
export async function withAccountQueue<T>(
  accountId: string,
  fn: () => Promise<T>
): Promise<T> {
  const normalizedId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  await acquire(normalizedId);
  try {
    return await fn();
  } finally {
    release(normalizedId);
  }
}

/**
 * Get current queue stats for debugging.
 */
export function getQueueStats(): Record<string, { active: number; waiting: number }> {
  const stats: Record<string, { active: number; waiting: number }> = {};
  for (const [id, q] of queues) {
    stats[id] = { active: q.active, waiting: q.waiting.length };
  }
  return stats;
}
