import { AccountsApi } from '../fb/accounts.js';
import { prisma } from '../db/prisma.js';

describe('syncTenantAssets', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses /me/accounts fallback and keeps pages unverified', async () => {
    const graphClient = {
      request: jest
        .fn()
        // owned_pages fails
        .mockRejectedValueOnce(new Error('owned_pages unavailable'))
        // /me/accounts fallback succeeds
        .mockResolvedValueOnce({
          data: {
            data: [{ id: 'p_1', name: 'Fallback Page', tasks: ['ADVERTISE'] }],
          },
          status: 200,
          headers: {},
        })
        // owned_ad_accounts succeeds
        .mockResolvedValueOnce({
          data: {
            data: [{ id: '111', name: 'Account 111', account_status: 1, currency: 'USD' }],
          },
          status: 200,
          headers: {},
        }),
    } as any;

    const txMock = {
      tenantPage: { upsert: jest.fn(async () => undefined) },
      tenantAdAccount: { upsert: jest.fn(async () => undefined) },
    } as any;

    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ businessId: 'biz_1' } as any);
    jest
      .spyOn(prisma.tenantPage, 'findMany')
      .mockResolvedValueOnce([] as any) // existing page sources
      .mockResolvedValueOnce([] as any); // confirmed pages after sync
    jest.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(txMock));
    const createManySpy = jest
      .spyOn(prisma.adAccountSettings, 'createMany')
      .mockResolvedValue({ count: 0 } as any);
    const updateManySpy = jest
      .spyOn(prisma.adAccountSettings, 'updateMany')
      .mockResolvedValue({ count: 0 } as any);

    const api = new AccountsApi(graphClient);
    const result = await api.syncTenantAssets({ tenantId: 'tenant-a' });

    expect(result.fallbackPagesUsed).toBe(true);
    expect(result.pagesSynced).toBe(1);
    expect(result.adAccountsSynced).toBe(1);
    expect(result.autoAssignedDefaultPageId).toBeNull();
    expect(createManySpy).not.toHaveBeenCalled();
    expect(updateManySpy).not.toHaveBeenCalled();
    expect(graphClient.request).toHaveBeenCalledWith(
      { tenantId: 'tenant-a' },
      expect.objectContaining({
        path: 'me/accounts',
        query: expect.objectContaining({ fields: 'id,name,tasks,perms' }),
      })
    );
  });
});
