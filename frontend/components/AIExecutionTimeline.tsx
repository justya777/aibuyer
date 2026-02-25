'use client';

import { useState } from 'react';
import clsx from 'clsx';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import type { ExecutionStep, ExecutionSummary } from '@/lib/shared-types';

interface AIExecutionTimelineProps {
  steps: ExecutionStep[];
  summary: ExecutionSummary | null;
  showTechnicalDetails?: boolean;
  onRetryStep?: (step: ExecutionStep) => void;
}

function safeDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatTime(value: string | undefined | null): string {
  const d = safeDate(value);
  if (!d) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(start: string | undefined | null, end: string | undefined | null): string | null {
  const s = safeDate(start);
  const e = safeDate(end);
  if (!s || !e) return null;
  const ms = e.getTime() - s.getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function copyDebugInfo(step: ExecutionStep): void {
  const debug = {
    id: step.id,
    title: step.title,
    type: step.type,
    status: step.status,
    summary: step.summary,
    userTitle: step.userTitle,
    userMessage: step.userMessage,
    rationale: step.rationale,
    fixesApplied: step.fixesApplied,
    attempts: step.attempts,
    startedAt: step.startedAt,
    finishedAt: step.finishedAt,
    meta: step.meta,
    debug: step.debug,
    createdIds: step.createdIds,
    technicalDetails: step.technicalDetails,
  };
  navigator.clipboard.writeText(JSON.stringify(debug, null, 2)).catch(() => {});
}

export default function AIExecutionTimeline({
  steps,
  summary,
  showTechnicalDetails = true,
  onRetryStep,
}: AIExecutionTimelineProps) {
  const ordered = steps
    .slice()
    .sort((a, b) => a.order - b.order || (a.startedAt || '').localeCompare(b.startedAt || ''));

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <div className="flex items-center space-x-2 mb-2">
          <ClockIcon className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">AI Execution Timeline</h3>
        </div>
        <p className="text-sm text-gray-600">
          Real-time step updates with clear outcomes and fixes.
        </p>
      </div>

      <div className="flex-1 overflow-auto space-y-4 pr-1">
        {ordered.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg">
            <InformationCircleIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No execution timeline yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Run a command to stream Campaign &rarr; Ad Set &rarr; Ad steps in real-time.
            </p>
          </div>
        ) : (
          ordered.map((step) => <StepCard key={step.id} step={step} showTechnicalDetails={showTechnicalDetails} onRetryStep={onRetryStep} />)
        )}
      </div>

      {(summary || ordered.length > 0) && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <Metric title="Steps" value={summary ? `${summary.stepsCompleted}/${summary.totalSteps}` : '-'} />
            <Metric title="Retries" value={summary ? String(summary.retries) : '0'} />
            <Metric
              title="Result"
              value={summary ? summary.finalStatus.toUpperCase() : 'RUNNING'}
              valueClass={clsx(
                summary?.finalStatus === 'success' && 'text-emerald-700',
                summary?.finalStatus === 'partial' && 'text-amber-700',
                summary?.finalStatus === 'error' && 'text-rose-700'
              )}
            />
          </div>
          {summary?.finalMessage && (
            <p className="mt-3 text-xs text-gray-600">{summary.finalMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}

function StepCard({
  step,
  showTechnicalDetails,
  onRetryStep,
}: {
  step: ExecutionStep;
  showTechnicalDetails: boolean;
  onRetryStep?: (step: ExecutionStep) => void;
}) {
  const [copied, setCopied] = useState(false);
  const duration = formatDuration(step.startedAt, step.finishedAt);

  const handleCopy = () => {
    copyDebugInfo(step);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4">
      {/* Header: title, duration, status */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">
            {step.order > 0 ? `Step ${step.order} - ${step.title}` : step.title}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {formatTime(step.startedAt) && (
              <span className="text-xs text-gray-500">{formatTime(step.startedAt)}</span>
            )}
            {duration && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                {duration}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            title="Copy debug info"
          >
            <ClipboardDocumentIcon className="h-3.5 w-3.5" />
          </button>
          {copied && <span className="text-[10px] text-emerald-600">Copied</span>}
          <StepStatusBadge step={step} />
        </div>
      </div>

      {/* User summary */}
      <p className="text-sm text-gray-800">{step.summary}</p>
      {step.rationale && (
        <p className="mt-2 text-xs text-slate-600">Decision: {step.rationale}</p>
      )}

      {/* Created IDs */}
      {step.createdIds && Object.values(step.createdIds).some(Boolean) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {step.createdIds.campaignId && (
            <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 border border-blue-200">
              Campaign: {step.createdIds.campaignId}
            </span>
          )}
          {step.createdIds.adSetId && (
            <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 border border-blue-200">
              Ad Set: {step.createdIds.adSetId}
            </span>
          )}
          {step.createdIds.adId && (
            <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 border border-blue-200">
              Ad: {step.createdIds.adId}
            </span>
          )}
        </div>
      )}

      {/* Error block */}
      {step.status === 'error' && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3">
          <p className="text-xs font-semibold text-rose-800">What happened</p>
          <p className="mt-1 text-sm text-rose-900">
            {step.userTitle || 'Execution error'}
            {step.userMessage ? ` - ${step.userMessage}` : ''}
          </p>
          {step.nextSteps && step.nextSteps.length > 0 && (
            <>
              <p className="mt-2 text-xs font-semibold text-rose-800">How to fix</p>
              <ul className="mt-1 list-disc list-inside text-xs text-rose-900 space-y-1">
                {step.nextSteps.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </>
          )}
          {onRetryStep && (
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1 rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-800 hover:bg-rose-100"
              onClick={() => onRetryStep(step)}
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              Retry
            </button>
          )}
        </div>
      )}

      {/* Auto-fixes */}
      {step.fixesApplied && step.fixesApplied.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-800">Auto-fixes applied</p>
          <ul className="mt-1 list-disc list-inside text-xs text-amber-900 space-y-1">
            {step.fixesApplied.map((fix) => (
              <li key={fix}>{fix}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Collapsible technical details */}
      {showTechnicalDetails && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
            Details
          </summary>
          <div className="mt-2 rounded-md bg-gray-50 p-3 space-y-2">
            {step.rationale && (
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase">Decision Reason</p>
                <p className="text-xs text-gray-700">{step.rationale}</p>
              </div>
            )}
            {step.meta?.metaError && (
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase">Meta Error</p>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                  {JSON.stringify(step.meta.metaError, null, 2)}
                </pre>
              </div>
            )}
            {step.technicalDetails && (
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase">Technical Details</p>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                  {step.technicalDetails}
                </pre>
              </div>
            )}
            {step.debug && (
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase">Debug</p>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                  {JSON.stringify(step.debug, null, 2)}
                </pre>
              </div>
            )}
            {step.meta && Object.keys(step.meta).length > 0 && !step.meta.metaError && (
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase">Metadata</p>
                <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                  {JSON.stringify(step.meta, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </details>
      )}
    </article>
  );
}

function Metric({
  title,
  value,
  valueClass,
}: {
  title: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500">{title}</p>
      <p className={clsx('text-sm font-semibold', valueClass)}>{value}</p>
    </div>
  );
}

function StepStatusBadge({ step }: { step: ExecutionStep }) {
  if (step.status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
        <CheckCircleIcon className="h-4 w-4" />
        Success
      </span>
    );
  }
  if (step.status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
        <ExclamationCircleIcon className="h-4 w-4" />
        Error
      </span>
    );
  }
  if (step.status === 'retrying') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
        <ArrowPathIcon className="h-4 w-4" />
        Retrying
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700">
      <ClockIcon className="h-4 w-4" />
      Running
    </span>
  );
}
