'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CreatedEntityIds,
  ExecutionStep,
  ExecutionSummary,
  FacebookAccount,
} from '@/lib/shared-types'
import { buildStepFromSsePayload, parseTimelineDonePayload } from '@/lib/ai-execution/sse-events'
import AIExecutionTimeline from './AIExecutionTimeline'
import MaterialsTab from './ad-account/MaterialsTab'
import {
  ArrowPathIcon,
  ClockIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  DocumentTextIcon,
  PaperAirplaneIcon,
  PhotoIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

function tabStorageKey(tenantId?: string | null, actId?: string | null): string {
  if (tenantId && actId) return `ai-panel-tab:${tenantId}:${actId}`
  return 'ai-panel-tab'
}

type TabId = 'command' | 'timeline' | 'materials' | 'history' | 'settings'


// I'VE DELETED THE LABELS BECAUSE THEY ARE NOT NEEDED, CAUSING UI TO GO OFFSCREEN
const TABS: { id: TabId; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'command', icon: CommandLineIcon },
  { id: 'timeline', icon: ClockIcon },
  { id: 'materials', icon: PhotoIcon },
  { id: 'history', icon: DocumentTextIcon },
  { id: 'settings', icon: Cog6ToothIcon },
]

interface AICommandCenterProps {
  selectedAccount: FacebookAccount | null
  selectedTenantId?: string | null
  selectedBusinessId?: string | null
  requiresDefaultPage?: boolean
  accountContext?: {
    defaultPageId: string | null
    defaultPixelId?: string | null
    dsaConfigured: boolean
    health?: {
      billingOk: boolean
      dsaOk: boolean
      pageConnected: boolean
      pixelConnected?: boolean
    }
  }
  executionSteps?: ExecutionStep[]
  executionSummary?: ExecutionSummary | null
  onNavigateToDefaultPage?: () => void
  onNavigateToDsaSettings?: (adAccountId: string) => void
  onExecutionReset: () => void
  onStepUpdate: (step: ExecutionStep) => void
  onSummary: (summary: ExecutionSummary) => void
  onExecutionComplete?: (result: { success: boolean; createdIds?: CreatedEntityIds }) => void
  onCampaignCreated?: (campaignId: string) => void
}

type BlockingAction =
  | { type: 'OPEN_DSA_SETTINGS'; tenantId?: string; adAccountId?: string }
  | { type: 'OPEN_DEFAULT_PAGE_SETTINGS'; tenantId?: string; adAccountId?: string }
  | { type: 'RESOLVE_PAYMENT_METHOD'; tenantId?: string; adAccountId?: string };

