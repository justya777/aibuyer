'use client'

import React, { useState, useEffect } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

interface DebugRequest {
  endpoint: string
  accountId?: string
  campaignId?: string
  response?: any
  error?: string
  fields_requested?: string[]
  count?: number
}

interface DebugData {
  timestamp: string
  requests: DebugRequest[]
}

interface FacebookDebugPanelProps {
  accountId?: string
  campaignId?: string
}

export default function FacebookDebugPanel({ accountId, campaignId }: FacebookDebugPanelProps) {
  const [debugData, setDebugData] = useState<DebugData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const fetchDebugData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams()
      if (accountId) params.append('accountId', accountId)
      if (campaignId) params.append('campaignId', campaignId)
      
      const response = await fetch(`/api/facebook/debug?${params.toString()}`)
      const data = await response.json()
      
      if (data.success) {
        setDebugData(data.debug)
      } else {
        setError(data.error || 'Failed to fetch debug data')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const toggleExpanded = (key: string) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
    }
    setExpandedItems(newExpanded)
  }

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return 'null'
    if (typeof value === 'string') return value
    if (typeof value === 'number') return value.toString()
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    return JSON.stringify(value, null, 2)
  }

  const renderJsonObject = (obj: any, parentKey: string = '', level: number = 0): React.ReactNode => {
    if (!obj || typeof obj !== 'object') {
      return (
        <div className="text-sm text-gray-600 font-mono">
          {String(formatValue(obj))}
        </div>
      )
    }

    return (
      <div className="space-y-1" style={{ marginLeft: `${level * 16}px` }}>
        {Object.entries(obj).map(([key, value]) => {
          const fullKey = `${parentKey}.${key}`
          const isExpandable = value && typeof value === 'object'
          const isExpanded = expandedItems.has(fullKey)

          return (
            <div key={key}>
              <div className="flex items-center space-x-2">
                {isExpandable ? (
                  <button
                    onClick={() => toggleExpanded(fullKey)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {isExpanded ? (
                      <ChevronDownIcon className="w-4 h-4" />
                    ) : (
                      <ChevronRightIcon className="w-4 h-4" />
                    )}
                  </button>
                ) : (
                  <div className="w-4" />
                )}
                <span className="text-sm font-medium text-purple-600">{key}:</span>
                {!isExpandable && (
                  <span className="text-sm text-gray-700 font-mono">
                    {String(formatValue(value))}
                  </span>
                )}
              </div>
              {isExpandable && isExpanded ? (
                <div className="mt-1">
                  {renderJsonObject(value, fullKey, level + 1) as React.ReactNode}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            🔍 Facebook API Debug Panel
          </h3>
          <button
            onClick={fetchDebugData}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'Fetch Debug Data'}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">Error: {error}</p>
          </div>
        )}

        {debugData && (
          <div className="space-y-6">
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <span>📅 Generated: {new Date(debugData.timestamp).toLocaleString()}</span>
              <span>📊 Total Requests: {debugData.requests.length}</span>
            </div>

            {debugData.requests.map((request, index) => (
              <div key={index} className="border border-gray-200 rounded-lg">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-semibold text-gray-900">
                        {request.endpoint}
                      </span>
                      {request.error ? (
                        <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">
                          Error
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                          Success
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 space-x-3">
                      {request.accountId && (
                        <span>Account: {request.accountId}</span>
                      )}
                      {request.campaignId && (
                        <span>Campaign: {request.campaignId}</span>
                      )}
                      {request.count !== undefined && (
                        <span>Count: {request.count}</span>
                      )}
                    </div>
                  </div>
                  
                  {request.fields_requested && (
                    <div className="mt-2">
                      <span className="text-xs text-gray-500">Fields requested: </span>
                      <span className="text-xs font-mono text-gray-600">
                        {request.fields_requested.join(', ')}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-4">
                  {request.error ? (
                    <div className="bg-red-50 p-3 rounded-lg">
                      <p className="text-red-700 text-sm font-mono">{request.error}</p>
                    </div>
                  ) : (
                    <div className="bg-gray-50 p-4 rounded-lg overflow-auto max-h-96">
                      <div className="text-xs text-gray-500 mb-2">Raw Response:</div>
                      {renderJsonObject(request.response, `request-${index}`)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!debugData && !loading && !error && (
          <div className="text-center py-8 text-gray-500">
            <p>Click "Fetch Debug Data" to see raw Facebook API responses</p>
            <p className="text-sm mt-1">This will help you understand what data Facebook is returning</p>
          </div>
        )}
      </div>
    </div>
  )
}
