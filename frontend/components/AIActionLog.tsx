'use client';

import clsx from 'clsx';
import {
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import type { ExecutionStep, ExecutionSummary } from '@/lib/shared-types';
import { safeTimeFormat } from '@/lib/date-utils';

interface AIActionLogProps {
  steps: ExecutionStep[];
  summary: ExecutionSummary | null;
  showTechnicalDetails?: boolean;
}

export default function AIActionLog({ steps, summary, showTechnicalDetails = false }: AIActionLogProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <div className="flex items-center space-x-2 mb-2">
          <ClockIcon className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">AI Execution Timeline</h3>
        </div>
        <p className="text-sm text-gray-600">
          Real-time step-by-step execution with readable status and errors
        </p>
      </div>

      <div className="flex-1 overflow-auto space-y-4">
        {steps.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg">
            <InformationCircleIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No execution timeline yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Run a command to stream Campaign → Ad Set → Ad execution steps
            </p>
          </div>
        ) : (
          steps
            .slice()
            .sort((a, b) => a.order - b.order || a.startedAt.localeCompare(b.startedAt))
            .map((step) => (
              <div
                key={step.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {step.order > 0 ? `Step ${step.order} — ${step.title}` : step.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {safeTimeFormat(step.startedAt)}
                      {step.finishedAt ? ` → ${safeTimeFormat(step.finishedAt)}` : ''}
                    </p>
                  </div>
                  <StepStatusBadge step={step} />
                </div>

                <p className="text-sm text-gray-800">{step.summary}</p>

                {step.userMessage ? (
                  <p className="text-sm text-gray-600 mt-2">{step.userMessage}</p>
                ) : null}

                {step.fixesApplied && step.fixesApplied.length > 0 ? (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <p className="text-xs font-semibold text-amber-800 mb-2">Fixes Applied</p>
                    <ul className="text-xs text-amber-900 space-y-1 list-disc list-inside">
                      {step.fixesApplied.map((fix) => (
                        <li key={fix}>{fix}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {showTechnicalDetails &&
                (step.technicalDetails || (step.meta && Object.keys(step.meta).length > 0)) && (
                  <details className="mt-3">
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                      Technical details
                    </summary>
                    <div className="mt-2 p-3 bg-gray-50 rounded-md space-y-2">
                      {step.technicalDetails ? (
                        <p className="text-xs text-gray-700 whitespace-pre-wrap">
                          {step.technicalDetails}
                        </p>
                      ) : null}
                      {step.meta && Object.keys(step.meta).length > 0 ? (
                        <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                          {JSON.stringify(step.meta, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  </details>
                )}
              </div>
            ))
        )}
      </div>

      {(summary || steps.length > 0) && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-500">Steps Completed</p>
              <p className="text-sm font-semibold">
                {summary ? `${summary.stepsCompleted} / ${summary.totalSteps}` : '-'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Retries</p>
              <p className="text-sm font-semibold">{summary ? summary.retries : 0}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Final Status</p>
              <p
                className={clsx(
                  'text-sm font-semibold',
                  summary?.finalStatus === 'success' && 'text-green-700',
                  summary?.finalStatus === 'partial' && 'text-amber-700',
                  summary?.finalStatus === 'error' && 'text-red-700'
                )}
              >
                {summary ? summary.finalStatus.toUpperCase() : 'RUNNING'}
              </p>
            </div>
          </div>
          {summary?.finalMessage ? (
            <p className="text-xs text-gray-600 mt-3">{summary.finalMessage}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function StepStatusBadge({ step }: { step: ExecutionStep }) {
  if (step.status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-50 text-green-700 border border-green-200">
        <CheckCircleIcon className="w-4 h-4" />
        Success
      </span>
    );
  }
  if (step.status === 'retrying') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200">
        <WrenchScrewdriverIcon className="w-4 h-4" />
        Retrying ({step.attempts || 1})
      </span>
    );
  }
  if (step.status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-50 text-red-700 border border-red-200">
        <ExclamationCircleIcon className="w-4 h-4" />
        Error
      </span>
    );
  }
  if (step.status === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200">
        <ExclamationTriangleIcon className="w-4 h-4" />
        Warning
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">
      <ClockIcon className="w-4 h-4" />
      Running
    </span>
  );
}
