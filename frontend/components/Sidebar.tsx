'use client'

import { FacebookAccount } from '../../shared/types'
import { ChartBarIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'

interface SidebarProps {
  accounts: FacebookAccount[]
  selectedAccount: FacebookAccount | null
  onSelectAccount: (account: FacebookAccount) => void
  isLoading?: boolean
}

export default function Sidebar({ accounts, selectedAccount, onSelectAccount, isLoading = false }: SidebarProps) {
  const totalSpend = accounts.reduce((sum, acc) => sum + acc.metrics.spend, 0)
  const totalBudget = accounts.reduce((sum, acc) => sum + acc.metrics.budget, 0)
  const avgCTR = accounts.length > 0 ? accounts.reduce((sum, acc) => sum + acc.metrics.ctr, 0) / accounts.length : 0

  return (
    <div className="flex flex-col h-full">
      {/* Logo/Title */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-facebook-600 rounded-lg flex items-center justify-center">
            <ChartBarIcon className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">FB Manager</h2>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-500 mb-4">Overview</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Total Accounts</span>
            <span className="text-sm font-medium">{accounts.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Total Spend</span>
            <span className="text-sm font-medium">${totalSpend.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Total Budget</span>
            <span className="text-sm font-medium">${totalBudget.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Avg CTR</span>
            <span className="text-sm font-medium">{avgCTR.toFixed(2)}%</span>
          </div>
        </div>
      </div>

      {/* Accounts List */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-4">Accounts</h3>
          
          {/* Loading State */}
          {isLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="w-full p-3 rounded-lg border bg-gray-50 animate-pulse">
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-12"></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="h-3 bg-gray-200 rounded"></div>
                    <div className="h-3 bg-gray-200 rounded"></div>
                    <div className="h-3 bg-gray-200 rounded"></div>
                    <div className="h-3 bg-gray-200 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && accounts.length === 0 && (
            <div className="text-center py-8">
              <ChartBarIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-2">No Facebook accounts found</p>
              <p className="text-xs text-gray-400">
                Check your Facebook API credentials in the .env file
              </p>
            </div>
          )}

          {/* Accounts List */}
          {!isLoading && accounts.length > 0 && (
            <div className="space-y-2">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => onSelectAccount(account)}
                  className={clsx(
                    'w-full text-left p-3 rounded-lg border transition-all',
                    selectedAccount?.id === account.id
                      ? 'bg-facebook-50 border-facebook-200 ring-1 ring-facebook-500'
                      : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-medium text-gray-900 truncate">
                      {account.name}
                    </h4>
                    <span className={clsx(
                      'text-xs px-2 py-1 rounded-full',
                      account.status === 'active' && 'bg-green-100 text-green-800',
                      account.status === 'inactive' && 'bg-gray-100 text-gray-800',
                      account.status === 'limited' && 'bg-yellow-100 text-yellow-800',
                      account.status === 'disabled' && 'bg-red-100 text-red-800'
                    )}>
                      {account.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                    <div>
                      <span className="font-medium">CTR:</span> {account.metrics.ctr}%
                    </div>
                    <div>
                      <span className="font-medium">CPM:</span> ${account.metrics.cpm}
                    </div>
                    <div>
                      <span className="font-medium">Spend:</span> ${account.metrics.spend.toLocaleString()}
                    </div>
                    <div>
                      <span className="font-medium">Campaigns:</span> {account.activeCampaigns}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Actions */}
      {/* <div className="p-6 border-t border-gray-200">
        <button className="w-full btn-primary">
          <CurrencyDollarIcon className="w-4 h-4 mr-2 inline" />
          Add Account
        </button>
      </div> */}
    </div>
  )
}
