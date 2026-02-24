'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AIActionLog from '@/components/AIActionLog';
import AICommandCenter from '@/components/AICommandCenter';
import CampaignRow from '@/components/ad-account/CampaignRow';
import AdSetRow from '@/components/ad-account/AdSetRow';
import AdRow from '@/components/ad-account/AdRow';
import MaterialsTab from '@/components/ad-account/MaterialsTab';
import type {
  AdAccountHierarchyPayload,
  ExecutionStep,
  ExecutionSummary,
  FacebookAccount,
} from '@/lib/shared-types';

type AdAccountTab = 'campaigns' | 'adsets' | 'ads' | 'materials' | 'settings';

export default function BusinessAdAccountDetailPage() {
  const params = useParams<{ tenantId: string; businessId: string; actId: string }>();
  const tenantId = params.tenantId;
  const businessId = params.businessId;
  const actId = decodeURIComponent(params.actId || '');

  const [tab, setTab] = useState<AdAccountTab>('campaigns');
  const [isCommandPanelCollapsed, setIsCommandPanelCollapsed] = useState(false);
  const [payload, setPayload] = useState<AdAccountHierarchyPayload | null>(null);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [executionSummary, setExecutionSummary] = useState<ExecutionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId || !businessId || !actId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/tenants/${tenantId}/businesses/${encodeURIComponent(
          businessId
        )}/ad-accounts/${encodeURIComponent(actId)}/hierarchy`,
        {
          headers: { 'x-tenant-id': tenantId },
          cache: 'no-store',
        }
      );
      const hierarchyPayload = await response.json();
      if (!response.ok || !hierarchyPayload.success) {
        throw new Error(hierarchyPayload.error || 'Failed to load ad account hierarchy.');
      }
      setPayload(hierarchyPayload as AdAccountHierarchyPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load ad account detail.');
      setPayload(null);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, businessId, actId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tenantId && businessId) {
      window.localStorage.setItem(`selectedBusinessId:${tenantId}`, businessId);
    }
  }, [tenantId, businessId]);

  const aiSelectedAccount: FacebookAccount | null = payload?.adAccount
    ? {
        id: payload.adAccount.adAccountId,
        businessId,
        name: payload.adAccount.name,
        status:
          String(payload.adAccount.status || '').toUpperCase() === 'DISABLED'
            ? 'disabled'
            : 'active',
        currency: 'USD',
        timezone: 'UTC',
        lastActivity: new Date(),
        createdAt: new Date(),
        metrics: {
          ctr: payload.quickMetrics.ctr7d,
          cpm: 0,
          cpc: 0,
          budget: 0,
          spend: payload.quickMetrics.spend7d,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          reach: 0,
          frequency: 0,
        },
        activeCampaigns: payload.quickMetrics.activeCampaigns,
        totalCampaigns: payload.campaigns.length,
      }
    : null;

  if (!tenantId || !businessId || !actId) {
    return <main className="p-6 text-red-600">Missing tenantId, businessId, or actId in route.</main>;
  }

  return (
    <main className="space-y-4 p-6 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {payload?.adAccount.name || 'Ad Account Detail'}
          </h2>
          <p className="text-sm text-gray-600">
            BP <span className="font-mono">{businessId}</span> / Account{' '}
            <span className="font-mono">{actId}</span>
          </p>
        </div>
        <Link
          href={`/tenants/${tenantId}/businesses/${encodeURIComponent(businessId)}`}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
        >
          Back to BP
        </Link>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {isLoading ? <p className="text-sm text-gray-600">Loading ad account...</p> : null}

      {!isLoading && !payload ? (
        <p className="text-sm text-gray-600">Ad account not found in this Business Portfolio.</p>
      ) : null}

      {!isLoading && payload ? (
        <div className="grid h-[calc(100vh-190px)] grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="overflow-auto rounded-lg border border-slate-200 bg-slate-50">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{payload.adAccount.name}</h3>
                  <span
                    className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      String(payload.adAccount.status || '').toUpperCase() === 'DISABLED'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {payload.adAccount.status || 'UNKNOWN'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <QuickMetricCard label="Spend (7d)" value={`$${payload.quickMetrics.spend7d.toFixed(2)}`} />
                  <QuickMetricCard label="Active Campaigns" value={`${payload.quickMetrics.activeCampaigns}`} />
                  <QuickMetricCard label="Active Ad Sets" value={`${payload.quickMetrics.activeAdSets}`} />
                  <QuickMetricCard label="Active Ads" value={`${payload.quickMetrics.activeAds}`} />
                  <QuickMetricCard label="CTR (7d)" value={`${payload.quickMetrics.ctr7d.toFixed(2)}%`} />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <TabButton label="Campaigns" selected={tab === 'campaigns'} onClick={() => setTab('campaigns')} />
                <TabButton label="Ad Sets" selected={tab === 'adsets'} onClick={() => setTab('adsets')} />
                <TabButton label="Ads" selected={tab === 'ads'} onClick={() => setTab('ads')} />
                <TabButton label="Materials" selected={tab === 'materials'} onClick={() => setTab('materials')} />
                <TabButton label="Settings" selected={tab === 'settings'} onClick={() => setTab('settings')} />
              </div>
            </div>

            <div className="space-y-3 p-4">
              {tab === 'campaigns' ? (
                payload.campaigns.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-slate-600">
                    No campaigns yet. Create one using AI Command Center.
                  </p>
                ) : (
                  payload.campaigns.map((campaign) => (
                    <CampaignRow
                      key={campaign.id}
                      campaign={campaign}
                      href={`/tenants/${tenantId}/businesses/${encodeURIComponent(
                        businessId
                      )}/ad-accounts/${encodeURIComponent(actId)}/campaigns/${encodeURIComponent(campaign.id)}`}
                    />
                  ))
                )
              ) : null}

              {tab === 'adsets' ? (
                payload.adSets.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-slate-600">
                    No ad sets yet. Create one using AI Command Center.
                  </p>
                ) : (
                  payload.adSets.map((adSet) => <AdSetRow key={adSet.id} adSet={adSet} />)
                )
              ) : null}

              {tab === 'ads' ? (
                payload.ads.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-slate-600">
                    No ads yet. Create one using AI Command Center.
                  </p>
                ) : (
                  payload.ads.map((ad) => <AdRow key={ad.id} ad={ad} />)
                )
              ) : null}

              {tab === 'materials' ? (
                <MaterialsTab
                  tenantId={tenantId}
                  adAccountName={payload.adAccount.name}
                  adAccountId={payload.adAccount.adAccountId}
                  ads={payload.ads}
                />
              ) : null}

              {tab === 'settings' ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs text-slate-500">Default Page</p>
                    <p className="text-sm font-medium text-slate-900">
                      {payload.adAccount.defaultPageId || 'Not set'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs text-slate-500">DSA Status</p>
                    <p className="text-sm font-medium text-slate-900">
                      {payload.adAccount.dsaConfigured ? 'Configured' : 'Missing'}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="flex min-h-0 flex-col overflow-auto rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">AI Command Panel</h3>
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                onClick={() => setIsCommandPanelCollapsed((prev) => !prev)}
              >
                {isCommandPanelCollapsed ? 'Expand' : 'Collapse'}
              </button>
            </div>

            {isCommandPanelCollapsed ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                Command Center is collapsed. Expand to run commands.
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 overflow-auto">
                  <AICommandCenter
                    selectedAccount={aiSelectedAccount}
                    selectedTenantId={tenantId}
                    selectedBusinessId={businessId}
                    requiresDefaultPage={!payload.adAccount.defaultPageId}
                    accountContext={{
                      defaultPageId: payload.adAccount.defaultPageId,
                      dsaConfigured: payload.adAccount.dsaConfigured,
                      health: payload.health,
                    }}
                    executionSteps={executionSteps}
                    executionSummary={executionSummary}
                    onNavigateToDefaultPage={() => {
                      window.location.href = `/tenants/${tenantId}/businesses/${encodeURIComponent(businessId)}`;
                    }}
                    onNavigateToDsaSettings={(adAccountId) => {
                      window.location.href = `/tenants/${tenantId}/businesses/${encodeURIComponent(
                        businessId
                      )}?openDsaFor=${encodeURIComponent(adAccountId)}`;
                    }}
                    onExecutionReset={() => {
                      setExecutionSteps([]);
                      setExecutionSummary(null);
                    }}
                    onStepUpdate={(step) =>
                      setExecutionSteps((prev) => {
                        const existingIndex = prev.findIndex((item) => item.id === step.id);
                        if (existingIndex >= 0) {
                          const next = [...prev];
                          next[existingIndex] = step;
                          return next;
                        }
                        return [...prev, step];
                      })
                    }
                    onSummary={(summary) => {
                      setExecutionSummary(summary);
                      setIsCommandPanelCollapsed(true);
                    }}
                  />
                </div>

                <div className="mt-4 min-h-0 flex-1 overflow-auto border-t border-slate-200 pt-4">
                  <AIActionLog steps={executionSteps} summary={executionSummary} />
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}

function QuickMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-center">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function TabButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`rounded-md px-3 py-1.5 text-sm ${
        selected ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
