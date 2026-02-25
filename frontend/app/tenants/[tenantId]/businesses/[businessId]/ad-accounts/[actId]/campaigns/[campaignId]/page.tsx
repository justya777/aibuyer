'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import type { AdAccountHierarchyAd, AdAccountHierarchyAdSet, AdAccountHierarchyCampaign } from '@/lib/shared-types';
import AdSetRow from '@/components/ad-account/AdSetRow';
import AdRow from '@/components/ad-account/AdRow';
import MetricBadge from '@/components/ad-account/MetricBadge';
import TargetingSummary from '@/components/ad-account/TargetingSummary';

type CampaignTab = 'overview' | 'adsets' | 'ads' | 'settings';

function buildApiBase(tenantId: string, businessId: string, actId: string) {
  return `/api/tenants/${tenantId}/businesses/${encodeURIComponent(businessId)}/ad-accounts/${encodeURIComponent(actId)}`;
}

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
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<CampaignTab>('overview');
  const [campaign, setCampaign] = useState<AdAccountHierarchyCampaign | null>(null);
  const [adSets, setAdSets] = useState<AdAccountHierarchyAdSet[]>([]);
  const [ads, setAds] = useState<AdAccountHierarchyAd[]>([]);
  const [selectedAdSetId, setSelectedAdSetId] = useState<string | null>(null);

  const [isCampaignLoading, setIsCampaignLoading] = useState(true);
  const [isAdSetsLoading, setIsAdSetsLoading] = useState(true);
  const [isAdsLoading, setIsAdsLoading] = useState(false);

  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [adSetsError, setAdSetsError] = useState<string | null>(null);
  const [adsError, setAdsError] = useState<string | null>(null);
  const [accountMismatch, setAccountMismatch] = useState<{ actualAccountId: string } | null>(null);
  const [campaignNotFound, setCampaignNotFound] = useState(false);
  const [rateLimited, setRateLimited] = useState<{ section: string; retryAfterMs: number } | null>(null);

  const fetchHeaders = useMemo(() => ({ 'x-tenant-id': tenantId }), [tenantId]);
  const apiBase = useMemo(
    () => (tenantId && businessId && actId ? buildApiBase(tenantId, businessId, actId) : ''),
    [tenantId, businessId, actId]
  );

  const fetchCampaign = useCallback(async () => {
    if (!apiBase || !campaignId) return;
    setIsCampaignLoading(true);
    setCampaignError(null);
    setCampaignNotFound(false);
    setAccountMismatch(null);
    try {
      const response = await fetch(
        `${apiBase}/campaigns/${encodeURIComponent(campaignId)}`,
        { headers: fetchHeaders, cache: 'no-store' }
      );
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok || payload.success === false) {
        if (response.status === 404) {
          setCampaignNotFound(true);
          return;
        }
        throw new Error(
          typeof payload.error === 'string' ? payload.error : 'Failed to load campaign.'
        );
      }
      const loaded = payload.campaign as AdAccountHierarchyCampaign | undefined;
      if (!loaded) {
        setCampaignNotFound(true);
        return;
      }
      setCampaign(loaded);
      if (payload.accountMismatch && typeof payload.actualAccountId === 'string') {
        setAccountMismatch({ actualAccountId: payload.actualAccountId as string });
      }
    } catch (err) {
      setCampaignError(err instanceof Error ? err.message : 'Failed to load campaign.');
    } finally {
      setIsCampaignLoading(false);
    }
  }, [apiBase, campaignId, fetchHeaders]);

  const fetchAdSets = useCallback(async () => {
    if (!apiBase || !campaignId) return;
    setIsAdSetsLoading(true);
    setAdSetsError(null);
    try {
      const response = await fetch(
        `${apiBase}/campaigns/${encodeURIComponent(campaignId)}/adsets`,
        { headers: fetchHeaders, cache: 'no-store' }
      );
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok || payload.success === false) {
        throw new Error(
          typeof payload.error === 'string' ? payload.error : 'Failed to load ad sets.'
        );
      }
      if (payload.rateLimited) {
        setRateLimited({ section: 'adsets', retryAfterMs: Number(payload.retryAfterMs) || 10000 });
        setTimeout(() => { setRateLimited(null); void fetchAdSets(); }, Number(payload.retryAfterMs) || 10000);
      } else {
        setRateLimited((prev) => prev?.section === 'adsets' ? null : prev);
      }
      const loadedAdSets = Array.isArray(payload.adSets)
        ? (payload.adSets as AdAccountHierarchyAdSet[])
        : [];
      setAdSets(loadedAdSets);

      const preferredFromQuery = searchParams.get('adSetId');
      const initialSelected =
        (preferredFromQuery &&
          loadedAdSets.find((adSet) => adSet.id === preferredFromQuery)?.id) ||
        loadedAdSets[0]?.id ||
        null;
      setSelectedAdSetId(initialSelected);
    } catch (err) {
      setAdSetsError(err instanceof Error ? err.message : 'Failed to load ad sets.');
    } finally {
      setIsAdSetsLoading(false);
    }
  }, [apiBase, campaignId, fetchHeaders, searchParams]);

  useEffect(() => {
    if (!tenantId || !businessId || !actId || !campaignId) return;
    void fetchCampaign();
    void fetchAdSets();
  }, [tenantId, businessId, actId, campaignId, fetchCampaign, fetchAdSets]);

  const fetchAds = useCallback(async () => {
    if (!selectedAdSetId || !apiBase) {
      setAds([]);
      return;
    }
    setIsAdsLoading(true);
    setAdsError(null);
    try {
      const response = await fetch(
        `${apiBase}/adsets/${encodeURIComponent(selectedAdSetId)}/ads`,
        { headers: fetchHeaders, cache: 'no-store' }
      );
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok || payload.success === false) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Failed to load ads.');
      }
      if (payload.rateLimited) {
        setRateLimited({ section: 'ads', retryAfterMs: Number(payload.retryAfterMs) || 10000 });
        setTimeout(() => { setRateLimited(null); void fetchAds(); }, Number(payload.retryAfterMs) || 10000);
      } else {
        setRateLimited((prev) => prev?.section === 'ads' ? null : prev);
      }
      setAds(Array.isArray(payload.ads) ? (payload.ads as AdAccountHierarchyAd[]) : []);
    } catch (err) {
      setAdsError(err instanceof Error ? err.message : 'Failed to load ads.');
      setAds([]);
    } finally {
      setIsAdsLoading(false);
    }
  }, [apiBase, selectedAdSetId, fetchHeaders]);

  useEffect(() => {
    void fetchAds();
  }, [fetchAds]);

  const totalAdsCount = useMemo(() => adSets.reduce((sum, adSet) => sum + (adSet.ads?.length || 0), 0), [adSets]);
  const selectedAdSet = adSets.find((entry) => entry.id === selectedAdSetId) || null;

  if (!tenantId || !businessId || !actId || !campaignId) {
    return <main className="p-6 text-rose-600">Missing route params.</main>;
  }

  const backHref = `/tenants/${tenantId}/businesses/${encodeURIComponent(businessId)}/ad-accounts/${encodeURIComponent(actId)}`;

  return (
    <main className="space-y-4 p-6">
      {/* Header -- always shown */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{campaign?.name || 'Campaign detail'}</h2>
          <p className="text-sm text-slate-600">
            Account <span className="font-mono">{actId}</span> / Campaign <span className="font-mono">{campaignId}</span>
          </p>
        </div>
        <Link
          href={backHref}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Back to Ad Account
        </Link>
      </div>

      {/* Account mismatch banner */}
      {accountMismatch ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">Account mismatch</p>
          <p className="mt-1 text-sm text-amber-700">
            This campaign belongs to account{' '}
            <span className="font-mono">{accountMismatch.actualAccountId}</span>, not{' '}
            <span className="font-mono">{actId}</span>.
          </p>
          <Link
            href={backHref.replace(encodeURIComponent(actId), encodeURIComponent(accountMismatch.actualAccountId))}
            className="mt-2 inline-block rounded-md bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700"
          >
            Switch to correct account
          </Link>
        </div>
      ) : null}

      {/* Campaign loading / error / not found */}
      {isCampaignLoading ? <p className="text-sm text-slate-600">Loading campaign...</p> : null}

      {!isCampaignLoading && campaignNotFound ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
          <p className="text-sm text-slate-600">Campaign not found. It may have been deleted or you may not have access.</p>
        </div>
      ) : null}

      {!isCampaignLoading && campaignError ? (
        <ErrorCard
          title="Couldn&rsquo;t load campaign"
          body="There was a problem fetching campaign details from Facebook."
          details={campaignError}
          onRetry={fetchCampaign}
        />
      ) : null}

      {rateLimited ? (
        <RateLimitBanner
          retryAfterMs={rateLimited.retryAfterMs}
          onRetryNow={() => {
            setRateLimited(null);
            if (rateLimited.section === 'adsets') void fetchAdSets();
            else if (rateLimited.section === 'ads') void fetchAds();
            else { void fetchCampaign(); void fetchAdSets(); }
          }}
          adAccountId={actId}
        />
      ) : null}

      {/* Campaign content */}
      {!isCampaignLoading && campaign ? (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap gap-2">
              <MetricBadge label="Spend" metric="spend" value={campaign.performance.spend} />
              <MetricBadge label="Impr" metric="impressions" value={campaign.performance.impressions} />
              <MetricBadge label="Clicks" metric="clicks" value={campaign.performance.clicks} />
              <MetricBadge label="CTR" metric="ctr" value={campaign.performance.ctr} />
              <MetricBadge label="CPC" metric="cpc" value={campaign.performance.cpc} />
              <MetricBadge label="Leads" metric="conversions" value={campaign.performance.conversions} />
            </div>
            <div className="mt-3">
              <TargetingSummary summary={campaign.targetingSummary} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <InfoCard label="Objective" value={campaign.objective || 'Not set'} />
              <InfoCard label="Status" value={campaign.status} />
              <InfoCard label="Ad Sets" value={String(adSets.length)} />
              <InfoCard label="Ads" value={String(totalAdsCount)} />
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
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <KpiCard label="Spend" value={`$${campaign.performance.spend.toFixed(2)}`} />
                  <KpiCard label="CTR" value={`${campaign.performance.ctr.toFixed(2)}%`} />
                  <KpiCard label="Clicks" value={String(Math.round(campaign.performance.clicks))} />
                  <KpiCard label="Leads" value={String(Math.round(campaign.performance.conversions))} />
                  <KpiCard label="CPA" value={campaign.performance.conversions > 0 ? `$${(campaign.performance.spend / campaign.performance.conversions).toFixed(2)}` : '-'} />
                </div>
                <RealTargetingSummary adSets={adSets} fallbackSummary={campaign.targetingSummary} />
              </div>
            ) : null}

            {tab === 'adsets' ? (
              <div className="space-y-3">
                {isAdSetsLoading ? <p className="text-sm text-slate-600">Loading ad sets...</p> : null}
                {!isAdSetsLoading && adSetsError ? (
                  <ErrorCard
                    title="Couldn&rsquo;t load ad sets"
                    body="There was a problem fetching ad sets from Facebook."
                    details={adSetsError}
                    onRetry={fetchAdSets}
                  />
                ) : null}
                {!isAdSetsLoading && !adSetsError && adSets.length === 0 ? (
                  <p className="text-sm text-slate-600">No ad sets yet for this campaign.</p>
                ) : null}
                {!isAdSetsLoading && !adSetsError && adSets.length > 0
                  ? adSets.map((adSet) => (
                      <div key={adSet.id}>
                        <button
                          type="button"
                          className={`block w-full text-left rounded-md ${
                            selectedAdSetId === adSet.id ? 'ring-2 ring-blue-500' : ''
                          }`}
                          onClick={() => setSelectedAdSetId(selectedAdSetId === adSet.id ? null : adSet.id)}
                        >
                          <AdSetRow adSet={adSet} />
                        </button>
                        {selectedAdSetId === adSet.id && (
                          <div className="ml-4 mt-2 mb-2 rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
                            <div className="flex flex-wrap gap-3 text-xs text-slate-700">
                              <span><strong>Budget:</strong> {adSet.budget.daily ? `$${(adSet.budget.daily / 100).toFixed(2)}/day` : adSet.budget.lifetime ? `$${(adSet.budget.lifetime / 100).toFixed(2)} lifetime` : 'Not set'}</span>
                              <span><strong>Status:</strong> {adSet.status}</span>
                              <span><strong>Optimization:</strong> {adSet.optimizationGoal || 'Not set'}</span>
                            </div>
                            {adSet.targeting && (adSet.targeting.countries?.length > 0 || adSet.targeting.ageMin != null || adSet.targeting.ageMax != null || (adSet.targeting.gender && adSet.targeting.gender !== 'all')) && (
                              <div className="text-xs text-slate-600">
                                <strong>Targeting:</strong>{' '}
                                {[
                                  adSet.targeting.countries?.length > 0 ? adSet.targeting.countries.join(', ') : null,
                                  adSet.targeting.ageMin != null || adSet.targeting.ageMax != null
                                    ? `${adSet.targeting.ageMin ?? '?'}-${adSet.targeting.ageMax ?? '?'}`
                                    : null,
                                  adSet.targeting.gender && adSet.targeting.gender !== 'all'
                                    ? (adSet.targeting.gender === 'male' ? 'Men' : 'Women')
                                    : null,
                                  adSet.targetingSummary && !adSet.targetingSummary.includes('All countries')
                                    ? null
                                    : null,
                                ].filter(Boolean).join(' · ') || 'No targeting data'}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-2">
                              <MetricBadge label="Spend" metric="spend" value={adSet.performance.spend} />
                              <MetricBadge label="CTR" metric="ctr" value={adSet.performance.ctr} />
                              <MetricBadge label="Clicks" metric="clicks" value={adSet.performance.clicks} />
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  : null}
              </div>
            ) : null}

            {tab === 'ads' ? (
              <div className="space-y-3">
                {adSets.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label htmlFor="adset-select" className="text-xs font-medium text-slate-600">Ad Set:</label>
                    <select
                      id="adset-select"
                      value={selectedAdSetId || ''}
                      onChange={(e) => setSelectedAdSetId(e.target.value || null)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {adSets.map((adSet) => (
                        <option key={adSet.id} value={adSet.id}>
                          {adSet.name} ({adSet.status})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {isAdsLoading ? <p className="text-sm text-slate-600">Loading ads...</p> : null}
                {!isAdsLoading && adsError ? (
                  <ErrorCard
                    title="Couldn&rsquo;t load ads"
                    body="There was a problem fetching ads from Facebook."
                    details={adsError}
                    onRetry={fetchAds}
                  />
                ) : null}
                {!isAdsLoading && !adsError && ads.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    {selectedAdSet ? 'No ads yet for the selected ad set.' : 'Select an ad set to view its ads.'}
                  </p>
                ) : null}
                {!isAdsLoading && !adsError
                  ? ads.map((ad) => (
                      <div key={ad.id} className="rounded-md border border-slate-200 bg-white p-2">
                        <AdRow ad={ad} />
                        {ad.creative.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={ad.creative.imageUrl}
                            alt={ad.creative.title || ad.name}
                            className="mt-2 h-28 w-full rounded object-cover"
                          />
                        ) : null}
                        {!ad.creative.imageUrl && ad.creative.videoUrl ? (
                          <video src={ad.creative.videoUrl} className="mt-2 h-28 w-full rounded object-cover" controls />
                        ) : null}
                      </div>
                    ))
                  : null}
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

/* ------------------------------------------------------------------ */
/*  Local helper components                                           */
/* ------------------------------------------------------------------ */

function ErrorCard({
  title,
  body,
  details,
  onRetry,
}: {
  title: string;
  body: string;
  details?: string;
  onRetry?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
      <p className="text-sm font-medium text-rose-800" dangerouslySetInnerHTML={{ __html: title }} />
      <p className="mt-1 text-sm text-rose-700">{body}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-md bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-700"
        >
          Retry
        </button>
      ) : null}
      {details ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="text-xs text-rose-600 underline"
          >
            {expanded ? 'Hide technical details' : 'Show technical details'}
          </button>
          {expanded ? (
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-rose-100 p-2 text-xs text-rose-900">
              {details}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
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

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function RateLimitBanner({
  retryAfterMs,
  onRetryNow,
  adAccountId,
}: {
  retryAfterMs: number;
  onRetryNow: () => void;
  adAccountId: string;
}) {
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(retryAfterMs / 1000));
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  useEffect(() => {
    if (secondsLeft <= 0) onRetryNow();
  }, [secondsLeft, onRetryNow]);

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-amber-800">
            Meta rate limit reached. Retrying in ~{secondsLeft}s...
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Showing cached data while waiting. This is normal for accounts with heavy API usage.
          </p>
        </div>
        <div className="flex items-center gap-2 ml-3">
          <button
            type="button"
            onClick={onRetryNow}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700"
          >
            Retry now
          </button>
          <a
            href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${adAccountId.replace('act_', '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-amber-300 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100"
          >
            Open in Meta
          </a>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className="mt-2 text-xs text-amber-600 underline"
      >
        {showDetails ? 'Hide technical details' : 'Show technical details'}
      </button>
      {showDetails && (
        <pre className="mt-1 rounded bg-amber-100 p-2 text-xs text-amber-900">
          Rate limit error (code=17, subcode=2446079){'\n'}
          Ad account: {adAccountId}{'\n'}
          Retry after: {retryAfterMs}ms
        </pre>
      )}
    </div>
  );
}

function RealTargetingSummary({
  adSets,
  fallbackSummary,
}: {
  adSets: AdAccountHierarchyAdSet[];
  fallbackSummary: string;
}) {
  if (adSets.length === 0) {
    if (fallbackSummary && !fallbackSummary.includes('All countries') && !fallbackSummary.includes('All genders')) {
      return <p className="text-sm text-slate-600">{fallbackSummary}</p>;
    }
    return <p className="text-sm text-slate-500 italic">No targeting data available yet.</p>;
  }

  const allCountries = new Set<string>();
  let minAge = 65;
  let maxAge = 13;
  const genders = new Set<string>();
  const locales = new Set<string>();

  for (const adSet of adSets) {
    const t = adSet.targeting;
    if (!t) continue;
    if (t.countries) t.countries.forEach((c) => allCountries.add(c));
    if (t.ageMin != null && t.ageMin < minAge) minAge = t.ageMin;
    if (t.ageMax != null && t.ageMax > maxAge) maxAge = t.ageMax;
    if (t.gender) genders.add(t.gender);
  }

  const parts: string[] = [];
  if (allCountries.size > 0) parts.push(Array.from(allCountries).join(', '));
  if (minAge <= maxAge) parts.push(`${minAge}-${maxAge}`);
  if (genders.size > 0) {
    const g = Array.from(genders);
    if (g.length === 1 && g[0] !== 'all') parts.push(g[0] === 'male' ? 'Men' : 'Women');
    else parts.push('All genders');
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Targeting (from ad sets)</p>
      <p className="text-sm text-slate-800">
        {parts.length > 0 ? parts.join(' · ') : 'No targeting constraints'}
      </p>
    </div>
  );
}
