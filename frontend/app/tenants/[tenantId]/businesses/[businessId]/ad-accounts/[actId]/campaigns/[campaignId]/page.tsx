'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { AdAccountHierarchyCampaign, AdAccountHierarchyPayload } from '@/lib/shared-types';
import AdSetRow from '@/components/ad-account/AdSetRow';
import AdRow from '@/components/ad-account/AdRow';
import MetricBadge from '@/components/ad-account/MetricBadge';
import TargetingSummary from '@/components/ad-account/TargetingSummary';

type CampaignTab = 'overview' | 'adsets' | 'ads' | 'settings';

export default function CampaignDetailPage() {
  const params = useParams<{
    tenantId: string;
    businessId: string;
    actId: string;
    campaignId: string;
  }>();
  const tenantId = params.tenantId;
  const businessId = params.businessId;
  const actId = decodeURIComponent(params.actId || '');
  const campaignId = decodeURIComponent(params.campaignId || '');

  const [tab, setTab] = useState<CampaignTab>('overview');
  const [campaign, setCampaign] = useState<AdAccountHierarchyCampaign | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!tenantId || !businessId || !actId || !campaignId) return;
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
        const rawPayload = (await response.json()) as Record<string, unknown>;
        if (!response.ok || rawPayload.success === false) {
          throw new Error(
            typeof rawPayload.error === 'string' ? rawPayload.error : 'Failed to load campaign details.'
          );
        }
        const payload = rawPayload as unknown as AdAccountHierarchyPayload;
        const found = (payload.campaigns || []).find((entry) => entry.id === campaignId) || null;
        setCampaign(found);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load campaign details.');
      } finally {
        setIsLoading(false);
      }
    };
    void run();
  }, [tenantId, businessId, actId, campaignId]);

  const ads = useMemo(() => campaign?.adSets.flatMap((adSet) => adSet.ads) || [], [campaign]);

  if (!tenantId || !businessId || !actId || !campaignId) {
    return <main className="p-6 text-rose-600">Missing route params.</main>;
  }

  return (
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{campaign?.name || 'Campaign detail'}</h2>
          <p className="text-sm text-slate-600">
            Account <span className="font-mono">{actId}</span> / Campaign <span className="font-mono">{campaignId}</span>
          </p>
        </div>
        <Link
          href={`/tenants/${tenantId}/businesses/${encodeURIComponent(businessId)}/ad-accounts/${encodeURIComponent(actId)}`}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Back to Ad Account
        </Link>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {isLoading ? <p className="text-sm text-slate-600">Loading campaign...</p> : null}
      {!isLoading && !campaign ? <p className="text-sm text-slate-600">Campaign not found in this account.</p> : null}

      {!isLoading && campaign ? (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap gap-2">
              <MetricBadge label="Spend" metric="spend" value={campaign.performance.spend} />
              <MetricBadge label="CTR" metric="ctr" value={campaign.performance.ctr} />
              <MetricBadge label="CPC" metric="cpc" value={campaign.performance.cpc} />
              <MetricBadge label="Conv" metric="conversions" value={campaign.performance.conversions} />
              <MetricBadge
                label="CPA"
                metric="costPerConversion"
                value={campaign.performance.costPerConversion}
              />
            </div>
            <div className="mt-3">
              <TargetingSummary summary={campaign.targetingSummary} />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-4 flex flex-wrap gap-2">
              <TabButton label="Overview" selected={tab === 'overview'} onClick={() => setTab('overview')} />
              <TabButton label="Ad Sets" selected={tab === 'adsets'} onClick={() => setTab('adsets')} />
              <TabButton label="Ads" selected={tab === 'ads'} onClick={() => setTab('ads')} />
              <TabButton label="Settings" selected={tab === 'settings'} onClick={() => setTab('settings')} />
            </div>

            {tab === 'overview' ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-md border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Objective</p>
                  <p className="text-sm font-medium text-slate-900">{campaign.objective || 'Not set'}</p>
                </div>
                <div className="rounded-md border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Status</p>
                  <p className="text-sm font-medium text-slate-900">{campaign.status}</p>
                </div>
                <div className="rounded-md border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Ad Sets</p>
                  <p className="text-sm font-medium text-slate-900">{campaign.adSets.length}</p>
                </div>
                <div className="rounded-md border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Ads</p>
                  <p className="text-sm font-medium text-slate-900">{ads.length}</p>
                </div>
              </div>
            ) : null}

            {tab === 'adsets' ? (
              <div className="space-y-3">
                {campaign.adSets.length === 0 ? (
                  <p className="text-sm text-slate-600">No ad sets yet for this campaign.</p>
                ) : (
                  campaign.adSets.map((adSet) => <AdSetRow key={adSet.id} adSet={adSet} />)
                )}
              </div>
            ) : null}

            {tab === 'ads' ? (
              <div className="space-y-3">
                {ads.length === 0 ? (
                  <p className="text-sm text-slate-600">No ads yet for this campaign.</p>
                ) : (
                  ads.map((ad) => <AdRow key={ad.id} ad={ad} />)
                )}
              </div>
            ) : null}

            {tab === 'settings' ? (
              <p className="text-sm text-slate-600">
                Campaign settings editing can be added here without changing route structure.
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  );
}

function TabButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm ${
        selected ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );
}