interface HistoryRun {
  id: string
  commandText: string
  status: string
  startedAt: string
  finishedAt?: string | null
  createdIdsJson?: Record<string, unknown> | null
  summaryJson?: Record<string, unknown> | null
  retries?: number
}

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
  onExecutionComplete,
  onCampaignCreated,
}: AICommandCenterProps) {
  const COMMAND_TIMEOUT_MS = 120000
  const storageKey = tabStorageKey(selectedTenantId, selectedAccount?.id)
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(storageKey)
      if (stored && TABS.some((t) => t.id === stored)) return stored as TabId
    }
    return 'command'
  })
  const [command, setCommand] = useState('')
  const [lastCommand, setLastCommand] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [blockingMessage, setBlockingMessage] = useState<string | null>(null)
  const [blockingAction, setBlockingAction] = useState<BlockingAction | null>(null)
  const [showBillingInstructions, setShowBillingInstructions] = useState(false)
  const [toast, setToast] = useState<{ message: string; campaignId?: string } | null>(null)
  const [historyRuns, setHistoryRuns] = useState<HistoryRun[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [suggestions] = useState([
    'Create a leads campaign for Romanian men on romanian language aged 20-45 interested in investments with $15 daily budget with the link https://domain.com/test?utm_campaign={{campaign.name}}&utm_source={{site_source_name}}',
  ])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const switchTab = useCallback((tab: TabId) => {
    setActiveTab(tab)
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, tab)
    }
  }, [storageKey])

  useEffect(() => {
    if (isProcessing && activeTab !== 'timeline') {
      switchTab('timeline')
    }
  }, [isProcessing, activeTab, switchTab])

  const dismissToast = useCallback(() => setToast(null), [])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(dismissToast, 15000)
      return () => clearTimeout(timer)
    }
  }, [toast, dismissToast])

  const fetchHistory = useCallback(async () => {
    if (!selectedAccount) return
    setHistoryLoading(true)
    try {
      const params = new URLSearchParams({ adAccountId: selectedAccount.id })
      if (selectedBusinessId) params.set('businessId', selectedBusinessId)
      const res = await fetch(`/api/ai-command/runs?${params}`, {
        headers: selectedTenantId ? { 'x-tenant-id': selectedTenantId } : {},
      })
      if (res.ok) {
        const data = await res.json()
        setHistoryRuns(data.runs || [])
      }
    } catch {
      // Silently fail
    } finally {
      setHistoryLoading(false)
    }
  }, [selectedAccount, selectedBusinessId, selectedTenantId])

  useEffect(() => {
    if (activeTab === 'history') fetchHistory()
  }, [activeTab, fetchHistory])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await executeCommand(command.trim())
  }

  const executeCommand = async (nextCommand: string, resumeFromRunId?: string) => {
    if (!nextCommand || !selectedAccount || !selectedBusinessId) return

    onExecutionReset()
    setBlockingMessage(null)
    setBlockingAction(null)
    setIsProcessing(true)
    setLastCommand(nextCommand)

    try {
      const response = await fetch('/api/ai-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(selectedTenantId ? { 'x-tenant-id': selectedTenantId } : {}),
        },
        body: JSON.stringify({
          command: nextCommand,
          accountId: selectedAccount.id,
          businessId: selectedBusinessId,
          ...(resumeFromRunId ? { resumeFromRunId } : {}),
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
        } else if (actionableCode === 'PIXEL_REQUIRED') {
          setBlockingAction({
            type: 'OPEN_DEFAULT_PAGE_SETTINGS',
            tenantId: selectedTenantId || undefined,
            adAccountId: selectedAccount.id,
          })
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
      if (nextCommand === command.trim()) {
        setCommand('')
      }
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
      onExecutionComplete?.({ success: false })
    } finally {
      setIsProcessing(false)
    }
  }

  const consumeExecutionStream = async (executionId: string) => {
    await new Promise<void>((resolve, reject) => {
      const source = new EventSource(`/api/ai-command/stream?executionId=${encodeURIComponent(executionId)}`)
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        source.close()
        resolve()
      }
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        source.close()
        reject(error)
      }
      const handleStepPayload = (raw: string) => {
        const payload = JSON.parse(raw)
        const step = buildStepFromSsePayload(payload)
        if (step) onStepUpdate(step)
      }

      for (const eventType of ['step.start', 'step.update', 'step.success', 'step.error']) {
        source.addEventListener(eventType, (event) => {
          try {
            handleStepPayload((event as MessageEvent).data)
          } catch {
            // Parse error, non-critical
          }
        })
      }

      source.addEventListener('execution_summary', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data)
          if (payload?.type === 'execution_summary' && payload.summary) {
            onSummary(payload.summary)
          }
        } catch {
          // Parse error
        }
      })

      source.addEventListener('timeline.done', (event) => {
        try {
          const parsed = parseTimelineDonePayload(JSON.parse((event as MessageEvent).data))
          if (parsed.summary) onSummary(parsed.summary)
          const success = parsed.success
          const createdIds = parsed.createdIds
          onExecutionComplete?.({ success, createdIds })
          if (success && createdIds?.campaignId) {
            setToast({ message: 'Campaign created successfully!', campaignId: createdIds.campaignId })
            onCampaignCreated?.(createdIds.campaignId)
          }
          finish()
        } catch (error) {
          fail(error instanceof Error ? error : new Error('Timeline done parse error'))
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
          } else if (errorData?.code === 'PIXEL_REQUIRED' || errorData?.category === 'pixel_required') {
            setBlockingAction({
              type: 'OPEN_DEFAULT_PAGE_SETTINGS',
              tenantId: selectedTenantId || undefined,
              adAccountId: selectedAccount?.id,
            })
          } else if (errorData?.code === 'PAYMENT_METHOD_REQUIRED') {
            setBlockingAction({
              type: 'RESOLVE_PAYMENT_METHOD',
              tenantId: selectedTenantId || undefined,
              adAccountId: selectedAccount?.id,
            })
          } else {
            setBlockingAction(null)
          }
        } catch {
          setBlockingMessage('Execution error stream parse error.')
        }
      })

      source.onerror = () => {
        fail(new Error('Execution stream disconnected unexpectedly.'))
      }
    })
  }

  const handleSuggestionClick = (suggestion: string) => {
    setCommand(suggestion)
    textareaRef.current?.focus()
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="mb-3 flex items-center space-x-2">
        <SparklesIcon className="w-5 h-5 text-facebook-600" />
        <h3 className="text-lg font-semibold text-gray-900">AI Command Center</h3>
      </div>

      {/* Tab bar */}
      <div className="mb-3 flex border-b border-gray-200">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchTab(tab.id)}
              className={`flex items-center gap-1 px-2 xl:px-3 py-2 text-[11px] xl:text-xs font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-facebook-600 text-facebook-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
          
            </button>
          )
        })}
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
            <span className="text-sm text-emerald-800">{toast.message}</span>
            {toast.campaignId && (
              <button
                type="button"
                className="ml-2 text-xs font-medium text-emerald-700 underline hover:text-emerald-900"
                onClick={() => {
                  onCampaignCreated?.(toast.campaignId!)
                  dismissToast()
                }}
              >
                View campaign
              </button>
            )}
          </div>
          <button type="button" onClick={dismissToast} className="text-emerald-500 hover:text-emerald-700">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'command' && (
          <CommandTab
            command={command}
            setCommand={setCommand}
            lastCommand={lastCommand}
            isProcessing={isProcessing}
            selectedAccount={selectedAccount}
            selectedBusinessId={selectedBusinessId}
            blockingMessage={blockingMessage}
            blockingAction={blockingAction}
            suggestions={suggestions}
            textareaRef={textareaRef}
            executionSteps={executionSteps}
            executionSummary={executionSummary}
            onSubmit={handleSubmit}
            onExecuteCommand={executeCommand}
            onSuggestionClick={handleSuggestionClick}
            setShowBillingInstructions={setShowBillingInstructions}
            showBillingInstructions={showBillingInstructions}
            accountContext={accountContext}
          />
        )}

        {activeTab === 'timeline' && (
          <AIExecutionTimeline
            steps={executionSteps}
            summary={executionSummary}
            showTechnicalDetails
          />
        )}

        {activeTab === 'materials' && selectedAccount && selectedTenantId && (
          <MaterialsTabInline
            tenantId={selectedTenantId}
            adAccountId={selectedAccount.id}
            adAccountName={selectedAccount.name || selectedAccount.id}
          />
        )}
        {activeTab === 'materials' && (!selectedAccount || !selectedTenantId) && (
          <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg">
            <PhotoIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Materials</p>
            <p className="text-sm text-gray-400 mt-1">
              Select an ad account to manage creative materials.
            </p>
          </div>
        )}

        {activeTab === 'history' && (
          <HistoryTab
            runs={historyRuns}
            loading={historyLoading}
            onRefresh={fetchHistory}
            onRunAgain={(cmd) => {
              setCommand(cmd)
              switchTab('command')
            }}
            onRetryFromStep={(cmd, runId) => {
              switchTab('command')
              void executeCommand(cmd, runId)
            }}
            selectedTenantId={selectedTenantId}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            selectedAccount={selectedAccount}
            accountContext={accountContext}
            requiresDefaultPage={requiresDefaultPage}
            showBillingInstructions={showBillingInstructions}
            setShowBillingInstructions={setShowBillingInstructions}
            onNavigateToDefaultPage={onNavigateToDefaultPage}
            onNavigateToDsaSettings={onNavigateToDsaSettings}
            selectedTenantId={selectedTenantId}
            selectedBusinessId={selectedBusinessId}
          />
        )}
      </div>

      {/* Processing indicator - always visible */}
      {isProcessing && (
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-facebook-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-blue-700">AI is processing your command...</p>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Command Tab                                                        */
/* ------------------------------------------------------------------ */

function CommandTab({
  command,
  setCommand,
  lastCommand,
  isProcessing,
  selectedAccount,
  selectedBusinessId,
  blockingMessage,
  blockingAction,
  suggestions,
  textareaRef,
  executionSteps,
  executionSummary,
  onSubmit,
  onExecuteCommand,
  onSuggestionClick,
  setShowBillingInstructions,
  showBillingInstructions,
  accountContext,
}: {
  command: string
  setCommand: (v: string) => void
  lastCommand: string | null
  isProcessing: boolean
  selectedAccount: FacebookAccount | null
  selectedBusinessId?: string | null
  blockingMessage: string | null
  blockingAction: BlockingAction | null
  suggestions: string[]
  textareaRef: React.Ref<HTMLTextAreaElement>
  executionSteps: ExecutionStep[]
  executionSummary: ExecutionSummary | null
  onSubmit: (e: React.FormEvent) => void
  onExecuteCommand: (cmd: string) => void
  onSuggestionClick: (s: string) => void
  setShowBillingInstructions: (v: boolean) => void
  showBillingInstructions: boolean
  accountContext?: AICommandCenterProps['accountContext']
}) {
  return (
    <div className="space-y-4">
      {/* Blocking errors */}
      {blockingMessage && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
          <div className="flex items-start gap-2">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p>{blockingMessage}</p>
              {blockingAction?.type === 'RESOLVE_PAYMENT_METHOD' && (
                <p className="mt-1 text-xs">
                  Go to Meta Ads Manager &rarr; Billing &amp; payments, add/confirm a payment method, then retry.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Execution progress bar */}
      {(isProcessing || executionSteps.length > 0 || Boolean(executionSummary)) && (
        <ExecutionProgress isProcessing={isProcessing} steps={executionSteps} summary={executionSummary} />
      )}

      {/* Command input */}
      <form onSubmit={onSubmit}>
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={
              selectedBusinessId && selectedAccount
                ? 'e.g., Create a traffic campaign for Romanian users aged 25-45 interested in fitness with $50 daily budget'
                : !selectedBusinessId
                  ? 'Select a Business Portfolio to start...'
                  : 'Select an Ad Account to start...'
            }
            disabled={!selectedBusinessId || !selectedAccount || isProcessing}
            className="w-full p-3 pr-20 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-facebook-500 focus:border-facebook-500 disabled:bg-gray-50 disabled:text-gray-500"
            rows={4}
          />
          <div className="absolute bottom-2 right-2 flex items-center space-x-1">
            <button
              type="submit"
              disabled={!command.trim() || !selectedBusinessId || !selectedAccount || isProcessing}
              className="p-2 bg-facebook-600 text-white rounded-md hover:bg-facebook-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <PaperAirplaneIcon className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Retry last */}
      {lastCommand && (
        <button
          type="button"
          disabled={isProcessing}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          onClick={() => onExecuteCommand(lastCommand)}
        >
          <ArrowPathIcon className="h-4 w-4" />
          Retry last command
        </button>
      )}

      {/* Quick Commands - always visible */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Quick Commands</h4>
        <div className="space-y-2">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => onSuggestionClick(suggestion)}
              disabled={!selectedBusinessId || !selectedAccount || isProcessing}
              className="w-full text-left p-3 text-sm bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* History Tab                                                        */
/* ------------------------------------------------------------------ */

function formatDuration(startedAt: string, finishedAt?: string | null): string {
  if (!finishedAt) return ''
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  if (Number.isNaN(ms) || ms < 0) return ''
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function buildCreatedIdsText(ids: Record<string, unknown>): string {
  return Object.entries(ids)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
}

type StatusFilter = 'all' | 'SUCCESS' | 'PARTIAL' | 'ERROR' | 'RUNNING' | 'PENDING'

function HistoryTab({
  runs,
  loading,
  onRefresh,
  onRunAgain,
  onRetryFromStep,
  selectedTenantId,
}: {
  runs: HistoryRun[]
  loading: boolean
  onRefresh: () => void
  onRunAgain: (command: string) => void
  onRetryFromStep?: (command: string, runId: string) => void
  selectedTenantId?: string | null
}) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [runEvents, setRunEvents] = useState<any[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const fetchRunEvents = async (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null)
      return
    }
    setExpandedRunId(runId)
    setEventsLoading(true)
    try {
      const res = await fetch(`/api/ai-command/runs/${runId}/events`, {
        headers: selectedTenantId ? { 'x-tenant-id': selectedTenantId } : {},
      })
      if (res.ok) {
        const data = await res.json()
        setRunEvents(data.events || [])
      }
    } catch {
      setRunEvents([])
    } finally {
      setEventsLoading(false)
    }
  }

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Clipboard not available
    }
  }

  const buildDebugBundle = (run: HistoryRun) => {
    return JSON.stringify({
      runId: run.id,
      prompt: run.commandText,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      retries: run.retries ?? 0,
      createdIds: run.createdIdsJson,
      summary: run.summaryJson,
      events: expandedRunId === run.id ? runEvents : [],
    }, null, 2)
  }

  const stepsFromEvents = (events: any[]): import('@/lib/shared-types').ExecutionStep[] => {
    const steps: import('@/lib/shared-types').ExecutionStep[] = []
    const stepMap = new Map<string, import('@/lib/shared-types').ExecutionStep>()
    for (const event of events) {
      if (!event.stepId) continue
      const existing = stepMap.get(event.stepId)
      if (existing) {
        if (event.status) existing.status = event.status
        if (event.summary) existing.summary = event.summary
        if (event.userTitle) existing.userTitle = event.userTitle
        if (event.userMessage) existing.userMessage = event.userMessage
        if (event.rationale) existing.rationale = event.rationale
        if (event.status === 'success' || event.status === 'error') existing.finishedAt = event.ts
        if (event.debugJson?.step?.fixesApplied) existing.fixesApplied = event.debugJson.step.fixesApplied
        if (event.debugJson?.step?.attempts) existing.attempts = event.debugJson.step.attempts
        if (event.createdIdsJson) existing.createdIds = event.createdIdsJson
      } else {
        const step: import('@/lib/shared-types').ExecutionStep = {
          id: event.stepId,
          order: steps.length,
          title: event.label || event.stepId,
          type: 'validation',
          status: event.status || 'running',
          summary: event.summary || '',
          userTitle: event.userTitle,
          userMessage: event.userMessage,
          rationale: event.rationale,
          startedAt: event.ts,
          finishedAt: event.status === 'success' || event.status === 'error' ? event.ts : undefined,
          fixesApplied: event.debugJson?.step?.fixesApplied,
          attempts: event.debugJson?.step?.attempts,
          createdIds: event.createdIdsJson,
        }
        stepMap.set(event.stepId, step)
        steps.push(step)
      }
    }
    return steps
  }

  const filteredRuns = statusFilter === 'all' ? runs : runs.filter((r) => r.status === statusFilter)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700">Recent Runs</h4>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600"
          >
            <option value="all">All</option>
            <option value="SUCCESS">Success</option>
            <option value="PARTIAL">Partial</option>
            <option value="ERROR">Error</option>
            <option value="RUNNING">Running</option>
          </select>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>
      {filteredRuns.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg">
          <DocumentTextIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No runs yet</p>
          <p className="text-sm text-gray-400 mt-1">Execute a command to see history here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRuns.map((run) => {
            const duration = formatDuration(run.startedAt, run.finishedAt)
            const hasCreatedIds = run.createdIdsJson && Object.values(run.createdIdsJson).some(Boolean)
            return (
            <div key={run.id} className="rounded-md border border-gray-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => fetchRunEvents(run.id)}
                className="w-full text-left p-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-gray-900 line-clamp-2">{run.commandText}</p>
                  <StatusBadge status={run.status} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  <span>{safeFormatDate(run.startedAt)}</span>
                  {duration && <span>{duration}</span>}
                  {typeof (run.summaryJson as any)?.stepsCompleted === 'number' && (
                    <span>
                      {(run.summaryJson as any).stepsCompleted}/{(run.summaryJson as any).totalSteps ?? '?'} steps
                    </span>
                  )}
                  {(run.retries ?? 0) > 0 && (
                    <span className="text-amber-600">{run.retries} {run.retries === 1 ? 'retry' : 'retries'}</span>
                  )}
                  {hasCreatedIds && (
                    <span className="text-green-600">
                      {Object.keys(run.createdIdsJson!).filter((k) => run.createdIdsJson![k]).length} created
                    </span>
                  )}
                </div>
                {hasCreatedIds && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {Object.entries(run.createdIdsJson!).filter(([, v]) => v).map(([key, value]) => (
                      <span
                        key={key}
                        className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-600"
                        title={`${key}: ${value}`}
                      >
                        {key.replace(/Id$/, '')}: {String(value)}
                      </span>
                    ))}
                  </div>
                )}
              </button>

              <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); copyToClipboard(run.commandText, `prompt-${run.id}`) }}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                >
                  {copiedId === `prompt-${run.id}` ? (
                    <><CheckCircleIcon className="h-3 w-3 text-green-500" /> Copied</>
                  ) : (
                    'Copy prompt'
                  )}
                </button>
                {hasCreatedIds && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); copyToClipboard(buildCreatedIdsText(run.createdIdsJson!), `ids-${run.id}`) }}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  >
                    {copiedId === `ids-${run.id}` ? (
                      <><CheckCircleIcon className="h-3 w-3 text-green-500" /> Copied</>
                    ) : (
                      'Copy IDs'
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRunAgain(run.commandText) }}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                >
                  <ArrowPathIcon className="h-3 w-3" /> Run again
                </button>
                {run.status === 'PARTIAL' && onRetryFromStep && run.createdIdsJson && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRetryFromStep(run.commandText, run.id) }}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-600 hover:bg-amber-50 hover:text-amber-800"
                  >
                    <ArrowPathIcon className="h-3 w-3" /> Retry from failed step
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); copyToClipboard(buildDebugBundle(run), `debug-${run.id}`) }}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                >
                  {copiedId === `debug-${run.id}` ? (
                    <><CheckCircleIcon className="h-3 w-3 text-green-500" /> Copied</>
                  ) : (
                    'Copy debug'
                  )}
                </button>
              </div>

              {expandedRunId === run.id && (
                <div className="border-t border-gray-200 p-3 bg-gray-50">
                  {eventsLoading ? (
                    <p className="text-xs text-gray-500">Loading timeline...</p>
                  ) : runEvents.length > 0 ? (
                    <AIExecutionTimeline
                      steps={stepsFromEvents(runEvents)}
                      summary={run.summaryJson as import('@/lib/shared-types').ExecutionSummary | null ?? null}
                    />
                  ) : (
                    <p className="text-xs text-gray-500">No events recorded for this run.</p>
                  )}
                </div>
              )}
            </div>
          )})}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Settings Tab                                                       */
/* ------------------------------------------------------------------ */

function SettingsTab({
  selectedAccount,
  accountContext,
  requiresDefaultPage,
  showBillingInstructions,
  setShowBillingInstructions,
  onNavigateToDefaultPage,
  onNavigateToDsaSettings,
  selectedTenantId,
  selectedBusinessId,
}: {
  selectedAccount: FacebookAccount | null
  accountContext?: AICommandCenterProps['accountContext']
  requiresDefaultPage: boolean
  showBillingInstructions: boolean
  setShowBillingInstructions: (v: boolean) => void
  onNavigateToDefaultPage?: () => void
  onNavigateToDsaSettings?: (adAccountId: string) => void
  selectedTenantId?: string | null
  selectedBusinessId?: string | null
}) {
  const [pixels, setPixels] = useState<Array<{ pixelId: string; name: string | null; permissionOk: boolean }>>([])
  const [defaultPixelId, setDefaultPixelId] = useState<string | null>(accountContext?.defaultPixelId ?? null)
  const [pixelSaving, setPixelSaving] = useState(false)

  useEffect(() => {
    setDefaultPixelId(accountContext?.defaultPixelId ?? null)
  }, [accountContext?.defaultPixelId])

  useEffect(() => {
    if (!selectedAccount || !selectedTenantId || !selectedBusinessId) return
    const actId = encodeURIComponent(selectedAccount.id)
    const bizId = encodeURIComponent(selectedBusinessId)
    fetch(`/api/tenants/${selectedTenantId}/businesses/${bizId}/ad-accounts/${actId}/pixels`, {
      headers: { 'x-tenant-id': selectedTenantId },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.pixels) setPixels(data.pixels) })
      .catch(() => {})
  }, [selectedAccount, selectedTenantId, selectedBusinessId])

  const handlePixelChange = async (pixelId: string | null) => {
    if (!selectedAccount || !selectedTenantId || !selectedBusinessId) return
    setPixelSaving(true)
    try {
      const actId = encodeURIComponent(selectedAccount.id)
      const bizId = encodeURIComponent(selectedBusinessId)
      const res = await fetch(
        `/api/tenants/${selectedTenantId}/businesses/${bizId}/ad-accounts/${actId}/default-pixel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': selectedTenantId },
          body: JSON.stringify({ pixelId }),
        }
      )
      if (res.ok) setDefaultPixelId(pixelId)
    } catch {
      // Ignore for now
    } finally {
      setPixelSaving(false)
    }
  }

  if (!selectedAccount) {
    return (
      <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg">
        <Cog6ToothIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Select an account to view settings</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <p>
          <span className="font-semibold">Account:</span> {selectedAccount.name}
        </p>
        <p>
          <span className="font-semibold">Default page:</span>{' '}
          {accountContext?.defaultPageId || 'Not set'}
        </p>
        <p>
          <span className="font-semibold">DSA:</span>{' '}
          {accountContext?.dsaConfigured ? 'Configured' : 'Missing'}
        </p>
        <p>
          <span className="font-semibold">Pixel:</span>{' '}
          {defaultPixelId
            ? (pixels.find((p) => p.pixelId === defaultPixelId)?.name || defaultPixelId)
            : 'Not set'}
        </p>
      </div>

      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Health Status</h4>
        <div className="flex flex-wrap gap-2">
          <HealthChip label="Billing OK" ok={accountContext?.health?.billingOk ?? false} />
          <HealthChip label="DSA OK" ok={accountContext?.health?.dsaOk ?? false} />
          <HealthChip label="Page Connected" ok={accountContext?.health?.pageConnected ?? false} />
          <HealthChip label="Pixel" ok={accountContext?.health?.pixelConnected ?? Boolean(defaultPixelId)} />
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Quick Actions</h4>
        <div className="flex flex-wrap gap-2">
          {!(accountContext?.health?.dsaOk ?? false) && (
            <button
              type="button"
              className="text-xs px-2 py-1 border rounded border-amber-300 text-amber-800 hover:bg-amber-100"
              onClick={() => onNavigateToDsaSettings?.(selectedAccount.id)}
            >
              Fix DSA
            </button>
          )}
          {(!(accountContext?.health?.pageConnected ?? false) || requiresDefaultPage) && (
            <button
              type="button"
              className="text-xs px-2 py-1 border rounded border-amber-300 text-amber-800 hover:bg-amber-100"
              onClick={() => onNavigateToDefaultPage?.()}
            >
              Set default page
            </button>
          )}
          {!(accountContext?.health?.billingOk ?? false) && (
            <button
              type="button"
              className="text-xs px-2 py-1 border rounded border-amber-300 text-amber-800 hover:bg-amber-100"
              onClick={() => setShowBillingInstructions(!showBillingInstructions)}
            >
              Billing issue
            </button>
          )}
        </div>
        {showBillingInstructions && !(accountContext?.health?.billingOk ?? false) && (
          <p className="mt-2 text-xs text-amber-900">
            Go to Meta Ads Manager &rarr; Billing &amp; payments for this ad account, add/confirm a
            payment method, then retry.
          </p>
        )}
      </div>

      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Default Pixel</h4>
        {pixels.length > 0 ? (
          <>
            <select
              value={defaultPixelId || ''}
              onChange={(e) => handlePixelChange(e.target.value || null)}
              disabled={pixelSaving}
              className={`w-full rounded border bg-white px-2 py-1.5 text-xs text-gray-700 disabled:opacity-50 ${
                defaultPixelId ? 'border-gray-300' : 'border-amber-300'
              }`}
            >
              <option value="">None (select to enable conversions)</option>
              {pixels.map((p) => (
                <option key={p.pixelId} value={p.pixelId}>
                  {p.name || p.pixelId}{!p.permissionOk ? ' (no access)' : ''}
                </option>
              ))}
            </select>
            {!defaultPixelId && (
              <p className="mt-1 text-[10px] text-amber-600 font-medium">
                Conversion/leads ad creation will be blocked until a pixel is selected.
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-500">No pixels found. Pixels will load when available.</p>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Shared sub-components                                              */
/* ------------------------------------------------------------------ */

function HealthChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
        ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {label}: {ok ? 'Yes' : 'Needs attention'}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const upper = status.toUpperCase()
  if (upper === 'SUCCESS') {
    return (
      <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
        Success
      </span>
    )
  }
  if (upper === 'PARTIAL') {
    return (
      <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
        Partial
      </span>
    )
  }
  if (upper === 'ERROR') {
    return (
      <span className="inline-flex items-center rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700">
        Error
      </span>
    )
  }
  if (upper === 'RUNNING') {
    return (
      <span className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
        Running
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-600">
      {status}
    </span>
  )
}

function ExecutionProgress({
  isProcessing,
  steps,
  summary,
}: {
  isProcessing: boolean
  steps: ExecutionStep[]
  summary: ExecutionSummary | null
}) {
  const completed = summary?.stepsCompleted ?? steps.filter((step) => step.status === 'success').length
  const total = summary?.totalSteps ?? Math.max(steps.length, 1)
  const percentage = Math.max(0, Math.min(100, Math.round((completed / total) * 100)))

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
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
  )
}

function MaterialsTabInline({
  tenantId,
  adAccountId,
  adAccountName,
}: {
  tenantId: string
  adAccountId: string
  adAccountName: string
}) {
  return (
    <MaterialsTab
      tenantId={tenantId}
      adAccountId={adAccountId}
      adAccountName={adAccountName}
      ads={[]}
    />
  )
}

function safeFormatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleString()
  } catch {
    return dateStr
  }
}
