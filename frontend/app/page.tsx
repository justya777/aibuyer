'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type TenantItem = {
  id: string;
};

export default function DashboardRedirectPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function resolveHomeRoute(): Promise<void> {
      try {
        const response = await fetch('/api/tenants');
        const payload = await response.json();
        if (cancelled) return;
        const tenants: TenantItem[] = Array.isArray(payload.tenants) ? payload.tenants : [];
        if (tenants.length === 0) {
          router.replace('/login');
          return;
        }
        router.replace(`/tenants/${tenants[0].id}/businesses`);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to resolve tenant workspace.');
        }
      }
    }
    void resolveHomeRoute();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <p className="text-sm text-gray-700">Opening your Business Portfolio workspace...</p>
        {error ? <p className="text-sm text-red-600 mt-2">{error}</p> : null}
      </div>
    </main>
  );
}
