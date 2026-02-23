'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';

type TenantItem = {
  id: string;
  name: string;
};

type BusinessItem = {
  businessId: string;
  label: string | null;
};

type AdAccountItem = {
  adAccountId: string;
  name: string;
};

type PageItem = {
  pageId: string;
  name: string;
};

interface TenantBusinessSidebarProps {
  tenantId: string;
  businessId?: string;
}

export default function TenantBusinessSidebar({ tenantId, businessId }: TenantBusinessSidebarProps) {
  const pathname = usePathname();
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [businesses, setBusinesses] = useState<BusinessItem[]>([]);
  const [adAccounts, setAdAccounts] = useState<AdAccountItem[]>([]);
  const [pages, setPages] = useState<PageItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadTenants(): Promise<void> {
      try {
        const response = await fetch('/api/tenants');
        const payload = await response.json();
        if (cancelled) return;
        const ownTenants = Array.isArray(payload.tenants)
          ? payload.tenants.map((entry: any) => ({ id: entry.id, name: entry.name }))
          : [];
        if (ownTenants.length > 0) {
          setTenants(ownTenants);
          return;
        }

        const adminResponse = await fetch('/api/admin/tenants');
        const adminPayload = await adminResponse.json();
        if (cancelled) return;
        const adminTenants = Array.isArray(adminPayload.tenants)
          ? adminPayload.tenants.map((entry: any) => ({ id: entry.id, name: entry.name }))
          : [];
        setTenants(adminTenants);
      } catch {
        if (!cancelled) {
          setTenants([]);
        }
      }
    }

    void loadTenants();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadBusinesses(): Promise<void> {
      try {
        const response = await fetch(`/api/tenants/${tenantId}/businesses`, {
          headers: { 'x-tenant-id': tenantId },
        });
        const payload = await response.json();
        if (!cancelled) {
          setBusinesses(Array.isArray(payload.businesses) ? payload.businesses : []);
        }
      } catch {
        if (!cancelled) {
          setBusinesses([]);
        }
      }
    }
    void loadBusinesses();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!businessId) {
      setAdAccounts([]);
      setPages([]);
      return;
    }
    const selectedBusinessId = businessId;
    let cancelled = false;

    async function loadAssets(): Promise<void> {
      try {
        const [adAccountsResponse, pagesResponse] = await Promise.all([
          fetch(`/api/tenants/${tenantId}/businesses/${encodeURIComponent(selectedBusinessId)}/ad-accounts`, {
            headers: { 'x-tenant-id': tenantId },
          }),
          fetch(`/api/tenants/${tenantId}/businesses/${encodeURIComponent(selectedBusinessId)}/pages`, {
            headers: { 'x-tenant-id': tenantId },
          }),
        ]);
        const [adAccountsPayload, pagesPayload] = await Promise.all([
          adAccountsResponse.json(),
          pagesResponse.json(),
        ]);
        if (cancelled) return;

        setAdAccounts(
          Array.isArray(adAccountsPayload.adAccounts)
            ? adAccountsPayload.adAccounts.map((entry: any) => ({
                adAccountId: entry.adAccountId,
                name: entry.name || entry.adAccountId,
              }))
            : []
        );
        setPages(
          Array.isArray(pagesPayload.pages)
            ? pagesPayload.pages.map((entry: any) => ({
                pageId: entry.pageId,
                name: entry.name || entry.pageId,
              }))
            : []
        );
      } catch {
        if (!cancelled) {
          setAdAccounts([]);
          setPages([]);
        }
      }
    }

    void loadAssets();
    return () => {
      cancelled = true;
    };
  }, [tenantId, businessId]);

  const tenantRows = useMemo(() => tenants, [tenants]);

  return (
    <aside className="w-72 border-r border-gray-200 bg-white h-full overflow-auto">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900">Tenants</h2>
      </div>

      <div className="p-4 space-y-1 border-b border-gray-200">
        {tenantRows.map((tenant) => (
          <Link
            key={tenant.id}
            href={`/tenants/${tenant.id}/businesses`}
            className={clsx(
              'block rounded px-2 py-1 text-sm',
              tenant.id === tenantId
                ? 'bg-facebook-50 text-facebook-700 font-medium'
                : 'text-gray-700 hover:bg-gray-50'
            )}
          >
            {tenant.name}
          </Link>
        ))}
      </div>

      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Business Portfolios</h3>
          <Link
            href={`/tenants/${tenantId}/businesses`}
            className="text-xs text-facebook-600 hover:text-facebook-700"
          >
            Manage
          </Link>
        </div>
        <div className="space-y-1">
          {businesses.map((business) => (
            <Link
              key={business.businessId}
              href={`/tenants/${tenantId}/businesses/${encodeURIComponent(business.businessId)}`}
              className={clsx(
                'block rounded px-2 py-1 text-sm',
                business.businessId === businessId
                  ? 'bg-facebook-50 text-facebook-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              )}
            >
              {business.label || business.businessId}
            </Link>
          ))}
          {businesses.length === 0 ? <p className="text-xs text-gray-500">No Business Portfolios yet.</p> : null}
        </div>
      </div>

      <div className="p-4 border-b border-gray-200">
        <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase mb-2">Ad Accounts</h3>
        <div className="space-y-1">
          {adAccounts.map((account) => (
            <Link
              key={account.adAccountId}
              href={
                businessId
                  ? `/tenants/${tenantId}/businesses/${encodeURIComponent(businessId)}/ad-accounts/${encodeURIComponent(account.adAccountId)}`
                  : '#'
              }
              className={clsx(
                'block rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-50',
                pathname?.includes(`/ad-accounts/${encodeURIComponent(account.adAccountId)}`) &&
                  'bg-facebook-50 text-facebook-700 font-medium'
              )}
            >
              {account.name}
            </Link>
          ))}
          {adAccounts.length === 0 ? (
            <p className="text-xs text-gray-500">
              {businessId ? 'No ad accounts synced in this BP.' : 'Select a BP first.'}
            </p>
          ) : null}
        </div>
      </div>

      <div className="p-4">
        <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase mb-2">Pages</h3>
        <div className="space-y-1">
          {pages.map((page) => (
            <p key={page.pageId} className="rounded px-2 py-1 text-sm text-gray-700 bg-gray-50">
              {page.name}
            </p>
          ))}
          {pages.length === 0 ? (
            <p className="text-xs text-gray-500">
              {businessId ? 'No pages synced in this BP.' : 'Select a BP first.'}
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
