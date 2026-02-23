'use client';

import { useEffect, useState } from 'react';

type AdminTenant = {
  id: string;
  name: string;
  createdAt: string;
  members: Array<{
    userId: string;
    email: string;
    platformRole: string;
    tenantRole: string;
    joinedAt: string;
  }>;
  assets: Array<{
    id: string;
    adAccountId: string;
    createdAt: string;
  }>;
  dsaMappings: Array<{
    adAccountId: string;
    dsaBeneficiary: string | null;
    dsaPayor: string | null;
    dsaSource: string;
    dsaUpdatedAt: string;
  }>;
  businesses: Array<{
    businessId: string;
    label: string | null;
    lastSyncAt: string | null;
    counts: {
      adAccounts: number;
      pages: number;
    };
  }>;
};

type AuditEntry = {
  id: string;
  tenantId: string;
  tenantName: string;
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  assetId?: string | null;
  summary: string;
  result: string;
  timestamp: string;
};

export default function AdminPage() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const [tenantRes, logRes] = await Promise.all([
          fetch('/api/admin/tenants'),
          fetch('/api/admin/audit-logs?limit=150'),
        ]);

        const tenantData = await tenantRes.json();
        const logData = await logRes.json();

        if (!tenantRes.ok) {
          throw new Error(tenantData.error || 'Failed to load tenants.');
        }
        if (!logRes.ok) {
          throw new Error(logData.error || 'Failed to load audit logs.');
        }

        setTenants(tenantData.tenants || []);
        setLogs(logData.logs || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load admin dashboard.');
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Console</h1>
          <p className="text-sm text-gray-600">
            Cross-tenant visibility for members, assigned ad accounts, and mutation audit logs.
          </p>
        </div>

        {isLoading ? <p className="text-gray-600">Loading admin data...</p> : null}
        {error ? <p className="text-red-600">{error}</p> : null}

        {!isLoading && !error ? (
          <>
            <section className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Tenants</h2>
              <div className="space-y-4">
                {tenants.map((tenant) => (
                  <div key={tenant.id} className="border border-gray-200 rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-gray-900">{tenant.name}</h3>
                        <p className="text-xs text-gray-500">{tenant.id}</p>
                      </div>
                      <div className="text-xs text-gray-600">
                        members: {tenant.members.length} | assets: {tenant.assets.length}
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-700">
                      <p className="font-medium">Members</p>
                      {tenant.members.map((member) => (
                        <p key={`${tenant.id}-${member.userId}`}>
                          {member.email} ({member.tenantRole}, platform: {member.platformRole})
                        </p>
                      ))}
                    </div>
                    <div className="mt-2 text-sm text-gray-700">
                      <p className="font-medium">Business Portfolios</p>
                      {tenant.businesses.length === 0 ? (
                        <p className="text-gray-500">No BPs configured.</p>
                      ) : (
                        tenant.businesses.map((business) => (
                          <p key={`${tenant.id}-${business.businessId}`}>
                            {business.label || business.businessId} ({business.businessId}) | last sync:{' '}
                            {business.lastSyncAt ? new Date(business.lastSyncAt).toLocaleString() : 'never'} |
                            ad accounts: {business.counts.adAccounts} | pages: {business.counts.pages} |{' '}
                            <a
                              href={`/tenants/${tenant.id}/businesses/${encodeURIComponent(business.businessId)}`}
                              className="text-facebook-600 hover:text-facebook-700"
                            >
                              Open BP
                            </a>
                          </p>
                        ))
                      )}
                    </div>
                    <div className="mt-2 text-sm text-gray-700">
                      <p className="font-medium">Ad Accounts</p>
                      {tenant.assets.map((asset) => (
                        <p key={asset.id}>{asset.adAccountId}</p>
                      ))}
                    </div>
                    <div className="mt-2 text-sm text-gray-700">
                      <p className="font-medium">DSA Mappings (Read-only)</p>
                      {tenant.dsaMappings.length === 0 ? (
                        <p className="text-gray-500">No DSA rows yet.</p>
                      ) : (
                        tenant.dsaMappings.map((mapping) => (
                          <p key={`${tenant.id}-${mapping.adAccountId}`}>
                            {mapping.adAccountId}: beneficiary={mapping.dsaBeneficiary || '-'} |
                            payor={mapping.dsaPayor || '-'} | source={mapping.dsaSource}
                          </p>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Audit Logs</h2>
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="border border-gray-100 rounded-md p-2 text-sm">
                    <p className="font-medium text-gray-900">
                      [{log.result}] {log.action} - {log.tenantName}
                    </p>
                    <p className="text-gray-700">{log.summary}</p>
                    <p className="text-xs text-gray-500">
                      user: {log.userEmail || 'unknown'} | asset: {log.assetId || '-'} |{' '}
                      {new Date(log.timestamp).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
