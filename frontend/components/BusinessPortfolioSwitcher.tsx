'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type BusinessSummary = {
  tenantId: string;
  businessId: string;
  label: string | null;
  lastSyncAt: string | null;
};

interface BusinessPortfolioSwitcherProps {
  tenantId: string;
  selectedBusinessId?: string;
}

function getStorageKey(tenantId: string): string {
  return `selectedBusinessId:${tenantId}`;
}

export default function BusinessPortfolioSwitcher({
  tenantId,
  selectedBusinessId,
}: BusinessPortfolioSwitcherProps) {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadBusinesses(): Promise<void> {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/tenants/${tenantId}/businesses`, {
          headers: { 'x-tenant-id': tenantId },
        });
        const payload = await response.json();
        if (cancelled) return;
        if (response.ok && Array.isArray(payload.businesses)) {
          setBusinesses(payload.businesses);
          return;
        }
        setBusinesses([]);
      } catch {
        if (!cancelled) {
          setBusinesses([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadBusinesses();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const currentBusinessId = useMemo(() => {
    if (selectedBusinessId) return selectedBusinessId;
    if (typeof window === 'undefined') return '';
    const stored = window.localStorage.getItem(getStorageKey(tenantId));
    if (stored) return stored;
    return businesses[0]?.businessId || '';
  }, [tenantId, selectedBusinessId, businesses]);

  const currentBusiness = businesses.find((entry) => entry.businessId === currentBusinessId) || null;

  const handleSwitch = (nextBusinessId: string): void => {
    if (!nextBusinessId) return;
    window.localStorage.setItem(getStorageKey(tenantId), nextBusinessId);
    router.push(`/tenants/${tenantId}/businesses/${encodeURIComponent(nextBusinessId)}`);
  };

  return (
    <div className="flex items-center gap-3">
      <div>
        <p className="text-xs text-gray-500">Business Portfolio</p>
        <p className="text-sm font-semibold text-gray-900">
          {currentBusiness?.label || currentBusiness?.businessId || 'Select BP'}
        </p>
        {currentBusiness ? (
          <p className="text-xs text-gray-500">{currentBusiness.businessId}</p>
        ) : null}
      </div>
      <select
        className="border border-gray-300 rounded-md px-2 py-1 text-sm min-w-[220px] disabled:bg-gray-100"
        value={currentBusinessId}
        disabled={isLoading || businesses.length === 0}
        onChange={(event) => handleSwitch(event.target.value)}
      >
        {businesses.length === 0 ? (
          <option value="">{isLoading ? 'Loading BPs...' : 'No Business Portfolios'}</option>
        ) : null}
        {businesses.map((entry) => (
          <option key={entry.businessId} value={entry.businessId}>
            {entry.label || entry.businessId} ({entry.businessId})
          </option>
        ))}
      </select>
    </div>
  );
}
