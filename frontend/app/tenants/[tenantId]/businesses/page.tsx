'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type BusinessSummary = {
  tenantId: string;
  businessId: string;
  label: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  counts: {
    adAccounts: number;
    pages: number;
  };
};

export default function TenantBusinessesPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params.tenantId;
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isSyncingBusinessId, setIsSyncingBusinessId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [businessIdInput, setBusinessIdInput] = useState('');
  const [labelInput, setLabelInput] = useState('');

  const loadBusinesses = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/businesses`, {
        headers: { 'x-tenant-id': tenantId },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load Business Portfolios.');
      }
      setBusinesses(Array.isArray(payload.businesses) ? payload.businesses : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load Business Portfolios.');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadBusinesses();
  }, [loadBusinesses]);

  async function handleAddBusiness(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!tenantId || !businessIdInput.trim()) return;
    setIsAdding(true);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/businesses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify({
          businessId: businessIdInput.trim(),
          label: labelInput.trim() || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to add Business Portfolio.');
      }
      window.localStorage.setItem(`selectedBusinessId:${tenantId}`, payload.business.businessId);
      setBusinessIdInput('');
      setLabelInput('');
      await loadBusinesses();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Failed to add Business Portfolio.');
    } finally {
      setIsAdding(false);
    }
  }

  async function handleSync(businessId: string): Promise<void> {
    if (!tenantId) return;
    setIsSyncingBusinessId(businessId);
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
        throw new Error(payload.error || 'Failed to sync assets.');
      }
      await loadBusinesses();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Failed to sync assets.');
    } finally {
      setIsSyncingBusinessId(null);
    }
  }

  if (!tenantId) {
    return <main className="p-6 text-red-600">Missing tenantId in route.</main>;
  }

  return (
    <main className="p-6 space-y-6">
      <section className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Add Business Portfolio</h2>
        <form className="grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit={handleAddBusiness}>
          <input
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            placeholder="Business ID (required)"
            value={businessIdInput}
            onChange={(event) => setBusinessIdInput(event.target.value)}
            required
          />
          <input
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            placeholder="Label / Name (optional)"
            value={labelInput}
            onChange={(event) => setLabelInput(event.target.value)}
          />
          <button
            type="submit"
            disabled={isAdding}
            className="px-3 py-2 bg-facebook-600 text-white rounded-md text-sm hover:bg-facebook-700 disabled:opacity-60"
          >
            {isAdding ? 'Saving...' : 'Add Business Portfolio'}
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-2">
          After adding a BP, run sync to discover ad accounts and pages automatically.
        </p>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="bg-white border border-gray-200 rounded-lg p-4 overflow-x-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Business Portfolios</h2>
        {isLoading ? <p className="text-sm text-gray-600">Loading Business Portfolios...</p> : null}
        {!isLoading && businesses.length === 0 ? (
          <p className="text-sm text-gray-600">No Business Portfolios yet. Add BP to continue.</p>
        ) : null}
        {!isLoading && businesses.length > 0 ? (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-200">
                <th className="py-2 pr-4">Business</th>
                <th className="py-2 pr-4">Last Sync</th>
                <th className="py-2 pr-4">Ad Accounts</th>
                <th className="py-2 pr-4">Pages</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((business) => (
                <tr key={business.businessId} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <p className="font-medium text-gray-900">{business.label || business.businessId}</p>
                    <p className="text-xs text-gray-500">{business.businessId}</p>
                  </td>
                  <td className="py-2 pr-4">
                    {business.lastSyncAt ? new Date(business.lastSyncAt).toLocaleString() : 'Not synced yet'}
                  </td>
                  <td className="py-2 pr-4">{business.counts.adAccounts}</td>
                  <td className="py-2 pr-4">{business.counts.pages}</td>
                  <td className="py-2 pr-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSync(business.businessId)}
                      disabled={isSyncingBusinessId === business.businessId}
                      className="px-2 py-1 border border-blue-300 text-blue-700 rounded hover:bg-blue-50 disabled:opacity-60"
                    >
                      {isSyncingBusinessId === business.businessId ? 'Syncing...' : 'Sync assets'}
                    </button>
                    <Link
                      href={`/tenants/${tenantId}/businesses/${encodeURIComponent(business.businessId)}`}
                      className="px-2 py-1 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </main>
  );
}
