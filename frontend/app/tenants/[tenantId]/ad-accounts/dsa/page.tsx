'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

type AdAccountDsaRow = {
  id: string;
  adAccountId: string;
  createdAt: string;
  dsaBeneficiary: string | null;
  dsaPayor: string | null;
  dsaSource: string | null;
  dsaUpdatedAt: string | null;
  defaultPageId: string | null;
};

type TenantPageRow = {
  id: string;
  name: string;
  source: string;
  confirmed: boolean;
};

export default function TenantDsaSettingsPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params.tenantId;
  const [rows, setRows] = useState<AdAccountDsaRow[]>([]);
  const [pages, setPages] = useState<TenantPageRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<AdAccountDsaRow | null>(null);
  const [beneficiaryInput, setBeneficiaryInput] = useState('');
  const [payorInput, setPayorInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [autofillingId, setAutofillingId] = useState<string | null>(null);
  const [syncingAssets, setSyncingAssets] = useState(false);
  const [defaultPageUpdatingFor, setDefaultPageUpdatingFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [adAccountsResponse, pagesResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/ad-accounts`, {
          headers: {
            'x-tenant-id': tenantId,
          },
        }),
        fetch(`/api/tenants/${tenantId}/pages`, {
          headers: {
            'x-tenant-id': tenantId,
          },
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

      setRows(adAccountsPayload.adAccounts || []);
      setPages(pagesPayload.pages || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load DSA settings.');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const hasRows = useMemo(() => rows.length > 0, [rows]);

  async function handleAutofill(adAccountId: string): Promise<void> {
    setAutofillingId(adAccountId);
    setError(null);
    try {
      const response = await fetch(
        `/api/tenants/${tenantId}/ad-accounts/${encodeURIComponent(adAccountId)}/dsa/autofill`,
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
        throw new Error(payload.error || payload.message || 'Autofill failed.');
      }
      await load();
    } catch (autofillError) {
      setError(autofillError instanceof Error ? autofillError.message : 'Autofill failed.');
    } finally {
      setAutofillingId(null);
    }
  }

  async function handleSyncAssets(): Promise<void> {
    setSyncingAssets(true);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/sync-assets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
        },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to sync tenant assets.');
      }
      await load();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Failed to sync tenant assets.');
    } finally {
      setSyncingAssets(false);
    }
  }

  async function handleDefaultPageChange(adAccountId: string, pageId: string): Promise<void> {
    setDefaultPageUpdatingFor(adAccountId);
    setError(null);
    try {
      const response = await fetch(
        `/api/tenants/${tenantId}/ad-accounts/${encodeURIComponent(adAccountId)}/default-page`,
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
        throw new Error(payload.error || 'Failed to update default page.');
      }
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update default page.');
    } finally {
      setDefaultPageUpdatingFor(null);
    }
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editingRow) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/tenants/${tenantId}/ad-accounts/${encodeURIComponent(editingRow.adAccountId)}/dsa`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': tenantId,
          },
          body: JSON.stringify({
            dsaBeneficiary: beneficiaryInput,
            dsaPayor: payorInput,
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save DSA settings.');
      }
      setEditingRow(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save DSA settings.');
    } finally {
      setSaving(false);
    }
  }

  function openEditModal(row: AdAccountDsaRow): void {
    setEditingRow(row);
    setBeneficiaryInput(row.dsaBeneficiary || '');
    setPayorInput(row.dsaPayor || '');
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenant DSA Settings</h1>
          <p className="text-sm text-gray-600">
            Manage default Page + DSA beneficiary/payor per ad account.
          </p>
          {tenantId ? <p className="text-xs text-gray-500 mt-1">Tenant: {tenantId}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-2 text-sm border rounded border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-60"
            onClick={handleSyncAssets}
            disabled={syncingAssets}
          >
            {syncingAssets ? 'Syncing assets...' : 'Sync Tenant Assets'}
          </button>
          <p className="text-xs text-gray-500">
            Sync discovers tenant ad accounts/pages from Business Manager and fallback sources.
          </p>
        </div>

        {isLoading ? <p className="text-gray-600">Loading ad accounts...</p> : null}
        {error ? <p className="text-red-600">{error}</p> : null}

        {!isLoading && !error ? (
          <section className="bg-white border border-gray-200 rounded-lg p-4 overflow-x-auto">
            {!hasRows ? (
              <p className="text-sm text-gray-600">No ad accounts mapped to this tenant yet.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-200">
                    <th className="py-2 pr-4">Ad Account</th>
                    <th className="py-2 pr-4">Default Page</th>
                    <th className="py-2 pr-4">Beneficiary</th>
                    <th className="py-2 pr-4">Payor</th>
                    <th className="py-2 pr-4">Source</th>
                    <th className="py-2 pr-4">Updated</th>
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100">
                      <td className="py-2 pr-4">{row.adAccountId}</td>
                      <td className="py-2 pr-4 min-w-[260px]">
                        <select
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm disabled:bg-gray-100"
                          value={row.defaultPageId || ''}
                          disabled={defaultPageUpdatingFor === row.adAccountId || pages.length === 0}
                          onChange={(event) => {
                            const pageId = event.target.value;
                            if (pageId) {
                              void handleDefaultPageChange(row.adAccountId, pageId);
                            }
                          }}
                        >
                          <option value="">
                            {pages.length === 0 ? 'No pages available (run sync)' : 'Select default Page'}
                          </option>
                          {pages.map((page) => (
                            <option key={page.id} value={page.id}>
                              {page.name} ({page.id}) {page.confirmed ? '' : '[unverified]'}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-4">{row.dsaBeneficiary || '-'}</td>
                      <td className="py-2 pr-4">{row.dsaPayor || '-'}</td>
                      <td className="py-2 pr-4">{row.dsaSource || '-'}</td>
                      <td className="py-2 pr-4">
                        {row.dsaUpdatedAt ? new Date(row.dsaUpdatedAt).toLocaleString() : '-'}
                      </td>
                      <td className="py-2 pr-4 space-x-2">
                        <button
                          type="button"
                          className="px-2 py-1 text-xs border rounded border-blue-300 text-blue-700 hover:bg-blue-50"
                          disabled={autofillingId === row.adAccountId}
                          onClick={() => handleAutofill(row.adAccountId)}
                        >
                          {autofillingId === row.adAccountId ? 'Autofilling...' : 'Autofill from Meta'}
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 text-xs border rounded border-gray-300 text-gray-700 hover:bg-gray-50"
                          onClick={() => openEditModal(row)}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ) : null}

        {editingRow ? (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
            <form
              className="bg-white rounded-lg border border-gray-200 p-4 w-full max-w-lg space-y-3"
              onSubmit={handleSaveEdit}
            >
              <h2 className="text-lg font-semibold text-gray-900">Edit DSA settings</h2>
              <p className="text-xs text-gray-500">Ad Account: {editingRow.adAccountId}</p>
              <label className="block text-sm">
                <span className="text-gray-700">Beneficiary</span>
                <input
                  className="mt-1 w-full border border-gray-300 rounded px-2 py-1"
                  value={beneficiaryInput}
                  onChange={(event) => setBeneficiaryInput(event.target.value)}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">Payor</span>
                <input
                  className="mt-1 w-full border border-gray-300 rounded px-2 py-1"
                  value={payorInput}
                  onChange={(event) => setPayorInput(event.target.value)}
                  required
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="px-3 py-1 text-sm border border-gray-300 rounded"
                  onClick={() => setEditingRow(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </main>
  );
}
