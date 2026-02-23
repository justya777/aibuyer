import { EnvTokenProvider } from '../fb/core/token-provider.js';

describe('EnvTokenProvider', () => {
  it('returns tenant token when map contains tenant', async () => {
    const provider = new EnvTokenProvider({
      tenantTokenMapRaw: JSON.stringify({
        tenantA: 'token-a',
        tenantB: 'token-b',
      }),
    });

    await expect(provider.getToken({ tenantId: 'tenantA' })).resolves.toBe('token-a');
    await expect(provider.getToken({ tenantId: 'tenantB' })).resolves.toBe('token-b');
  });

  it('falls back to global token when tenant token is missing', async () => {
    const provider = new EnvTokenProvider({
      tenantTokenMapRaw: JSON.stringify({ tenantA: 'token-a' }),
      globalToken: 'global-token',
    });

    await expect(provider.getToken({ tenantId: 'tenantZ' })).resolves.toBe('global-token');
  });

  it('throws when no token source is configured', async () => {
    const provider = new EnvTokenProvider({});
    await expect(provider.getToken({ tenantId: 'tenantA' })).rejects.toThrow(/no meta system user token/i);
  });
});
