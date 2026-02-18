'use client'

import React, { useState, useEffect } from 'react'
import { FacebookAccount, Campaign } from '../../shared/types'
import { 
  EyeIcon, 
  CursorArrowRaysIcon, 
  BanknotesIcon,
  ChartBarIcon,
  ClockIcon,
  ArrowPathIcon,
  PlayIcon,
  RocketLaunchIcon
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

interface AccountsGridProps {
  accounts: FacebookAccount[]
  selectedAccount: FacebookAccount | null
  onSelectAccount: (account: FacebookAccount) => void
  campaignRefreshKey?: number
}

export default function AccountsGrid({ accounts, selectedAccount, onSelectAccount, campaignRefreshKey }: AccountsGridProps) {
  if (selectedAccount) {
    return <AccountDetails account={selectedAccount} campaignRefreshKey={campaignRefreshKey} />
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Facebook Accounts</h2>
        <p className="text-gray-600">
          {accounts.length > 0 
            ? 'Manage your Facebook advertising accounts and monitor performance'
            : 'Connect your Facebook accounts to start managing campaigns'
          }
        </p>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-16">
          <ChartBarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Facebook accounts found</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Make sure you have a valid Facebook User Access Token with Marketing API permissions in your .env file.
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-w-lg mx-auto">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Need help?</h4>
            <p className="text-sm text-gray-600">
              1. Get a User Access Token from Facebook Graph API Explorer<br/>
              2. Add permissions: ads_management, ads_read, business_management<br/>
              3. Update FB_ACCESS_TOKEN in your .env file<br/>
              4. Restart the server
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {accounts.map((account) => (
          <div
            key={account.id}
            onClick={() => onSelectAccount(account)}
            className="metric-card cursor-pointer hover:ring-2 hover:ring-facebook-500 hover:ring-opacity-50 transition-all"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 truncate">
                {account.name}
              </h3>
              <span className={clsx(
                'px-2 py-1 rounded-full text-xs font-medium',
                `status-${account.status}`
              )}>
                {account.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <CursorArrowRaysIcon className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">CTR</p>
                  <p className="text-sm font-semibold">{account.metrics.ctr}%</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <BanknotesIcon className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">CPM</p>
                  <p className="text-sm font-semibold">${account.metrics.cpm}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Spend</span>
                <span className="text-sm font-medium">${account.metrics.spend.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Budget</span>
                <span className="text-sm font-medium">${account.metrics.budget.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-facebook-600 h-2 rounded-full" 
                  style={{ width: `${(account.metrics.spend / account.metrics.budget) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="flex justify-between text-xs text-gray-500">
              <span>{account.activeCampaigns} active campaigns</span>
              <span>Last activity: {new Date(account.lastActivity).toLocaleDateString('en-US')}</span>
            </div>
          </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AccountDetails({ account, campaignRefreshKey }: { account: FacebookAccount; campaignRefreshKey?: number }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true)
  const [campaignsError, setCampaignsError] = useState<string | null>(null)
  const [hidePerformanceData, setHidePerformanceData] = useState(false)
  
  // New states for hierarchy navigation
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [adSets, setAdSets] = useState<any[]>([])
  const [selectedAdSet, setSelectedAdSet] = useState<any>(null)
  const [ads, setAds] = useState<any[]>([])
  const [isLoadingAdSets, setIsLoadingAdSets] = useState(false)
  const [isLoadingAds, setIsLoadingAds] = useState(false)
  const [viewMode, setViewMode] = useState<'campaigns' | 'adsets' | 'ads'>('campaigns')

  const fetchCampaigns = async () => {
    try {
      setIsLoadingCampaigns(true)
      setCampaignsError(null)
      const response = await fetch(`/api/facebook/campaigns?accountId=${account.id}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.campaigns) {
          setCampaigns(data.campaigns)
        }
      } else {
        setCampaignsError('Failed to fetch campaigns')
      }
    } catch (error) {
      console.error('Error fetching campaigns:', error)
      setCampaignsError('Error loading campaigns')
    } finally {
      setIsLoadingCampaigns(false)
    }
  }

  const fetchAdSets = async (campaignId: string) => {
    try {
      setIsLoadingAdSets(true)
      const response = await fetch(`/api/facebook/adsets?campaignId=${campaignId}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.adSets) {
          setAdSets(data.adSets)
        }
      }
    } catch (error) {
      console.error('Error fetching ad sets:', error)
      setAdSets([])
    } finally {
      setIsLoadingAdSets(false)
    }
  }

  const fetchAds = async (adSetId: string) => {
    try {
      setIsLoadingAds(true)
      const response = await fetch(`/api/facebook/ads?adSetId=${adSetId}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.ads) {
          setAds(data.ads)
        }
      }
    } catch (error) {
      console.error('Error fetching ads:', error)
      setAds([])
    } finally {
      setIsLoadingAds(false)
    }
  }

  const handleCampaignSelect = (campaign: Campaign) => {
    setSelectedCampaign(campaign)
    setViewMode('adsets')
    fetchAdSets(campaign.id)
  }

  const handleAdSetSelect = (adSet: any) => {
    setSelectedAdSet(adSet)
    setViewMode('ads')
    fetchAds(adSet.id)
  }

  const handleBackToCampaigns = () => {
    setViewMode('campaigns')
    setSelectedCampaign(null)
    setAdSets([])
  }

  const handleBackToAdSets = () => {
    setViewMode('adsets')
    setSelectedAdSet(null)
    setAds([])
  }

  useEffect(() => {
    fetchCampaigns()
  }, [account.id])

  // Refresh campaigns when campaignRefreshKey changes
  useEffect(() => {
    if (campaignRefreshKey && campaignRefreshKey > 0) {
      fetchCampaigns()
    }
  }, [campaignRefreshKey])


  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{account.name}</h2>
            <p className="text-gray-600">Account ID: {account.id}</p>
          </div>
          <span className={clsx(
            'px-3 py-1 rounded-full text-sm font-medium',
            `status-${account.status}`
          )}>
            {account.status}
          </span>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="metric-card">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-3">
              <CursorArrowRaysIcon className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Click-Through Rate</p>
              <p className="text-2xl font-bold">{account.metrics.ctr}%</p>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
              <BanknotesIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Cost Per Mille</p>
              <p className="text-2xl font-bold">${account.metrics.cpm}</p>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
              <ChartBarIcon className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Spend</p>
              <p className="text-2xl font-bold">${account.metrics.spend.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mr-3">
              <EyeIcon className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Impressions</p>
              <p className="text-2xl font-bold">{account.metrics.impressions.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="metric-card">
          <h3 className="text-lg font-semibold mb-4">Performance Metrics</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Cost Per Click</span>
              <span className="font-medium">${account.metrics.cpc}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Clicks</span>
              <span className="font-medium">{account.metrics.clicks.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Conversions</span>
              <span className="font-medium">{account.metrics.conversions.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Reach</span>
              <span className="font-medium">{account.metrics.reach.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Frequency</span>
              <span className="font-medium">{account.metrics.frequency}</span>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <h3 className="text-lg font-semibold mb-4">Account Information</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Currency</span>
              <span className="font-medium">{account.currency}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Timezone</span>
              <span className="font-medium">{account.timezone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Active Campaigns</span>
              <span className="font-medium">{account.activeCampaigns}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Total Campaigns</span>
              <span className="font-medium">{account.totalCampaigns}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Created</span>
              <span className="font-medium">{new Date(account.createdAt).toLocaleDateString('en-US')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Budget Progress */}
      <div className="metric-card">
        <h3 className="text-lg font-semibold mb-4">Budget Utilization</h3>
        <div className="mb-2 flex justify-between text-sm">
          <span>Spent: ${account.metrics.spend.toLocaleString()}</span>
          <span>Budget: ${account.metrics.budget.toLocaleString()}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div 
            className="bg-facebook-600 h-3 rounded-full transition-all duration-500" 
            style={{ width: `${Math.min((account.metrics.spend / account.metrics.budget) * 100, 100)}%` }}
          ></div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {((account.metrics.spend / account.metrics.budget) * 100).toFixed(1)}% of budget used
        </p>
      </div>

      {/* Campaigns Section */}
      <div className="metric-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold">
              {viewMode === 'campaigns' ? 'Campaigns' : 
               viewMode === 'adsets' ? `Ad Sets - ${selectedCampaign?.name}` : 
               `Ads - ${selectedAdSet?.name}`}
            </h3>
            {/* Breadcrumb Navigation */}
            {viewMode !== 'campaigns' && (
              <div className="flex items-center space-x-2 text-sm">
                <button 
                  onClick={handleBackToCampaigns}
                  className="text-facebook-600 hover:text-facebook-700 underline"
                >
                  ← Back to Campaigns
                </button>
                {viewMode === 'ads' && (
                  <>
                    <span className="text-gray-400">|</span>
                    <button 
                      onClick={handleBackToAdSets}
                      className="text-facebook-600 hover:text-facebook-700 underline"
                    >
                      ← Back to Ad Sets
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setHidePerformanceData(!hidePerformanceData)}
              className="text-xs text-gray-600 hover:text-gray-800"
            >
              {hidePerformanceData ? 'Show Performance' : 'Hide Performance'}
            </button>
            <span className="text-xs text-gray-500">API Data</span>
            <button
              onClick={() => {
                // Force fresh data by clearing any cache
                setCampaigns([])
                fetchCampaigns()
              }}
              disabled={isLoadingCampaigns}
              className="flex items-center space-x-2 px-3 py-2 text-sm bg-facebook-50 text-facebook-600 rounded-md hover:bg-facebook-100 disabled:opacity-50"
            >
              <ArrowPathIcon className={clsx('w-4 h-4', isLoadingCampaigns && 'animate-spin')} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {campaignsError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{campaignsError}</p>
          </div>
        )}

        {isLoadingCampaigns ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-facebook-600"></div>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-8">
            <RocketLaunchIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">No campaigns found</h4>
            <p className="text-gray-500 mb-4">
              Use the AI Command Center to create your first campaign
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
              <p className="text-sm text-blue-700">
                <strong>Note:</strong> If you have campaigns in Facebook Ads Manager but don't see them here, 
                they might be in draft status or pending review.
              </p>
            </div>
          </div>
        ) : (
          <div>
            {/* Campaigns View */}
            {viewMode === 'campaigns' && (
              <div className="space-y-6">
                {campaigns.map((campaign) => (
              <div key={campaign.id} className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm hover:shadow-md transition-shadow">
                {/* Campaign Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className={clsx(
                      'w-4 h-4 rounded-full flex-shrink-0',
                      (campaign.status === 'active' || campaign.status.toLowerCase() === 'active') ? 'bg-green-500' : 
                      (campaign.status === 'paused' || campaign.status.toLowerCase() === 'paused') ? 'bg-gray-400' : 
                      campaign.status.includes('REVIEW') ? 'bg-blue-500' :
                      campaign.status.includes('PREAPPROVED') ? 'bg-blue-400' :
                      campaign.status.includes('DISAPPROVED') ? 'bg-red-500' :
                      campaign.status.includes('ARCHIVED') ? 'bg-gray-500' :
                      'bg-gray-400'
                    )} />
                    <div>
                      <h4 className="font-semibold text-gray-900 text-lg">{campaign.name}</h4>
                      <p className="text-sm text-gray-500 mt-1">
                        Objective: <span className="font-medium">{campaign.objective}</span>
                      </p>
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  {viewMode === 'campaigns' && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleCampaignSelect(campaign)}
                        className="px-3 py-1 bg-facebook-600 text-white rounded-md text-sm hover:bg-facebook-700 transition-colors"
                      >
                        View Ad Sets
                      </button>
                    </div>
                  )}
                </div>

                {/* Budget Section */}
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Budget</p>
                      <p className="text-xl font-bold text-gray-900">
                        {campaign.budget?.daily ? `$${(campaign.budget.daily / 100).toFixed(2)}` :
                         campaign.budget?.lifetime ? `$${(campaign.budget.lifetime / 100).toFixed(2)}` : 
                         '$0.00'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {campaign.budget?.daily ? 'per day' :
                         campaign.budget?.lifetime ? 'lifetime' : 
                         'Not set'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Spent</p>
                      <p className="text-xl font-bold text-gray-900">
                        {hidePerformanceData ? '$--' :
                         (campaign.performance?.spend && campaign.performance.spend > 0) 
                          ? `$${campaign.performance.spend.toFixed(2)}` 
                          : '$0.00'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {hidePerformanceData ? 'data hidden' :
                         campaign.performance?.spend === 0 ? 'no spend yet' : 'total spent'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Performance Data Hidden Notice */}
                {hidePerformanceData && (
                  <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
                    <p className="text-sm text-gray-600">
                      Performance data is hidden. Click "Show Performance" above to display metrics.
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Useful when API data doesn't match Facebook Ads Manager
                    </p>
                  </div>
                )}

                {/* Performance Metrics */}
                {campaign.performance && !hidePerformanceData && (
                  <div>
                    {/* Data Freshness Warning */}
                    {campaign.performance.spend > 0 && (campaign.status === 'active' || campaign.status.toUpperCase() === 'ACTIVE') && (
                      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-start space-x-2">
                          <div className="w-4 h-4 bg-yellow-400 rounded-full flex-shrink-0 mt-0.5"></div>
                          <div>
                            <p className="text-sm text-yellow-800 font-medium">Performance Data Notice</p>
                            <p className="text-xs text-yellow-700 mt-1">
                              This data comes from Facebook's API and may include test/development values. 
                              Check Facebook Ads Manager for the most accurate real-time data.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    
         
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 bg-blue-50 rounded-lg">
                        <p className="text-2xl font-bold text-blue-600">
                          {(campaign.performance.impressions && campaign.performance.impressions > 0) 
                            ? campaign.performance.impressions.toLocaleString() 
                            : '0'}
                        </p>
                        <p className="text-sm text-blue-700 font-medium">Impressions</p>
                        {campaign.performance.impressions === 0 && (
                          <p className="text-xs text-gray-500 mt-1">No data yet</p>
                        )}
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <p className="text-2xl font-bold text-green-600">
                          {(campaign.performance.clicks && campaign.performance.clicks > 0) 
                            ? campaign.performance.clicks.toLocaleString() 
                            : '0'}
                        </p>
                        <p className="text-sm text-green-700 font-medium">Clicks</p>
                        {campaign.performance.clicks === 0 && (
                          <p className="text-xs text-gray-500 mt-1">No data yet</p>
                        )}
                      </div>
                      <div className="text-center p-3 bg-purple-50 rounded-lg">
                        <p className="text-2xl font-bold text-purple-600">
                          {(campaign.performance.ctr && campaign.performance.ctr > 0) 
                            ? campaign.performance.ctr.toFixed(2) + '%' 
                            : '0.00%'}
                        </p>
                        <p className="text-sm text-purple-700 font-medium">CTR</p>
                        {campaign.performance.ctr === 0 && (
                          <p className="text-xs text-gray-500 mt-1">No data yet</p>
                        )}
                      </div>
                      <div className="text-center p-3 bg-orange-50 rounded-lg">
                        <p className="text-2xl font-bold text-orange-600">
                          ${(campaign.performance.cpc && campaign.performance.cpc > 0) 
                            ? campaign.performance.cpc.toFixed(2) 
                            : '0.00'}
                        </p>
                        <p className="text-sm text-orange-700 font-medium">CPC</p>
                        {campaign.performance.cpc === 0 && (
                          <p className="text-xs text-gray-500 mt-1">No data yet</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Campaign Status Notice */}
                {campaign.status.includes('REVIEW') && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-700">
                      <strong>Pending Review:</strong> This campaign is under Facebook review and will be active once approved.
                    </p>
                  </div>
                )}
                {campaign.status.includes('DISAPPROVED') && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">
                      <strong>Disapproved:</strong> This campaign was rejected by Facebook. Check ad policies and make necessary changes.
                    </p>
                  </div>
                )}
                {campaign.status.includes('ARCHIVED') && (
                  <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-700">
                      <strong>Archived:</strong> This campaign is no longer active and won't generate new performance data.
                    </p>
                  </div>
                )}
                </div>
                ))}
              </div>
            )}

            {/* Ad Sets View */}
            {viewMode === 'adsets' && selectedCampaign && (
              <div className="space-y-4">
                <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-semibold text-blue-900">Campaign: {selectedCampaign.name}</h4>
                  <p className="text-sm text-blue-700">Objective: {selectedCampaign.objective}</p>
                </div>

                {isLoadingAdSets ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-facebook-600"></div>
                  </div>
                ) : adSets.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-gray-400 mb-4 text-4xl">📊</div>
                    <h4 className="text-lg font-medium text-gray-900 mb-2">No ad sets found</h4>
                    <p className="text-gray-500 mb-4">Use the AI Command Center to create ad sets for this campaign</p>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 max-w-md mx-auto">
                      <p className="text-sm text-green-700">
                        <strong>Try this command:</strong><br/>
                        "Create ad set for {selectedCampaign.name} with $5 daily budget"
                      </p>
                    </div>
                  </div>
                ) : (
                  adSets.map((adSet) => (
                    <div key={adSet.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={clsx(
                            'w-3 h-3 rounded-full',
                            adSet.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-400'
                          )} />
                          <div>
                            <h4 className="font-semibold text-gray-900">{adSet.name}</h4>
                            <p className="text-sm text-gray-500">{adSet.optimizationGoal} - {adSet.billingEvent}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <p className="text-sm font-medium">${adSet.dailyBudget ? (adSet.dailyBudget / 100).toFixed(2) : '0.00'}/day</p>
                            <p className="text-xs text-gray-500">Budget</p>
                          </div>
                          <button
                            onClick={() => handleAdSetSelect(adSet)}
                            className="px-3 py-1 bg-facebook-600 text-white rounded-md text-sm hover:bg-facebook-700"
                          >
                            View Ads
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Ads View */}
            {viewMode === 'ads' && selectedAdSet && selectedCampaign && (
              <div className="space-y-4">
                <div className="mb-4 p-4 bg-green-50 rounded-lg">
                  <h4 className="font-semibold text-green-900">Ad Set: {selectedAdSet.name}</h4>
                  <p className="text-sm text-green-700">Campaign: {selectedCampaign.name}</p>
                </div>

                {isLoadingAds ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-facebook-600"></div>
                  </div>
                ) : ads.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-gray-400 mb-4 text-4xl">🎯</div>
                    <h4 className="text-lg font-medium text-gray-900 mb-2">No ads found</h4>
                    <p className="text-gray-500 mb-4">Use the AI Command Center to create ads with links</p>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 max-w-md mx-auto">
                      <p className="text-sm text-green-700">
                        <strong>Try this command:</strong><br/>
                        "Add link https://example.com to {selectedCampaign.name}"
                      </p>
                    </div>
                  </div>
                ) : (
                  ads.map((ad) => (
                    <div key={ad.id} className="border border-gray-200 rounded-lg p-4 bg-white">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={clsx(
                            'w-3 h-3 rounded-full mt-2',
                            ad.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-400'
                          )} />
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">{ad.name}</h4>
                            {ad.creative && (
                              <div className="mt-2 text-sm text-gray-600">
                                {ad.creative.title && <p><strong>Title:</strong> {ad.creative.title}</p>}
                                {ad.creative.body && <p><strong>Body:</strong> {ad.creative.body}</p>}
                                {ad.creative.linkUrl && (
                                  <p className="mt-1">
                                    <strong>Link:</strong> 
                                    <a href={ad.creative.linkUrl} target="_blank" rel="noopener noreferrer" 
                                       className="ml-2 text-facebook-600 hover:text-facebook-700 underline">
                                      {ad.creative.linkUrl}
                                    </a>
                                  </p>
                                )}
                                {ad.creative.callToAction && <p><strong>CTA:</strong> {ad.creative.callToAction}</p>}
                              </div>
                            )}
                          </div>
                        </div>
                        <span className={clsx(
                          'px-2 py-1 text-xs rounded-full',
                          ad.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        )}>
                          {ad.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

