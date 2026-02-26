export type RunEventType =
  | 'step.start'
  | 'step.update'
  | 'step.success'
  | 'step.error'
  | 'autofix.applied'
  | 'retry.scheduled'
  | 'retry.backoff'
  | 'timeline.done';

export interface RunEvent {
  type: RunEventType;
  runId: string;
  stepId?: string;
  tool?: string;
  attempt?: number;
  durationMs?: number;
  label?: string;
  summary?: string;
  status?: string;
  fixes?: string[];
  error?: string;
  errorCode?: number | string;
  errorSubcode?: number | string;
  fbtraceId?: string;
  category?: string;
  userTitle?: string;
  userMsg?: string;
  createdIds?: Record<string, unknown>;
  appliedFixes?: string[];
  sanitizedPayloadHash?: string;
  meta?: Record<string, unknown>;
  ts: string;
}

export class RunLogger {
  private readonly runId: string;
  private readonly autofixSeen = new Set<string>();
  private readonly stepTimers = new Map<string, number>();

  constructor(runId: string) {
    this.runId = runId;
  }

  stepStart(stepId: string, tool: string, attempt: number, label?: string): void {
    this.stepTimers.set(stepId, Date.now());
    this.emit({
      type: 'step.start',
      runId: this.runId,
      stepId,
      tool,
      attempt,
      label: label ?? tool,
      ts: new Date().toISOString(),
    });
  }

  stepSuccess(
    stepId: string,
    tool: string,
    summary: string,
    opts?: {
      userMsg?: string;
      appliedFixes?: string[];
      createdIds?: Record<string, unknown>;
      meta?: Record<string, unknown>;
    }
  ): void {
    this.emit({
      type: 'step.success',
      runId: this.runId,
      stepId,
      tool,
      summary,
      status: 'success',
      durationMs: this.elapsed(stepId),
      userMsg: opts?.userMsg,
      createdIds: opts?.createdIds,
      appliedFixes: opts?.appliedFixes,
      meta: opts?.meta,
      ts: new Date().toISOString(),
    });
  }

  stepError(
    stepId: string,
    tool: string,
    error: string,
    opts?: {
      errorCode?: number | string;
      errorSubcode?: number | string;
      fbtraceId?: string;
      category?: string;
      userTitle?: string;
      userMsg?: string;
    }
  ): void {
    this.emit({
      type: 'step.error',
      runId: this.runId,
      stepId,
      tool,
      error,
      status: 'error',
      durationMs: this.elapsed(stepId),
      errorCode: opts?.errorCode,
      errorSubcode: opts?.errorSubcode,
      fbtraceId: opts?.fbtraceId,
      category: opts?.category,
      userTitle: opts?.userTitle,
      userMsg: opts?.userMsg,
      ts: new Date().toISOString(),
    });
  }

  autofixApplied(stepId: string, tool: string, autofixType: string, message: string): boolean {
    const dedupKey = `${tool}:${autofixType}:${message}`;
    if (this.autofixSeen.has(dedupKey)) return false;
    this.autofixSeen.add(dedupKey);

    this.emit({
      type: 'autofix.applied',
      runId: this.runId,
      stepId,
      tool,
      summary: message,
      category: autofixType,
      ts: new Date().toISOString(),
    });
    return true;
  }

  retryScheduled(stepId: string, tool: string, attempt: number, category: string, appliedFixes?: string[]): void {
    this.emit({
      type: 'retry.scheduled',
      runId: this.runId,
      stepId,
      tool,
      attempt,
      category,
      appliedFixes,
      ts: new Date().toISOString(),
    });
  }

  timelineDone(success: boolean, summary?: string, meta?: Record<string, unknown>): void {
    this.emit({
      type: 'timeline.done',
      runId: this.runId,
      status: success ? 'success' : 'error',
      summary,
      meta,
      ts: new Date().toISOString(),
    });
  }

  resetAutofixDedup(): void {
    this.autofixSeen.clear();
  }

  private elapsed(stepId: string): number | undefined {
    const start = this.stepTimers.get(stepId);
    if (start == null) return undefined;
    return Date.now() - start;
  }

  private emit(event: RunEvent): void {
    console.log(JSON.stringify({ ...event, service: 'ai-execution' }));
  }
}
