'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
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
  const [payload, setPayload] = useState<AdAccountHierarchyPayload | null>(null);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [executionSummary, setExecutionSummary] = useState<ExecutionSummary | null>(null);
  const [createdSummary, setCreatedSummary] = useState<{
    campaignId?: string;
    adSetId?: string;
    adId?: string;
  } | null>(null);
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


  useEffect(() => {
    if (!tenantId || !businessId || !actId) return;
    if (executionSteps.length > 0 || executionSummary) return;
    const run = async () => {
      try {
        const runsResponse = await fetch(
          `/api/ai-command/runs?businessId=${encodeURIComponent(
            businessId
          )}&adAccountId=${encodeURIComponent(actId)}&limit=1`,
          {
            headers: { 'x-tenant-id': tenantId },
            cache: 'no-store',
          }
        );
        const runsPayload = await runsResponse.json();
        if (!runsResponse.ok || !runsPayload.success || !Array.isArray(runsPayload.runs)) {
          return;
        }
        const latestRun = runsPayload.runs[0];
        if (!latestRun?.id) return;
        const eventsResponse = await fetch(`/api/ai-command/runs/${latestRun.id}/events`, {
          headers: { 'x-tenant-id': tenantId },
          cache: 'no-store',
        });
        const eventsPayload = await eventsResponse.json();
        if (!eventsResponse.ok || !eventsPayload.success || !Array.isArray(eventsPayload.events)) {
          return;
        }
        const reconstructed = rehydrateTimeline(eventsPayload.events);
        if (reconstructed.steps.length > 0) {
          setExecutionSteps(reconstructed.steps);
        }
        if (reconstructed.summary) {
          setExecutionSummary(reconstructed.summary);
        }
      } catch {
        // Don't block page rendering when timeline history fetch fails.
      }
    };
    void run();
  }, [tenantId, businessId, actId, executionSteps.length, executionSummary]);

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
      {createdSummary ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-medium">Created successfully</p>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            {createdSummary.campaignId ? (
              <Link
                href={`/tenants/${tenantId}/businesses/${encodeURIComponent(
                  businessId
                )}/ad-accounts/${encodeURIComponent(actId)}/campaigns/${encodeURIComponent(
                  createdSummary.campaignId
                )}`}
                className="underline"
              >
                Campaign {createdSummary.campaignId}
              </Link>
            ) : null}
            {createdSummary.adSetId ? (
              <span>Ad Set {createdSummary.adSetId}</span>
            ) : null}
            {createdSummary.adId ? <span>Ad {createdSummary.adId}</span> : null}
          </div>
        </div>
      ) : null}

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
                setCreatedSummary(null);
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
              }}
              onExecutionComplete={(result) => {
                const cId = result.createdIds?.campaignId;
                const asId = result.createdIds?.adSetId || result.createdIds?.adSetIds?.[0];
                const aId = result.createdIds?.adId || result.createdIds?.adIds?.[0];
                setCreatedSummary(
                  result.success && (cId || asId || aId)
                    ? { campaignId: cId, adSetId: asId, adId: aId }
                    : null
                );
                setTimeout(() => void load(), 2000);
              }}
              onCampaignCreated={(campaignId) => {
                window.location.href = `/tenants/${tenantId}/businesses/${encodeURIComponent(
                  businessId
                )}/ad-accounts/${encodeURIComponent(actId)}/campaigns/${encodeURIComponent(campaignId)}`;
              }}
            />
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

function rehydrateTimeline(events: any[]): {
  steps: ExecutionStep[];
  summary: ExecutionSummary | null;
} {
  const byStepId = new Map<string, ExecutionStep>();
  let summary: ExecutionSummary | null = null;

  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const debugStep = event.debugJson?.step;
    if (debugStep && debugStep.id) {
      byStepId.set(String(debugStep.id), debugStep as ExecutionStep);
      continue;
    }
    if (typeof event.stepId === 'string') {
      const previous = byStepId.get(event.stepId);
      byStepId.set(event.stepId, {
        id: event.stepId,
        order: previous?.order ?? 99,
        title: String(event.label || previous?.title || event.stepId),
        type: previous?.type || 'validation',
        status: (event.status || previous?.status || 'running') as ExecutionStep['status'],
        summary: String(event.summary || previous?.summary || 'Step update'),
        userTitle: event.userTitle || previous?.userTitle,
        userMessage: event.userMessage || previous?.userMessage,
        nextSteps: Array.isArray(previous?.nextSteps)
          ? previous?.nextSteps
          : Array.isArray(event.nextSteps)
            ? event.nextSteps
            : undefined,
        rationale: event.rationale || previous?.rationale,
        technicalDetails: previous?.technicalDetails,
        fixesApplied: previous?.fixesApplied,
        attempts: previous?.attempts,
        meta: previous?.meta,
        debug: event.debugJson || previous?.debug,
        createdIds: event.createdIdsJson || previous?.createdIds,
        startedAt: previous?.startedAt || event.ts || new Date().toISOString(),
        finishedAt:
          event.status === 'success' || event.status === 'error'
            ? event.ts || previous?.finishedAt || new Date().toISOString()
            : previous?.finishedAt,
      });
    }
    if (event.type === 'timeline.done') {
      const eventSummary = event.debugJson?.summary;
      if (eventSummary) {
        summary = eventSummary as ExecutionSummary;
      }
    }
  }

  return {
    steps: Array.from(byStepId.values()).sort(
      (a, b) => a.order - b.order || a.startedAt.localeCompare(b.startedAt)
    ),
    summary,
  };
}
