import type { CreatedEntityIds, ExecutionStep, ExecutionSummary } from '@/lib/shared-types';

export function buildStepFromSsePayload(payload: any): ExecutionStep | null {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.step && typeof payload.step === 'object') {
    return payload.step as ExecutionStep;
  }
  if (!payload.stepId) return null;
  const ts = typeof payload.ts === 'string' ? payload.ts : new Date().toISOString();
  return {
    id: String(payload.stepId),
    order: typeof payload.order === 'number' ? payload.order : 99,
    title: String(payload.label || payload.stepId),
    type: payload.type || 'validation',
    status: payload.status || 'running',
    summary: payload.summary || 'Step update',
    userTitle: payload.userTitle,
    userMessage: payload.userMessage,
    nextSteps: Array.isArray(payload.nextSteps) ? payload.nextSteps : undefined,
    rationale: payload.rationale,
    debug: payload.debug,
    createdIds: payload.ids,
    startedAt: ts,
    finishedAt:
      payload.status === 'success' || payload.status === 'error'
        ? ts
        : undefined,
  };
}

export function parseTimelineDonePayload(payload: any): {
  success: boolean;
  summary: ExecutionSummary | null;
  createdIds?: CreatedEntityIds;
} {
  const summary = payload?.summary && typeof payload.summary === 'object'
    ? (payload.summary as ExecutionSummary)
    : null;
  return {
    success: Boolean(payload?.success),
    summary,
    createdIds: payload?.createdIds,
  };
}
