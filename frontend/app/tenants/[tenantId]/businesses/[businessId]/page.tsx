'use client';

import Link from 'next/link';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

type AdAccountRow = {
  adAccountId: string;
  name: string;
  status: string | null;
  defaultPageId: string | null;
  dsaBeneficiary: string | null;
  dsaPayor: string | null;
  dsaSource: string | null;
  dsaUpdatedAt: string | null;
  dsaConfigured?: boolean;
  dsaStatus?: 'CONFIGURED' | 'MISSING';
};

type PageRow = {
  pageId: string;
  name: string;
  source: 'CONFIRMED_BM' | 'FALLBACK_UNVERIFIED';
  confirmed: boolean;
};

type TabName = 'adAccounts' | 'pages' | 'settings';

type DsaSettingsPayload = {
  adAccountId: string;
  dsaBeneficiary: string | null;
  dsaPayor: string | null;
  dsaSource: string | null;
  dsaUpdatedAt: string | null;
  configured: boolean;
};

export default function BusinessPortfolioDetailPage() {
  const params = useParams<{ tenantId: string; businessId: string }>();
  const searchParams = useSearchParams();
  const tenantId = params.tenantId;
  const businessId = params.businessId;
  const [tab, setTab] = useState<TabName>('adAccounts');
  const [adAccounts, setAdAccounts] = useState<AdAccountRow[]>([]);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [defaultPageUpdatingFor, setDefaultPageUpdatingFor] = useState<string | null>(null);
  const [pageTargetMap, setPageTargetMap] = useState<Record<string, string>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingDsaAccountId, setEditingDsaAccountId] = useState<string | null>(null);
  const [dsaBeneficiaryInput, setDsaBeneficiaryInput] = useState('');
  const [dsaPayorInput, setDsaPayorInput] = useState('');
  const [dsaSource, setDsaSource] = useState<string | null>(null);
  const [dsaUpdatedAt, setDsaUpdatedAt] = useState<string | null>(null);
  const [dsaError, setDsaError] = useState<string | null>(null);
  const [isSavingDsa, setIsSavingDsa] = useState(false);
  const [isAutofillingDsa, setIsAutofillingDsa] = useState(false);
  const [isLoadingDsa, setIsLoadingDsa] = useState(false);
  const [handledOpenDsaAccountId, setHandledOpenDsaAccountId] = useState<string | null>(null);
  const openDsaFor = searchParams.get('openDsaFor');

  const loadData = useCallback(async () => {
    if (!tenantId || !businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [adAccountsResponse, pagesResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/businesses/${encodeURIComponent(businessId)}/ad-accounts`, {
          headers: { 'x-tenant-id': tenantId },
        }),
        fetch(`/api/tenants/${tenantId}/businesses/${encodeURIComponent(businessId)}/pages`, {
          headers: { 'x-tenant-id': tenantId },
        }),
      ]);
      const [adAccountsPayload, pagesPayload] = await Promise.all([
        adAccountsResponse.json(),
        pagesResponse.json(),
      ]);
      if (!adAccountsResponse.ok) {
        throw new Error(adAccountsPayload.error || 'Failed to load ad accounts.');
      }
      if (!pagesResponse.ok) {
        throw new Error(pagesPayload.error || 'Failed to load pages.');
      }
      setAdAccounts(Array.isArray(adAccountsPayload.adAccounts) ? adAccountsPayload.adAccounts : []);
      setPages(Array.isArray(pagesPayload.pages) ? pagesPayload.pages : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load business data.');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, businessId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (tenantId && businessId) {
      window.localStorage.setItem(`selectedBusinessId:${tenantId}`, businessId);
    }
  }, [tenantId, businessId]);

  useEffect(() => {
    if (!openDsaFor || isLoading) return;
    if (handledOpenDsaAccountId === openDsaFor) return;
    const matchingAccount = adAccounts.find(
      (account) => account.adAccountId === openDsaFor || decodeURIComponent(account.adAccountId) === openDsaFor
    );
    if (!matchingAccount) {
      return;
    }
    setHandledOpenDsaAccountId(openDsaFor);
    void openFixDsaModal(matchingAccount.adAccountId);
  }, [openDsaFor, isLoading, handledOpenDsaAccountId, adAccounts, openFixDsaModal]);

  const fallbackOnlyPages = useMemo(
    () => pages.length > 0 && pages.every((page) => page.source === 'FALLBACK_UNVERIFIED'),
    [pages]
  );
  const editingDsaAccount = useMemo(
    () => adAccounts.find((account) => account.adAccountId === editingDsaAccountId) || null,
    [adAccounts, editingDsaAccountId]
  );

  async function handleSetDefaultPage(adAccountId: string, pageId: string): Promise<void> {
    if (!tenantId || !businessId || !pageId) return;
    setDefaultPageUpdatingFor(adAccountId);
    setError(null);
    try {
      const response = await fetch(
        `/api/tenants/${tenantId}/businesses/${encodeURIComponent(
          businessId
        )}/ad-accounts/${encodeURIComponent(adAccountId)}/default-page`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': tenantId,
          },
          body: JSON.stringify({ pageId }),
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to set default page.');
      }
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to set default page.');
    } finally {
      setDefaultPageUpdatingFor(null);
    }
  }

  async function handleSyncAssets(): Promise<void> {
    if (!tenantId || !businessId) return;
    setIsSyncing(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/tenants/${tenantId}/businesses/${encodeURIComponent(businessId)}/sync-assets`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': tenantId,
          },
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to sync business assets.');
      }
      await loadData();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Failed to sync business assets.');
    } finally {
      setIsSyncing(false);
    }
  }

  function setModalFromSettings(settings: DsaSettingsPayload): void {
    setDsaBeneficiaryInput(settings.dsaBeneficiary || '');
    setDsaPayorInput(settings.dsaPayor || '');
    setDsaSource(settings.dsaSource);
    setDsaUpdatedAt(settings.dsaUpdatedAt);
  }

  async function fetchDsaSettings(adAccountId: string): Promise<DsaSettingsPayload> {
    const response = await fetch(
      `/api/tenants/${tenantId}/ad-accounts/${encodeURIComponent(adAccountId)}/dsa`,
      {
        headers: {
          'x-tenant-id': tenantId,
        },
      }
    );
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to load DSA settings.');
    }
    return payload.settings as DsaSettingsPayload;
  }

  async function openFixDsaModal(adAccountId: string): Promise<void> {
    setEditingDsaAccountId(adAccountId);
    setDsaError(null);
    setIsLoadingDsa(true);
    try {
      const settings = await fetchDsaSettings(adAccountId);
      setModalFromSettings(settings);
    } catch (loadError) {
      setDsaError(loadError instanceof Error ? loadError.message : 'Failed to load DSA settings.');
    } finally {
      setIsLoadingDsa(false);
    }
  }

  async function handleSaveDsa(): Promise<void> {
    if (!tenantId || !editingDsaAccountId) return;
    setIsSavingDsa(true);
    setDsaError(null);
    try {
      const response = await fetch(
        `/api/tenants/${tenantId}/ad-accounts/${encodeURIComponent(editingDsaAccountId)}/dsa`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': tenantId,
          },
          body: JSON.stringify({
            dsaBeneficiary: dsaBeneficiaryInput,
            dsaPayor: dsaPayorInput,
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save DSA settings.');
      }
      if (payload.settings) {
        setModalFromSettings(payload.settings as DsaSettingsPayload);
      }
      await loadData();
    } catch (saveError) {
      setDsaError(saveError instanceof Error ? saveError.message : 'Failed to save DSA settings.');
    } finally {
      setIsSavingDsa(false);
    }
  }

  async function handleAutofillDsa(): Promise<void> {
    if (!tenantId || !editingDsaAccountId) return;
    setIsAutofillingDsa(true);
    setDsaError(null);
    try {
      const response = await fetch(
        `/api/tenants/${tenantId}/ad-accounts/${encodeURIComponent(editingDsaAccountId)}/dsa/autofill`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': tenantId,
          },
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to autofill DSA settings.');
      }
      if (payload.settings) {
        setModalFromSettings(payload.settings as DsaSettingsPayload);
      }
      await loadData();
    } catch (autofillError) {
      setDsaError(autofillError instanceof Error ? autofillError.message : 'Failed to autofill DSA settings.');
    } finally {
      setIsAutofillingDsa(false);
    }
  }

  if (!tenantId || !businessId) {
    return <main className="p-6 text-red-600">Missing tenantId or businessId in route.</main>;
  }

  return (
    <main className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Business Portfolio Dashboard</h2>
          <p className="text-sm text-gray-600">
            BP: <span className="font-mono">{businessId}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSyncAssets()}
            disabled={isSyncing}
            className="px-3 py-2 border border-blue-300 text-blue-700 rounded-md text-sm hover:bg-blue-50 disabled:opacity-60"
          >
            {isSyncing ? 'Syncing...' : 'Sync assets'}
          </button>
          <Link
            href={`/tenants/${tenantId}/businesses`}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
          >
            Back to BPs
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`px-3 py-1.5 rounded-md text-sm ${tab === 'adAccounts' ? 'bg-facebook-600 text-white' : 'border border-gray-300 text-gray-700'}`}
          onClick={() => setTab('adAccounts')}
        >
          Ad Accounts
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 rounded-md text-sm ${tab === 'pages' ? 'bg-facebook-600 text-white' : 'border border-gray-300 text-gray-700'}`}
          onClick={() => setTab('pages')}
        >
          Pages
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 rounded-md text-sm ${tab === 'settings' ? 'bg-facebook-600 text-white' : 'border border-gray-300 text-gray-700'}`}
          onClick={() => setTab('settings')}
        >
          Settings
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {fallbackOnlyPages ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
          Only FALLBACK_UNVERIFIED pages are available. Confirm a page by selecting it as default for an ad account.
        </p>
      ) : null}

      {isLoading ? <p className="text-sm text-gray-600">Loading business data...</p> : null}

      {!isLoading && tab === 'adAccounts' ? (
        <section className="bg-white border border-gray-200 rounded-lg p-4 overflow-x-auto">
          {adAccounts.length === 0 ? (
            <p className="text-sm text-gray-600">No ad accounts in this BP. Sync assets first.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200">
                  <th className="py-2 pr-4">Ad Account</th>
                  <th className="py-2 pr-4">Default Page</th>
                  <th className="py-2 pr-4">DSA</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {adAccounts.map((account) => (
                  <tr key={account.adAccountId} className="border-b border-gray-100">
                    <td className="py-2 pr-4">
                      <p className="font-medium text-gray-900">{account.name}</p>
                      <p className="text-xs text-gray-500">{account.adAccountId}</p>
                    </td>
                    <td className="py-2 pr-4 min-w-[260px]">
                      <select
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm disabled:bg-gray-100"
                        value={account.defaultPageId || ''}
                        disabled={defaultPageUpdatingFor === account.adAccountId || pages.length === 0}
                        onChange={(event) => void handleSetDefaultPage(account.adAccountId, event.target.value)}
                      >
                        <option value="">
                          {pages.length === 0 ? 'No pages available (sync first)' : 'Select default Page'}
                        </option>
                        {pages.map((page) => (
                          <option key={page.pageId} value={page.pageId}>
                            {page.name} ({page.pageId}) {page.source === 'FALLBACK_UNVERIFIED' ? '[unverified]' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-4">
                      {account.dsaBeneficiary && account.dsaPayor ? (
                        <div>
                          <span className="text-green-700">Configured</span>
                          <p className="text-xs text-gray-500">{account.dsaSource || 'MANUAL'}</p>
                        </div>
                      ) : (
                        <span className="text-amber-700">Missing</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 space-x-2">
                      <button
                        type="button"
                        className="px-2 py-1 border border-blue-300 rounded text-blue-700 hover:bg-blue-50"
                        onClick={() => void openFixDsaModal(account.adAccountId)}
                      >
                        {account.dsaBeneficiary && account.dsaPayor ? 'Edit DSA' : 'Fix DSA'}
                      </button>
                      <Link
                        href={`/tenants/${tenantId}/businesses/${encodeURIComponent(
                          businessId
                        )}/ad-accounts/${encodeURIComponent(account.adAccountId)}`}
                        className="px-2 py-1 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {!isLoading && tab === 'pages' ? (
        <section className="bg-white border border-gray-200 rounded-lg p-4 overflow-x-auto">
          {pages.length === 0 ? (
            <p className="text-sm text-gray-600">No pages in this BP. Sync assets first.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200">
                  <th className="py-2 pr-4">Page</th>
                  <th className="py-2 pr-4">Source</th>
                  <th className="py-2 pr-4">Set as Default</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr key={page.pageId} className="border-b border-gray-100">
                    <td className="py-2 pr-4">
                      <p className="font-medium text-gray-900">{page.name}</p>
                      <p className="text-xs text-gray-500">{page.pageId}</p>
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex px-2 py-1 rounded text-xs ${
                          page.source === 'CONFIRMED_BM'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {page.source}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <select
                          className="border border-gray-300 rounded px-2 py-1 text-sm"
                          value={pageTargetMap[page.pageId] || ''}
                          onChange={(event) =>
                            setPageTargetMap((prev) => ({ ...prev, [page.pageId]: event.target.value }))
                          }
                        >
                          <option value="">Choose Ad Account</option>
                          {adAccounts.map((account) => (
                            <option key={account.adAccountId} value={account.adAccountId}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="px-2 py-1 border border-blue-300 text-blue-700 rounded hover:bg-blue-50 disabled:opacity-60"
                          disabled={!pageTargetMap[page.pageId]}
                          onClick={() =>
                            void handleSetDefaultPage(pageTargetMap[page.pageId], page.pageId)
                          }
                        >
                          Set Default
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {!isLoading && tab === 'settings' ? (
        <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="text-lg font-semibold text-gray-900">Business Settings</h3>
          <p className="text-sm text-gray-700">
            Token reference uses tenant-scoped MCP credentials with BP context <code>{businessId}</code>.
          </p>
          <div className="text-sm text-gray-700">
            <p>Isolation summary</p>
            <ul className="list-disc list-inside text-xs text-gray-600">
              <li>Ad account and page lists are filtered by tenant + BP.</li>
              <li>Default page actions are restricted to pages in this BP.</li>
              <li>Fallback pages are confirmed when selected as a default.</li>
            </ul>
          </div>
        </section>
      ) : null}

      {editingDsaAccount ? (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4 w-full max-w-lg space-y-3">
            <h3 className="text-lg font-semibold text-gray-900">Fix DSA Settings</h3>
            <p className="text-xs text-gray-500">Ad Account: {editingDsaAccount.adAccountId}</p>
            {dsaError ? <p className="text-sm text-red-600">{dsaError}</p> : null}
            {isLoadingDsa ? <p className="text-sm text-gray-600">Loading current DSA settings...</p> : null}

            {!isLoadingDsa ? (
              <>
                <div className="rounded border border-gray-200 p-2 text-xs text-gray-600">
                  <p>Source: {dsaSource || 'Not configured'}</p>
                  <p>Updated: {dsaUpdatedAt ? new Date(dsaUpdatedAt).toLocaleString() : 'Never'}</p>
                </div>
                <button
                  type="button"
                  className="px-2 py-1 text-xs border rounded border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                  disabled={isAutofillingDsa || isSavingDsa}
                  onClick={() => void handleAutofillDsa()}
                >
                  {isAutofillingDsa ? 'Autofilling...' : 'Autofill from Meta'}
                </button>
                <label className="block text-sm">
                  <span className="text-gray-700">Beneficiary</span>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded px-2 py-1"
                    value={dsaBeneficiaryInput}
                    onChange={(event) => setDsaBeneficiaryInput(event.target.value)}
                    required
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-700">Payor</span>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded px-2 py-1"
                    value={dsaPayorInput}
                    onChange={(event) => setDsaPayorInput(event.target.value)}
                    required
                  />
                </label>
              </>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="px-3 py-1 text-sm border border-gray-300 rounded"
                disabled={isSavingDsa || isAutofillingDsa}
                onClick={() => {
                  setEditingDsaAccountId(null);
                  setDsaError(null);
                }}
              >
                Close
              </button>
              <button
                type="button"
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded disabled:opacity-60"
                disabled={
                  isLoadingDsa ||
                  isSavingDsa ||
                  isAutofillingDsa ||
                  !dsaBeneficiaryInput.trim() ||
                  !dsaPayorInput.trim()
                }
                onClick={() => void handleSaveDsa()}
              >
                {isSavingDsa ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
