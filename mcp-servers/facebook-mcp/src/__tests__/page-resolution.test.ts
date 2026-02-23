import { PageResolutionError, PageResolver } from '../fb/core/page-resolution.js';

describe('PageResolver.resolvePageId', () => {
  const ctx = {
    tenantId: 'tenant-a',
    userId: 'user-a',
    isPlatformAdmin: false,
  };

  function buildResolver(overrides?: {
    defaultPageId?: string | null;
    confirmedPages?: Array<{ pageId: string }>;
  }) {
    const tenantRegistry = {
      assertAdAccountAllowed: jest.fn(async () => undefined),
      assertPageAllowed: jest.fn(async () => undefined),
    } as any;
    const dbClient = {
      adAccountSettings: {
        findUnique: jest.fn(async () => ({
          defaultPageId: overrides?.defaultPageId ?? null,
        })),
      },
      tenantPage: {
        findMany: jest.fn(async () => overrides?.confirmedPages || []),
      },
    } as any;
    return {
      tenantRegistry,
      dbClient,
      resolver: new PageResolver(tenantRegistry, dbClient),
    };
  }

  it('prefers explicit pageId when provided', async () => {
    const { resolver, tenantRegistry, dbClient } = buildResolver({
      defaultPageId: '111',
      confirmedPages: [{ pageId: '222' }],
    });

    await expect(resolver.resolvePageId(ctx, 'act_123', '999')).resolves.toBe('999');
    expect(tenantRegistry.assertPageAllowed).toHaveBeenCalledWith(
      'tenant-a',
      '999',
      'user-a',
      false
    );
    expect(dbClient.adAccountSettings.findUnique).not.toHaveBeenCalled();
  });

  it('uses ad account defaultPageId when explicit page is missing', async () => {
    const { resolver } = buildResolver({ defaultPageId: '555' });
    await expect(resolver.resolvePageId(ctx, 'act_123')).resolves.toBe('555');
  });

  it('falls back to single confirmed tenant page when default is missing', async () => {
    const { resolver } = buildResolver({
      defaultPageId: null,
      confirmedPages: [{ pageId: '777' }],
    });
    await expect(resolver.resolvePageId(ctx, 'act_123')).resolves.toBe('777');
  });

  it('throws when no explicit/default/single page is available', async () => {
    const { resolver } = buildResolver({
      defaultPageId: null,
      confirmedPages: [{ pageId: '1' }, { pageId: '2' }],
    });
    await expect(resolver.resolvePageId(ctx, 'act_123')).rejects.toBeInstanceOf(PageResolutionError);
  });
});
