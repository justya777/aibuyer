import type {
  ExecutionBlockingError,
  ExecutionStep,
  ExecutionSummary,
} from '../../../shared/types';

type SessionStatus = 'pending' | 'running' | 'completed' | 'error';

export interface ExecutionSession {
  id: string;
  runId?: string;
  userId: string;
  tenantId: string;
  command: string;
  accountId: string;
  businessId?: string;
  requestCookie?: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  steps: ExecutionStep[];
  summary?: ExecutionSummary;
  reasoning?: string;
  message?: string;
  blockingError?: ExecutionBlockingError;
  lastError?: string;
}

const SESSION_TTL_MS = 60 * 60 * 1000;

function getStore(): Map<string, ExecutionSession> {
  const globalKey = '__aiExecutionSessions';
  const globalScope = globalThis as unknown as Record<string, Map<string, ExecutionSession>>;
  if (!globalScope[globalKey]) {
    globalScope[globalKey] = new Map<string, ExecutionSession>();
  }
  return globalScope[globalKey];
}

export function createExecutionSession(input: {
  runId?: string;
  userId: string;
  tenantId: string;
  command: string;
  accountId: string;
  businessId?: string;
  requestCookie?: string;
}): ExecutionSession {
  const store = getStore();
  pruneExpiredSessions(store);
  const now = new Date().toISOString();
  const session: ExecutionSession = {
    id: crypto.randomUUID(),
    runId: input.runId,
    userId: input.userId,
    tenantId: input.tenantId,
    command: input.command,
    accountId: input.accountId,
    businessId: input.businessId,
    requestCookie: input.requestCookie,
    createdAt: now,
    updatedAt: now,
    status: 'pending',
    steps: [],
  };
  store.set(session.id, session);
  return session;
}

export function getExecutionSession(executionId: string): ExecutionSession | null {
  const store = getStore();
  pruneExpiredSessions(store);
  return store.get(executionId) || null;
}

export function updateExecutionSession(
  executionId: string,
  updater: (session: ExecutionSession) => ExecutionSession
): ExecutionSession | null {
  const store = getStore();
  const current = store.get(executionId);
  if (!current) return null;
  const next = updater(current);
  next.updatedAt = new Date().toISOString();
  store.set(executionId, next);
  return next;
}

function pruneExpiredSessions(store: Map<string, ExecutionSession>): void {
  const now = Date.now();
  store.forEach((session, id) => {
    const updatedAt = Date.parse(session.updatedAt);
    if (!Number.isFinite(updatedAt)) {
      store.delete(id);
      return;
    }
    if (now - updatedAt > SESSION_TTL_MS) {
      store.delete(id);
    }
  });
}
