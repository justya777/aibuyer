'use client'

import { useState, useEffect, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import AccountsGrid from '@/components/AccountsGrid'
import AICommandCenter from '@/components/AICommandCenter'
import AIActionLog from '@/components/AIActionLog'
import FacebookDebugPanel from '@/components/FacebookDebugPanel'
import MaterialUpload from '@/components/MaterialUpload'
import { FacebookAccount, AIAction, AICommand } from '../../shared/types'

// Empty initial state - accounts will be loaded from Facebook API
const initialAccounts: FacebookAccount[] = []

// Empty initial AI actions - will be populated when AI commands are executed
const initialActions: AIAction[] = []

export default function Dashboard() {
  const [accounts, setAccounts] = useState<FacebookAccount[]>(initialAccounts)
  const [actions, setActions] = useState<AIAction[]>(initialActions)
  const [selectedAccount, setSelectedAccount] = useState<FacebookAccount | null>(null)
  const [isLoadingAccounts, setIsLoadingAccounts] = useState<boolean>(true)
  const [campaignRefreshKey, setCampaignRefreshKey] = useState(0)
  const [debugMode, setDebugMode] = useState(false)
  const [showMaterialUpload, setShowMaterialUpload] = useState(false)
  const [uploadedMaterials, setUploadedMaterials] = useState<any[]>([])

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await fetch('/api/facebook/accounts')
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.accounts) {
          setAccounts(data.accounts)
        } else {
          setAccounts([])
        }
      } else {
        setAccounts([])
      }
    } catch (error) {
      console.error('Failed to fetch Facebook accounts:', error)
      setAccounts([])
    } finally {
      setIsLoadingAccounts(false)
    }
  }, [])

  // Fetch real Facebook accounts on component mount
  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  return (
    <div className="flex h-full bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-sm border-r border-gray-200">
        <Sidebar 
          accounts={accounts} 
          selectedAccount={selectedAccount}
          onSelectAccount={setSelectedAccount}
          isLoading={isLoadingAccounts}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">
              Facebook Account Manager
            </h1>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowMaterialUpload(!showMaterialUpload)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  showMaterialUpload 
                    ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {showMaterialUpload ? '📎 Materials' : '📎 Upload'}
              </button>
              <button
                onClick={() => setDebugMode(!debugMode)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  debugMode 
                    ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {debugMode ? '🔍 Debug Mode' : '🔧 Debug'}
              </button>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-sm text-gray-600">MCP Connected</span>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Accounts Grid or Debug Panel */}
          <div className="flex-1 p-6 overflow-auto">
            {debugMode ? (
              <FacebookDebugPanel 
                accountId={selectedAccount?.id}
                campaignId={undefined}
              />
            ) : showMaterialUpload ? (
              <div>
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Ad Materials</h2>
                  <p className="text-gray-600">Upload images and videos to use in your Facebook ads</p>
                </div>
                <MaterialUpload 
                  adName={selectedAccount?.name || 'default'}
                  onUploadSuccess={(material) => {
                    setUploadedMaterials(prev => [...prev, material]);
                    console.log('✅ Material uploaded:', material);
                  }}
                  onUploadError={(error) => {
                    console.error('❌ Upload error:', error);
                  }}
                />
                {uploadedMaterials.length > 0 && (
                  <div className="mt-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Available Materials ({uploadedMaterials.length})
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {uploadedMaterials.map((material) => (
                        <div key={material.id} className="border rounded-lg p-3 bg-white shadow-sm">
                          <div className="aspect-video bg-gray-100 rounded mb-2 flex items-center justify-center">
                            {material.category === 'image' ? (
                              <img 
                                src={material.fileUrl} 
                                alt={material.originalName}
                                className="max-w-full max-h-full object-cover rounded"
                              />
                            ) : (
                              <div className="text-gray-400">
                                <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v4l-2-2-2 2-2-2V5z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <p className="text-xs font-medium text-gray-900 truncate">{material.originalName}</p>
                          <p className="text-xs text-gray-500">{material.category.toUpperCase()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <AccountsGrid 
                accounts={accounts} 
                selectedAccount={selectedAccount}
                onSelectAccount={setSelectedAccount}
                campaignRefreshKey={campaignRefreshKey}
                onAccountsChanged={fetchAccounts}
              />
            )}
          </div>

          {/* Right Panel - AI Command Center and Logs */}
          <div className="w-96 border-l border-gray-200 bg-white flex flex-col">
            <div className="flex-1 p-6">
              <AICommandCenter 
                selectedAccount={selectedAccount}
                onActionComplete={(action) => {
                  setActions([action, ...actions])
                  // Trigger campaign refresh for any campaign-related action
                  if (action.type === 'campaign_create' || action.type === 'campaign_update') {
                    setCampaignRefreshKey(prev => prev + 1)
                  }
                }}
              />
            </div>
            <div className="flex-1 border-t border-gray-200 p-6 overflow-auto">
              <AIActionLog actions={actions} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
