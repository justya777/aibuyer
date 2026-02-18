import { EnvTokenProvider } from '../fb/core/token-provider.js';
import { TenantRegistry } from '../fb/core/tenant-registry.js';

describe('EnvTokenProvider', () => {
  it('returns direct tenant token mapping', async () => {
    const registry = new TenantRegistry({
      tenantA: {
        allowedAdAccountIds: ['act_1'],
        systemUserTokenRef: 'tenantA',
      },
    });
    const provider = new EnvTokenProvider({ tenantA: 'token-a' }, registry);

    await expect(provider.getToken({ tenantId: 'tenantA' })).resolves.toBe('token-a');
  });

  it('falls back to systemUserTokenRef mapping', async () => {
    const registry = new TenantRegistry({
      tenantA: {
        allowedAdAccountIds: ['act_1'],
        systemUserTokenRef: 'sharedRef',
      },
    });
    const provider = new EnvTokenProvider({ sharedRef: 'shared-token' }, registry);

    await expect(provider.getToken({ tenantId: 'tenantA' })).resolves.toBe('shared-token');
  });

  it('throws when no token can be resolved', async () => {
    const registry = new TenantRegistry({
      tenantA: {
        allowedAdAccountIds: ['act_1'],
        systemUserTokenRef: 'missingRef',
      },
    });
    const provider = new EnvTokenProvider({}, registry);

    await expect(provider.getToken({ tenantId: 'tenantA' })).rejects.toThrow(
      /No token found for tokenRef/
    );
  });
});
