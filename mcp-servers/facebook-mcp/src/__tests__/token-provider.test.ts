import { EnvTokenProvider } from '../fb/core/token-provider.js';

describe('EnvTokenProvider', () => {
  it('returns the single global token for any tenant', async () => {
    const provider = new EnvTokenProvider('global-token');

    await expect(provider.getToken({ tenantId: 'tenantA' })).resolves.toBe('global-token');
    await expect(provider.getToken({ tenantId: 'tenantB' })).resolves.toBe('global-token');
  });

  it('throws when global token is missing', async () => {
    const provider = new EnvTokenProvider('');
    await expect(provider.getToken({ tenantId: 'tenantA' })).rejects.toThrow(/not configured/i);
  });
});
