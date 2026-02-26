import { logger } from './logger.js';

export type RunEventType =
  | 'step.start'
  | 'step.update'
  | 'step.success'
  | 'step.error'
  | 'autofix.applied'
  | 'retry.scheduled'
  | 'timeline.done';

export interface RunEvent {
  type: RunEventType;
  runId: string;
  stepId?: string;
  tool?: string;
  attempt?: number;
  label?: string;
  summary?: string;
  status?: string;
  fixes?: string[];
  error?: string;
  category?: string;
  appliedChanges?: string[];
  meta?: Record<string, unknown>;
  ts: string;
}

/**
 * Structured logger for AI execution runs.
 * Emits JSON-line events to console that mirror the SSE event schema,
 * and deduplicates autofix events per attempt.
 */
export class RunLogger {
  private readonly runId: string;
  private readonly autofixSeen = new Set<string>();

  constructor(runId: string) {
    this.runId = runId;
  }

  stepStart(stepId: string, tool: string, attempt: number, label?: string): void {
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

  stepUpdate(stepId: string, tool: string, summary: string, meta?: Record<string, unknown>): void {
    this.emit({
      type: 'step.update',
      runId: this.runId,
      stepId,
      tool,
      summary,
      meta,
      ts: new Date().toISOString(),
    });
  }

  stepSuccess(stepId: string, tool: string, summary: string, meta?: Record<string, unknown>): void {
    this.emit({
      type: 'step.success',
      runId: this.runId,
      stepId,
      tool,
      summary,
      status: 'success',
      meta,
      ts: new Date().toISOString(),
    });
  }

  stepError(stepId: string, tool: string, error: string, meta?: Record<string, unknown>): void {
    this.emit({
      type: 'step.error',
      runId: this.runId,
      stepId,
      tool,
      error,
      status: 'error',
      meta,
      ts: new Date().toISOString(),
    });
  }

  /**
   * Emits an autofix event, deduplicating by tool+type+message within the run.
   * Returns true if the event was emitted (not a duplicate).
   */
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

  retryScheduled(
    stepId: string,
    tool: string,
    attempt: number,
    category: string,
    appliedChanges?: string[]
  ): void {
    this.emit({
      type: 'retry.scheduled',
      runId: this.runId,
      stepId,
      tool,
      attempt,
      category,
      appliedChanges,
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

  private emit(event: RunEvent): void {
    logger.info(`[run:${event.type}]`, {
      ...event,
      service: 'ai-execution',
    });
  }
}
