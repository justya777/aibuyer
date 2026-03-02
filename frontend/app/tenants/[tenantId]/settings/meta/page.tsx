'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type ConnectionStatus = {
  connected: boolean;
  valid?: boolean;
  businessId?: string;
  businessName?: string;
  tokenLast4?: string;
  lastValidatedAt?: string;
  error?: string;
};

export default function MetaConnectionSettingsPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params.tenantId;

  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showConnectForm, setShowConnectForm] = useState(false);
  const [businessIdInput, setBusinessIdInput] = useState('');
  const [systemUserIdInput, setSystemUserIdInput] = useState('');
  const [accessTokenInput, setAccessTokenInput] = useState('');

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/meta/test`, {
        headers: tenantId ? { 'x-tenant-id': tenantId } : {},
      });
      const data = await res.json();
      if (data.success) {
        setStatus(data);
      } else {
        setStatus({ connected: false, error: data.error });
      }
    } catch {
      setStatus({ connected: false, error: 'Failed to check connection status.' });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleConnect = async (e: FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/tenants/${tenantId}/meta/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
        },
        body: JSON.stringify({
          businessId: businessIdInput.trim(),
          systemUserId: systemUserIdInput.trim() || undefined,
          accessToken: accessTokenInput.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Connected to Business ${data.businessId} successfully.` });
        setShowConnectForm(false);
        setAccessTokenInput('');
        await fetchStatus();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to connect.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleTest = async () => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/meta/test`, {
        headers: tenantId ? { 'x-tenant-id': tenantId } : {},
      });
      const data = await res.json();
      if (data.success && data.valid) {
        setMessage({ type: 'success', text: 'Connection is valid.' });
        setStatus(data);
      } else if (data.success && !data.valid) {
        setMessage({ type: 'error', text: 'Token is invalid or expired. Please reconnect.' });
        setStatus(data);
      } else {
        setMessage({ type: 'error', text: data.error || 'Test failed.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!status?.businessId) return;
    if (!confirm('Disconnect this Meta Business Portfolio? Graph API calls will stop working.')) return;

    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/meta/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
        },
        body: JSON.stringify({ businessId: status.businessId }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Disconnected successfully.' });
        await fetchStatus();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to disconnect.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error.' });
    } finally {
      setActionLoading(false);
    }
  };

  if (!tenantId) {
    return <div className="p-6 text-red-600">Missing tenantId.</div>;
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Meta Connection</h2>
      <p className="text-sm text-gray-500 mb-6">
        Connect your Meta Business Portfolio system user token to enable Graph API access for ad management and asset sync.
      </p>

      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded-md text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Checking connection status...</div>
      ) : status?.connected ? (
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                status.valid ? 'bg-green-500' : 'bg-yellow-500'
              }`}
            />
            <span className="text-sm font-medium text-gray-900">
              {status.valid ? 'Connected' : 'Connected (token may be invalid)'}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Business ID</dt>
              <dd className="font-mono text-gray-900">{status.businessId}</dd>
            </div>
            {status.businessName && (
              <div>
                <dt className="text-gray-500">Business Name</dt>
                <dd className="text-gray-900">{status.businessName}</dd>
              </div>
            )}
            <div>
              <dt className="text-gray-500">Token</dt>
              <dd className="font-mono text-gray-900">****{status.tokenLast4}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Last Validated</dt>
              <dd className="text-gray-900">
                {status.lastValidatedAt
                  ? new Date(status.lastValidatedAt).toLocaleString()
                  : 'Never'}
              </dd>
            </div>
          </dl>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowConnectForm(true);
                setBusinessIdInput(status.businessId || '');
              }}
              disabled={actionLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Replace Token
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={actionLoading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Test Connection
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={actionLoading}
              className="px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-sm text-gray-600 mb-4">
            No Meta Business Portfolio is connected. Connect one to enable ad management and asset syncing.
          </p>
          <button
            type="button"
            onClick={() => setShowConnectForm(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Connect Meta Business
          </button>
        </div>
      )}

      {showConnectForm && (
        <form
          onSubmit={handleConnect}
          className="mt-6 bg-white border border-gray-200 rounded-lg p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-gray-900">
            {status?.connected ? 'Replace Token' : 'Connect Meta Business'}
          </h3>

          <div>
            <label htmlFor="businessId" className="block text-sm font-medium text-gray-700 mb-1">
              Business Portfolio ID
            </label>
            <input
              id="businessId"
              type="text"
              required
              value={businessIdInput}
              onChange={(e) => setBusinessIdInput(e.target.value)}
              placeholder="e.g. 123456789"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="systemUserId" className="block text-sm font-medium text-gray-700 mb-1">
              System User ID <span className="text-gray-400">(optional)</span>
            </label>
            <input
              id="systemUserId"
              type="text"
              value={systemUserIdInput}
              onChange={(e) => setSystemUserIdInput(e.target.value)}
              placeholder="e.g. 987654321"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="accessToken" className="block text-sm font-medium text-gray-700 mb-1">
              System User Access Token
            </label>
            <input
              id="accessToken"
              type="password"
              required
              value={accessTokenInput}
              onChange={(e) => setAccessTokenInput(e.target.value)}
              placeholder="Paste your system user token"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              Token is encrypted at rest and never displayed after saving.
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={actionLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {actionLoading ? 'Connecting...' : 'Connect'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowConnectForm(false);
                setAccessTokenInput('');
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
