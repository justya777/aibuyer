'use client';

import { useMemo } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import BusinessPortfolioSwitcher from '@/components/BusinessPortfolioSwitcher';
import TenantBusinessSidebar from '@/components/TenantBusinessSidebar';

function parseBusinessId(pathname: string): string | undefined {
  const match = pathname.match(/\/businesses\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export default function TenantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ tenantId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const tenantId = params.tenantId;
  if (!tenantId) {
    return <main className="p-6 text-red-600">Missing tenantId in route.</main>;
  }
  const businessId = useMemo(() => parseBusinessId(pathname || ''), [pathname]);

  return (
    <div className="h-full bg-gray-50 flex">
      <TenantBusinessSidebar tenantId={tenantId} businessId={businessId} />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Meta Business Workspace</h1>
            <p className="text-sm text-gray-600">Tenant: {tenantId}</p>
          </div>
          <div className="flex items-center gap-3">
            <BusinessPortfolioSwitcher tenantId={tenantId} selectedBusinessId={businessId} />
            <button
              type="button"
              onClick={() => router.push(`/tenants/${tenantId}/businesses`)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              All BPs
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
