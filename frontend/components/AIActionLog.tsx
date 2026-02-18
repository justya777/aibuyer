'use client'

import { AIAction } from '../../shared/types'
import { 
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClipboardDocumentListIcon
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

interface AIActionLogProps {
  actions: AIAction[]
}

export default function AIActionLog({ actions }: AIActionLogProps) {
  const getActionTypeLabel = (type: AIAction['type']) => {
    const labels = {
      campaign_create: 'Campaign Created',
      campaign_update: 'Campaign Updated',
      campaign_pause: 'Campaign Paused',
      campaign_delete: 'Campaign Deleted',
      budget_adjust: 'Budget Adjusted',
      targeting_update: 'Targeting Updated',
      adset_create: 'Ad Set Created',
      ad_create: 'Ad Created'
    }
    return labels[type] || type
  }

  const formatExecutionTime = (time?: number) => {
    if (!time) return ''
    if (time < 1000) return `${time}ms`
    return `${(time / 1000).toFixed(1)}s`
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <div className="flex items-center space-x-2 mb-2">
          <ClipboardDocumentListIcon className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">AI Action Log</h3>
        </div>
        <p className="text-sm text-gray-600">
          Track AI actions and decisions in real-time
        </p>
      </div>

      <div className="flex-1 overflow-auto space-y-4">
        {actions.length === 0 ? (
          <div className="text-center py-8">
            <ClipboardDocumentListIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No actions yet</p>
            <p className="text-sm text-gray-400 mt-1">
              AI actions will appear here when commands are executed
            </p>
          </div>
        ) : (
          actions.map((action) => (
            <div
              key={action.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div className={clsx(
                    'w-2 h-2 rounded-full',
                    action.result === 'success' && 'bg-green-500',
                    action.result === 'error' && 'bg-red-500',
                    action.result === 'pending' && 'bg-yellow-500'
                  )}></div>
                  <span className="text-sm font-medium text-gray-900">
                    {getActionTypeLabel(action.type)}
                  </span>
                </div>
                <div className="flex items-center space-x-1 text-xs text-gray-500">
                  <ClockIcon className="w-3 h-3" />
                  <span>
                    {new Date(action.timestamp).toLocaleTimeString('en-US')}
                  </span>
                </div>
              </div>

              {/* Action Description */}
              <div className="mb-3">
                <p className="text-sm text-gray-700 mb-2">{action.action}</p>
                <div className="bg-gray-50 rounded-md p-3">
                  <p className="text-xs text-gray-600 font-medium mb-1">AI Reasoning:</p>
                  <p className="text-xs text-gray-700">{action.reasoning}</p>
                </div>
              </div>

              {/* Status and Details */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-1">
                    {action.success && (
                      <CheckCircleIcon className="w-4 h-4 text-green-500" />
                    )}
                    {action.success === false && (
                      <XCircleIcon className="w-4 h-4 text-red-500" />
                    )}
                    <span className={clsx(
                      'text-xs font-medium',
                      action.success && 'text-green-700',
                      action.success === false && 'text-red-700'
                    )}>
                      {action.success ? 'SUCCESS' : 'ERROR'}
                    </span>
                  </div>
                  
                  {action.executionTime && (
                    <span className="text-xs text-gray-500">
                      {formatExecutionTime(action.executionTime)}
                    </span>
                  )}
                </div>

                {action.campaignId && (
                  <span className="text-xs text-gray-500 font-mono">
                    {action.campaignId}
                  </span>
                )}
              </div>

              {/* Error Message */}
              {action.result === 'error' && action.errorMessage && (
                <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-xs text-red-700">
                    <strong>Error:</strong> {action.errorMessage}
                  </p>
                </div>
              )}

              {/* Parameters (collapsible) */}
              {action.parameters && Object.keys(action.parameters).length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                    View Parameters
                  </summary>
                  <div className="mt-2 p-2 bg-gray-50 rounded-md">
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                      {JSON.stringify(action.parameters, null, 2)}
                    </pre>
                  </div>
                </details>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer Stats */}
      {actions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-500">Total Actions</p>
              <p className="text-sm font-semibold">{actions.length}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Success Rate</p>
              <p className="text-sm font-semibold">
                {((actions.filter(a => a.result === 'success').length / actions.length) * 100).toFixed(0)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Last Action</p>
              <p className="text-sm font-semibold">
                {actions.length > 0 ? new Date(actions[0].timestamp).toLocaleTimeString('en-US') : '-'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
