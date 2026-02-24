'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AIActionLog from '@/components/AIActionLog';
import AICommandCenter from '@/components/AICommandCenter';
import MaterialUpload from '@/components/MaterialUpload';
import type { AIAction, FacebookAccount } from '@/lib/shared-types';

type BusinessAdAccount = {
  adAccountId: string;
  name: string;
  status: string | null;
  defaultPageId: string | null;
  dsaBeneficiary: string | null;
  dsaPayor: string | null;
};

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  objective: string;
};

export default function BusinessAdAccountDetailPage() {
  const params = useParams<{ tenantId: string; businessId: string; actId: string }>();
  const tenantId = params.tenantId;
  const businessId = params.businessId;
  const actId = decodeURIComponent(params.actId || '');

  const [adAccount, setAdAccount] = useState<BusinessAdAccount | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [actions, setActions] = useState<AIAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId || !businessId || !actId) return;
    setIsLoading(true);
    setError(null);
    setCampaigns([]);
    try {
      const adAccountsResponse = await fetch(
        `/api/tenants/${tenantId}/businesses/${encodeURIComponent(businessId)}/ad-accounts`,
        {
          headers: { 'x-tenant-id': tenantId },
          cache: 'no-store',
        }
      );
      const adAccountsPayload = await adAccountsResponse.json();
      if (!adAccountsResponse.ok) {
        throw new Error(adAccountsPayload.error || 'Failed to load ad account.');
      }

      const rows: BusinessAdAccount[] = Array.isArray(adAccountsPayload.adAccounts)
        ? adAccountsPayload.adAccounts
        : [];
      const selected =
        rows.find((entry) => entry.adAccountId === actId || decodeURIComponent(entry.adAccountId) === actId) ||
        null;
      setAdAccount(selected);

      const campaignResponse = await fetch(
        `/api/facebook/campaigns?accountId=${encodeURIComponent(actId)}`,
        {
          headers: { 'x-tenant-id': tenantId },
          cache: 'no-store',
        }
      );
      const campaignPayload = await campaignResponse.json();
      if (!campaignResponse.ok) {
        throw new Error(campaignPayload.error || 'Failed to load campaigns from Facebook.');
      }
      setCampaigns(Array.isArray(campaignPayload.campaigns) ? campaignPayload.campaigns : []);
    } catch (loadError) {
      setCampaigns([]);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load ad account detail.');
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

  const aiSelectedAccount: FacebookAccount | null = adAccount
    ? {
        id: adAccount.adAccountId,
        businessId,
        name: adAccount.name,
        status: 'active',
        currency: 'USD',
        timezone: 'UTC',
        lastActivity: new Date(),
        createdAt: new Date(),
        metrics: {
          ctr: 0,
          cpm: 0,
          cpc: 0,
          budget: 0,
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          reach: 0,
          frequency: 0,
        },
        activeCampaigns: campaigns.length,
        totalCampaigns: campaigns.length,
      }
    : null;

  if (!tenantId || !businessId || !actId) {
    return <main className="p-6 text-red-600">Missing tenantId, businessId, or actId in route.</main>;
  }

  return (
    <main className="p-6 space-y-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Ad Account Detail</h2>
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

      {!isLoading && !adAccount ? (
        <p className="text-sm text-gray-600">Ad account not found in this Business Portfolio.</p>
      ) : null}

      {!isLoading && adAccount ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 h-[calc(100vh-220px)]">
          <section className="xl:col-span-2 bg-white border border-gray-200 rounded-lg p-4 overflow-auto space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border border-gray-200 rounded p-3">
                <p className="text-xs text-gray-500">Default Page</p>
                <p className="text-sm font-medium text-gray-900">{adAccount.defaultPageId || 'Not set'}</p>
              </div>
              <div className="border border-gray-200 rounded p-3">
                <p className="text-xs text-gray-500">DSA</p>
                <p className="text-sm font-medium text-gray-900">
                  {adAccount.dsaBeneficiary && adAccount.dsaPayor ? 'Configured' : 'Missing'}
                </p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Campaigns</h3>
              {campaigns.length === 0 ? (
                <p className="text-sm text-gray-600">No campaigns yet for this ad account.</p>
              ) : (
                <div className="space-y-2">
                  {campaigns.map((campaign) => (
                    <div key={campaign.id} className="border border-gray-100 rounded p-2">
                      <p className="text-sm font-medium text-gray-900">{campaign.name}</p>
                      <p className="text-xs text-gray-500">
                        {campaign.id} | {campaign.status} | {campaign.objective}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Materials</h3>
              <MaterialUpload
                adName={adAccount.name || adAccount.adAccountId}
                onUploadSuccess={() => void 0}
                onUploadError={() => void 0}
              />
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-4 overflow-auto flex flex-col gap-4">
            <div className="flex-1 min-h-0">
              <AICommandCenter
                selectedAccount={aiSelectedAccount}
                selectedTenantId={tenantId}
                selectedBusinessId={businessId}
                requiresDefaultPage={!adAccount.defaultPageId}
                onNavigateToDefaultPage={() => {
                  window.location.href = `/tenants/${tenantId}/businesses/${encodeURIComponent(businessId)}`;
                }}
                onNavigateToDsaSettings={(adAccountId) => {
                  window.location.href = `/tenants/${tenantId}/businesses/${encodeURIComponent(
                    businessId
                  )}?openDsaFor=${encodeURIComponent(adAccountId)}`;
                }}
                onActionComplete={(action) => setActions((prev) => [action, ...prev])}
              />
            </div>
            <div className="flex-1 min-h-0 border-t border-gray-200 pt-4 overflow-auto">
              <AIActionLog actions={actions} />
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
