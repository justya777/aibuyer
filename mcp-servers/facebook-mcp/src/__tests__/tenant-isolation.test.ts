import { GraphClient } from '../fb/core/graph-client.js';
import { TenantIsolationError } from '../fb/core/types.js';
import type { TokenProvider } from '../fb/core/token-provider.js';

describe('tenant isolation guardrail', () => {
  it('blocks cross-tenant ad account access before Meta call', async () => {
    const tokenProvider: TokenProvider = {
      getToken: jest.fn(async () => 'global-token'),
    };

    const httpClient = {
      request: jest.fn(),
    };

    const tenantRegistry = {
      assertTenantAccessible: jest.fn(async () => undefined),
      assertAdAccountAllowed: jest.fn(async () => {
        throw new TenantIsolationError('forbidden account');
      }),
    } as any;

    const client = new GraphClient(tokenProvider, {
      apiVersion: 'v23.0',
      retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1, jitterMs: 0 },
      httpClient: httpClient as any,
      tenantRegistry,
    });

    await expect(
      client.request(
        { tenantId: 'tenant-a', userId: 'user-a', adAccountId: 'act_999' },
        { method: 'GET', path: 'act_999/campaigns' }
      )
    ).rejects.toThrow(TenantIsolationError);

    expect(httpClient.request).not.toHaveBeenCalled();
  });
});
