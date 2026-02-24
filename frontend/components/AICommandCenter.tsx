'use client'

import { useState, useRef, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import type { ExecutionStep, ExecutionSummary, FacebookAccount } from '@/lib/shared-types'
import { 
  PaperAirplaneIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  PaperClipIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'

interface AICommandCenterProps {
  selectedAccount: FacebookAccount | null
  selectedTenantId?: string | null
  selectedBusinessId?: string | null
  requiresDefaultPage?: boolean
  accountContext?: {
    defaultPageId: string | null
    dsaConfigured: boolean
    health?: {
      billingOk: boolean
      dsaOk: boolean
      pageConnected: boolean
    }
  }
  executionSteps?: ExecutionStep[]
  executionSummary?: ExecutionSummary | null
  onNavigateToDefaultPage?: () => void
  onNavigateToDsaSettings?: (adAccountId: string) => void
  onExecutionReset: () => void
  onStepUpdate: (step: ExecutionStep) => void
  onSummary: (summary: ExecutionSummary) => void
}

type BlockingAction =
  | {
      type: 'OPEN_DSA_SETTINGS'
      tenantId?: string
      adAccountId?: string
    }
  | {
      type: 'OPEN_DEFAULT_PAGE_SETTINGS'
      tenantId?: string
      adAccountId?: string
    }
  | {
      type: 'RESOLVE_PAYMENT_METHOD'
      tenantId?: string
      adAccountId?: string
    };

export default function AICommandCenter({
  selectedAccount,
  selectedTenantId,
  selectedBusinessId,
  requiresDefaultPage = false,
  accountContext,
  executionSteps = [],
  executionSummary = null,
  onNavigateToDefaultPage,
  onNavigateToDsaSettings,
  onExecutionReset,
  onStepUpdate,
  onSummary,
}: AICommandCenterProps) {
  const COMMAND_TIMEOUT_MS = 120000
  const [command, setCommand] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([])
  const [showUploadZone, setShowUploadZone] = useState(false)
  const [blockingMessage, setBlockingMessage] = useState<string | null>(null)
  const [blockingAction, setBlockingAction] = useState<BlockingAction | null>(null)
  const [suggestions] = useState([
    // Campaign operations with targeting - Updated objectives
    'Create a leads campaign for Romanian men on romanian language aged 20-45 interested in investments with $15 daily budget with the link https://domain.com/test?utm_campaign={{campaign.name}}&utm_source={{site_source_name}}',
    // 'Create a traffic campaign for US users aged 25-45 interested in technology with $20 daily budget',
    // 'Create a sales campaign for European small business owners aged 30-55 with $25 daily budget',
    // 'Activate all campaigns',
    // 'Pause all campaigns with CTR below 1%',
    // 'Create leads campaign with 2 ads - use pr.mp4 for first ad, man.jpeg for 2nd for Romanian men on romanian language aged 20-45 interested in investments with $15 daily budget with the link https://domain.com/test?utm_campaign={{campaign.name}}&utm_source={{site_source_name}}',

  ])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // File upload handling
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('adName', selectedAccount?.name || 'ai-command');
      formData.append('type', file.type.startsWith('image/') ? 'image' : 'video');

      try {
        const response = await fetch('/api/upload-materials', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();
        if (result.success) {
          setUploadedFiles(prev => [...prev, {
            ...result.material,
            file: file
          }]);
        } else {
          setBlockingMessage(`Material upload failed for ${file.name}.`);
        }
      } catch (error) {
        setBlockingMessage(error instanceof Error ? error.message : 'Material upload failed.');
      }
    }
  }, [selectedAccount]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 5,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'video/mp4': ['.mp4'],
      'video/mov': ['.mov']
    },
    disabled: !selectedAccount
  });

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim() || !selectedAccount || !selectedBusinessId) return

    onExecutionReset()
    setBlockingMessage(null)
    setBlockingAction(null)
    setIsProcessing(true)

    try {
      const response = await fetch('/api/ai-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(selectedTenantId ? { 'x-tenant-id': selectedTenantId } : {}),
        },
        body: JSON.stringify({
          command: command,
          accountId: selectedAccount.id,
          businessId: selectedBusinessId,
        }),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null)
        const actionableCode = errorPayload?.code
        if (typeof errorPayload?.message === 'string') {
          setBlockingMessage(errorPayload.message)
        }
        if (
          actionableCode === 'DSA_REQUIRED' &&
          errorPayload?.action?.type === 'OPEN_DSA_SETTINGS'
        ) {
          setBlockingAction(errorPayload.action as BlockingAction)
        } else if (
          actionableCode === 'DEFAULT_PAGE_REQUIRED' &&
          errorPayload?.action?.type === 'OPEN_DEFAULT_PAGE_SETTINGS'
        ) {
          setBlockingAction(errorPayload.action as BlockingAction)
        } else if (actionableCode === 'PAYMENT_METHOD_REQUIRED') {
          setBlockingAction({
            type: 'RESOLVE_PAYMENT_METHOD',
            tenantId: selectedTenantId || undefined,
            adAccountId: selectedAccount.id,
          })
        } else {
          setBlockingAction(null)
        }
        const baseMessage =
          errorPayload?.message ||
          errorPayload?.error ||
          `HTTP error! status: ${response.status}`
        const nextSteps =
          Array.isArray(errorPayload?.nextSteps) && errorPayload.nextSteps.length > 0
            ? ` Next steps: ${errorPayload.nextSteps.join(' ')}`
            : ''
        throw new Error(`${baseMessage}${nextSteps}`)
      }

      const result = await response.json().catch(() => null)
      if (!result?.success || !result?.executionId) {
        throw new Error(result?.error || 'Failed to start execution stream.')
      }

      setBlockingMessage(null)
      setBlockingAction(null)
      await consumeExecutionStream(result.executionId)
      setCommand('')
    } catch (error) {
      const displayError =
        error instanceof Error && error.name === 'AbortError'
          ? `Request timed out after ${COMMAND_TIMEOUT_MS / 1000}s`
          : error instanceof Error
            ? error.message
            : 'Unknown error occurred'

      setBlockingMessage(displayError)
      onSummary({
        stepsCompleted: 0,
        totalSteps: 3,
        retries: 0,
        finalStatus: 'error',
        finalMessage: displayError,
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const consumeExecutionStream = async (executionId: string) => {
    await new Promise<void>((resolve, reject) => {
      const source = new EventSource(`/api/ai-command/stream?executionId=${encodeURIComponent(executionId)}`)

      source.addEventListener('step_update', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data)
          if (payload?.type === 'step_update' && payload.step) {
            onStepUpdate(payload.step)
          }
        } catch (parseError) {
          setBlockingMessage('Step update stream parse error.')
        }
      })

      source.addEventListener('execution_summary', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data)
          if (payload?.type === 'execution_summary' && payload.summary) {
            onSummary(payload.summary)
          }
        } catch (parseError) {
          setBlockingMessage('Execution summary stream parse error.')
        }
      })

      source.addEventListener('execution_error', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data)
          const errorData = payload?.error || {}
          const message = typeof errorData?.message === 'string' ? errorData.message : 'Execution failed.'
          setBlockingMessage(message)

          if (
            errorData?.code === 'DSA_REQUIRED' &&
            errorData?.action?.type === 'OPEN_DSA_SETTINGS'
          ) {
            setBlockingAction(errorData.action as BlockingAction)
          } else if (
            errorData?.code === 'DEFAULT_PAGE_REQUIRED' &&
            errorData?.action?.type === 'OPEN_DEFAULT_PAGE_SETTINGS'
          ) {
            setBlockingAction(errorData.action as BlockingAction)
          } else if (errorData?.code === 'PAYMENT_METHOD_REQUIRED') {
            setBlockingAction({
              type: 'RESOLVE_PAYMENT_METHOD',
              tenantId: selectedTenantId || undefined,
              adAccountId: selectedAccount?.id,
            })
          } else {
            setBlockingAction(null)
          }
        } catch (parseError) {
          setBlockingMessage('Execution error stream parse error.')
        }
      })

      source.addEventListener('done', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data)
          if (payload?.type === 'done' && payload.summary) {
            onSummary(payload.summary)
          }
          source.close()
          resolve()
        } catch (parseError) {
          source.close()
          reject(parseError)
        }
      })

      source.onerror = () => {
        source.close()
        reject(new Error('Execution stream disconnected unexpectedly.'))
      }
    })
  }

  const handleSuggestionClick = (suggestion: string) => {
    setCommand(suggestion)
    textareaRef.current?.focus()
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <div className="flex items-center space-x-2 mb-2">
          <SparklesIcon className="w-5 h-5 text-facebook-600" />
          <h3 className="text-lg font-semibold text-gray-900">AI Command Center</h3>
        </div>
        {selectedAccount ? (
          <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <p>
              <span className="font-semibold">Current account:</span> {selectedAccount.name}
            </p>
            <p>
              <span className="font-semibold">Default page:</span> {accountContext?.defaultPageId || 'Not set'}
            </p>
            <p>
              <span className="font-semibold">DSA:</span> {accountContext?.dsaConfigured ? 'Configured' : 'Missing'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <HealthChip label="Billing OK" ok={accountContext?.health?.billingOk ?? false} />
              <HealthChip label="DSA OK" ok={accountContext?.health?.dsaOk ?? false} />
              <HealthChip label="Page Connected" ok={accountContext?.health?.pageConnected ?? false} />
            </div>
          </div>
        ) : null}
      </div>

      {(isProcessing || executionSteps.length > 0 || Boolean(executionSummary)) && (
        <ExecutionProgress
          isProcessing={isProcessing}
          steps={executionSteps}
          summary={executionSummary}
        />
      )}

      {!selectedBusinessId && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex">
            <ExclamationTriangleIcon className="w-5 h-5 text-yellow-400 mr-2 flex-shrink-0" />
            <p className="text-sm text-yellow-700">
              Select a Business Portfolio to start giving commands.
            </p>
          </div>
        </div>
      )}
      {selectedBusinessId && !selectedAccount && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex">
            <ExclamationTriangleIcon className="w-5 h-5 text-yellow-400 mr-2 flex-shrink-0" />
            <p className="text-sm text-yellow-700">Select an Ad Account for this Business Portfolio.</p>
          </div>
        </div>
      )}
      {selectedBusinessId && selectedAccount && requiresDefaultPage && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-amber-800">
              No default Page is set for this Ad Account. Lead or link objectives require a default Page.
            </p>
            <button
              type="button"
              className="text-xs px-2 py-1 border border-amber-300 rounded text-amber-800 hover:bg-amber-100"
              onClick={() => onNavigateToDefaultPage?.()}
            >
              Set default Page
            </button>
          </div>
        </div>
      )}
      {selectedBusinessId &&
      selectedAccount &&
      blockingAction?.type === 'RESOLVE_PAYMENT_METHOD' ? (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <p className="text-sm text-amber-800">
            {blockingMessage ||
              'A valid payment method is required for this ad account before creating ads.'}
          </p>
        </div>
      ) : null}
      {selectedBusinessId &&
      selectedAccount &&
      blockingAction?.type === 'OPEN_DSA_SETTINGS' ? (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-amber-800">
              {blockingMessage ||
                'DSA settings are required for EU-targeted campaigns on this ad account.'}
            </p>
            <button
              type="button"
              className="text-xs px-2 py-1 border border-amber-300 rounded text-amber-800 hover:bg-amber-100"
              onClick={() =>
                onNavigateToDsaSettings?.(
                  blockingAction.adAccountId || selectedAccount.id
                )
              }
            >
              Open DSA settings
            </button>
          </div>
        </div>
      ) : null}

      {showUploadZone && selectedAccount && (
        <div className="mb-4 p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
          <div {...getRootProps()} className={`cursor-pointer p-4 text-center rounded transition-colors ${
            isDragActive ? 'border-blue-400 bg-blue-50' : 'hover:bg-gray-100'
          }`}>
            <input {...getInputProps()} />
            <PaperClipIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">
              {isDragActive 
                ? 'Drop files here...' 
                : 'Drag & drop materials or click to upload'
              }
            </p>
            <p className="text-xs text-gray-500 mt-1">
              JPG, PNG, GIF, MP4, MOV (max 5 files)
            </p>
          </div>

          {/* Uploaded Files List */}
          {uploadedFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Uploaded Files:</h4>
              {uploadedFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between p-2 bg-white border rounded">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium">{file.originalName}</span>
                    <span className="text-xs text-gray-500">({file.category.toUpperCase()})</span>
                  </div>
                  <button
                    onClick={() => removeFile(file.id)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mb-4">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={selectedBusinessId && selectedAccount
              ? uploadedFiles.length > 0
                ? `e.g., Create campaigns using ${uploadedFiles.map(f => f.originalName).join(', ')} - specify which files to use for each adset`
                : "e.g., Create a traffic campaign for Romanian users aged 25-45 interested in fitness with $50 daily budget"
              : !selectedBusinessId
                ? "Select a Business Portfolio to start..."
                : "Select an Ad Account to start..."
            }
            disabled={!selectedBusinessId || !selectedAccount || isProcessing}
            className="w-full p-3 pr-20 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-facebook-500 focus:border-facebook-500 disabled:bg-gray-50 disabled:text-gray-500"
            rows={4}
          />
          <div className="absolute bottom-2 right-2 flex items-center space-x-1">
            <button
              type="button"
              onClick={() => setShowUploadZone(!showUploadZone)}
              disabled={!selectedBusinessId || !selectedAccount}
              className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Upload materials"
            >
              <PaperClipIcon className="w-4 h-4" />
            </button>
            <button
              type="submit"
              disabled={!command.trim() || !selectedBusinessId || !selectedAccount || isProcessing}
              className="p-2 bg-facebook-600 text-white rounded-md hover:bg-facebook-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <PaperAirplaneIcon className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </form>

      <div className="flex-1 overflow-auto">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Quick Commands</h4>
        <div className="space-y-2">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              disabled={!selectedBusinessId || !selectedAccount || isProcessing}
              className="w-full text-left p-3 text-sm bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      {isProcessing && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-facebook-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-blue-700">
              AI is processing your command...
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function HealthChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
        ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {label}: {ok ? 'Yes' : 'Needs attention'}
    </span>
  );
}

function ExecutionProgress({
  isProcessing,
  steps,
  summary,
}: {
  isProcessing: boolean;
  steps: ExecutionStep[];
  summary: ExecutionSummary | null;
}) {
  const completed = summary?.stepsCompleted ?? steps.filter((step) => step.status === 'success').length;
  const total = summary?.totalSteps ?? Math.max(steps.length, 1);
  const percentage = Math.max(0, Math.min(100, Math.round((completed / total) * 100)));

  return (
    <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3">
      <div className="mb-1 flex items-center justify-between text-xs text-blue-800">
        <span>{isProcessing ? 'Execution in progress' : 'Execution result'}</span>
        <span>
          {completed}/{total}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100">
        <div
          className="h-full rounded-full bg-blue-600 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
