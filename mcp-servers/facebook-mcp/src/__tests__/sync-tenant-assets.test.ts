import { AccountsApi } from '../fb/accounts.js';
import { prisma } from '../db/prisma.js';

describe('syncTenantAssets', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function setupPrismaMocks(businessId = 'biz_1') {
    const txMock = {
      tenantPage: { upsert: jest.fn(async () => undefined) },
      tenantAdAccount: { upsert: jest.fn(async () => undefined) },
    } as any;

    jest.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ businessId } as any);
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

    return { txMock, createManySpy, updateManySpy };
  }

  it('falls back from empty owned assets to client assets', async () => {
    const graphClient = {
      request: jest
        .fn()
        // owned_pages empty
        .mockResolvedValueOnce({
          data: { data: [] },
          status: 200,
          headers: {},
        })
        // client_pages succeeds
        .mockResolvedValueOnce({
          data: { data: [{ id: 'p_1', name: 'Client Shared Page' }] },
          status: 200,
          headers: {},
        })
        // owned_ad_accounts empty
        .mockResolvedValueOnce({
          data: { data: [] },
          status: 200,
          headers: {},
        })
        // client_ad_accounts succeeds
        .mockResolvedValueOnce({
          data: { data: [{ id: '111', name: 'Client Account 111', account_status: 1, currency: 'USD' }] },
          status: 200,
          headers: {},
        }),
    } as any;

    const { createManySpy, updateManySpy } = setupPrismaMocks();

    const api = new AccountsApi(graphClient);
    const result = await api.syncTenantAssets({ tenantId: 'tenant-a' });

    expect(result.fallbackPagesUsed).toBe(false);
    expect(result.pagesSynced).toBe(1);
    expect(result.adAccountsSynced).toBe(1);
    expect(result.pagesDiscoveryStrategy).toBe('client_pages');
    expect(result.adAccountsDiscoveryStrategy).toBe('client_ad_accounts');
    expect(result.autoAssignedDefaultPageId).toBeNull();
    expect(createManySpy).not.toHaveBeenCalled();
    expect(updateManySpy).not.toHaveBeenCalled();

    expect(graphClient.request).toHaveBeenCalledWith(
      { tenantId: 'tenant-a' },
      expect.objectContaining({
        path: 'biz_1/client_pages',
      })
    );
    expect(graphClient.request).toHaveBeenCalledWith(
      { tenantId: 'tenant-a' },
      expect.objectContaining({
        path: 'biz_1/client_ad_accounts',
      })
    );
  });

  it('filters /me fallbacks by businessId when business edges are empty', async () => {
    const graphClient = {
      request: jest
        .fn()
        // owned_pages empty
        .mockResolvedValueOnce({
          data: { data: [] },
          status: 200,
          headers: {},
        })
        // client_pages empty
        .mockResolvedValueOnce({
          data: { data: [] },
          status: 200,
          headers: {},
        })
        // me/accounts candidates (mixed businesses)
        .mockResolvedValueOnce({
          data: {
            data: [
              { id: 'p_1', name: 'Matching Page', tasks: ['ADVERTISE'] },
              { id: 'p_2', name: 'Other Business Page', tasks: ['ADVERTISE'] },
            ],
          },
          status: 200,
          headers: {},
        })
        // page business lookup p_1
        .mockResolvedValueOnce({
          data: { business: { id: 'biz_1' } },
          status: 200,
          headers: {},
        })
        // page business lookup p_2
        .mockResolvedValueOnce({
          data: { business: { id: 'biz_other' } },
          status: 200,
          headers: {},
        })
        // page agencies lookup p_2 (does not match selected BP)
        .mockResolvedValueOnce({
          data: { data: [{ id: 'biz_other' }] },
          status: 200,
          headers: {},
        })
        // page assigned_users lookup p_2 for selected business (none)
        .mockResolvedValueOnce({
          data: { data: [] },
          status: 200,
          headers: {},
        })
        // owned_ad_accounts empty
        .mockResolvedValueOnce({
          data: { data: [] },
          status: 200,
          headers: {},
        })
        // client_ad_accounts empty
        .mockResolvedValueOnce({
          data: { data: [] },
          status: 200,
          headers: {},
        })
        // me/adaccounts candidates (mixed businesses)
        .mockResolvedValueOnce({
          data: {
            data: [
              {
                id: '111',
                name: 'Matching Account',
                account_status: 1,
                currency: 'USD',
                business: { id: 'biz_1' },
              },
              {
                id: '222',
                name: 'Other Business Account',
                account_status: 1,
                currency: 'USD',
                business: { id: 'biz_other' },
              },
            ],
          },
          status: 200,
          headers: {},
        }),
    } as any;

    const { txMock, createManySpy, updateManySpy } = setupPrismaMocks();

    const api = new AccountsApi(graphClient);
    const result = await api.syncTenantAssets({ tenantId: 'tenant-a' });

    expect(result.fallbackPagesUsed).toBe(true);
    expect(result.pagesSynced).toBe(1);
    expect(result.adAccountsSynced).toBe(1);
    expect(result.pagesDiscoveryStrategy).toBe('me_accounts_filtered');
    expect(result.adAccountsDiscoveryStrategy).toBe('me_adaccounts_filtered');
    expect(result.autoAssignedDefaultPageId).toBeNull();
    expect(createManySpy).not.toHaveBeenCalled();
    expect(updateManySpy).not.toHaveBeenCalled();

    expect(txMock.tenantPage.upsert).toHaveBeenCalledTimes(1);
    expect(txMock.tenantAdAccount.upsert).toHaveBeenCalledTimes(1);
    expect(graphClient.request).toHaveBeenCalledWith(
      { tenantId: 'tenant-a' },
      expect.objectContaining({ path: 'me/accounts' })
    );
    expect(graphClient.request).toHaveBeenCalledWith(
      { tenantId: 'tenant-a' },
      expect.objectContaining({ path: 'me/adaccounts' })
    );
  });

  it('accepts partner-shared page via agencies when owner business differs', async () => {
    const graphClient = {
      request: jest
        .fn()
        // owned_pages empty
        .mockResolvedValueOnce({
          data: { data: [] },
          status: 200,
          headers: {},
        })
        // client_pages empty
        .mockResolvedValueOnce({
          data: { data: [] },
          status: 200,
          headers: {},
        })
        // me/accounts has one candidate page
        .mockResolvedValueOnce({
          data: {
            data: [{ id: 'p_partner', name: 'Partner Shared Page', tasks: ['ADVERTISE'] }],
          },
          status: 200,
          headers: {},
        })
        // page owner business is different BM
        .mockResolvedValueOnce({
          data: { business: { id: 'owner_bm' } },
          status: 200,
          headers: {},
        })
        // but selected BP appears in agencies (partner access)
        .mockResolvedValueOnce({
          data: { data: [{ id: 'biz_1' }] },
          status: 200,
          headers: {},
        })
        // owned_ad_accounts empty
        .mockResolvedValueOnce({
          data: { data: [] },
          status: 200,
          headers: {},
        })
        // client_ad_accounts success
        .mockResolvedValueOnce({
          data: { data: [{ id: '333', name: 'Client Account 333', account_status: 1, currency: 'USD' }] },
          status: 200,
          headers: {},
        }),
    } as any;

    const { txMock } = setupPrismaMocks();

    const api = new AccountsApi(graphClient);
    const result = await api.syncTenantAssets({ tenantId: 'tenant-a' });

    expect(result.pagesSynced).toBe(1);
    expect(result.pagesDiscoveryStrategy).toBe('me_accounts_filtered');
    expect(txMock.tenantPage.upsert).toHaveBeenCalledTimes(1);
    expect(graphClient.request).toHaveBeenCalledWith(
      { tenantId: 'tenant-a' },
      expect.objectContaining({ path: 'p_partner/agencies' })
    );
  });

  it('falls back to me/assigned_pages when me/accounts yields no BP-matching pages', async () => {
    const graphClient = {
      request: jest
        .fn()
        // owned_pages empty
        .mockResolvedValueOnce({
          data: { data: [] },
          status: 200,
          headers: {},
        })
        // client_pages empty
        .mockResolvedValueOnce({
          data: { data: [] },
          status: 200,
          headers: {},
        })
        // me/accounts has one page candidate
        .mockResolvedValueOnce({
          data: { data: [{ id: 'p_assigned', name: 'Assigned Candidate', tasks: ['ADVERTISE'] }] },
          status: 200,
          headers: {},
        })
        // page owner business does not match
        .mockResolvedValueOnce({
          data: { business: { id: 'other_bm' } },
          status: 200,
          headers: {},
        })
        // page agencies does not match
        .mockResolvedValueOnce({
          data: { data: [{ id: 'other_bm' }] },
          status: 200,
          headers: {},
        })
        // assigned_users also does not match
        .mockResolvedValueOnce({
          data: { data: [] },
          status: 200,
          headers: {},
        })
        // me/assigned_pages returns BP-scoped page
        .mockResolvedValueOnce({
          data: {
            data: [{ id: 'p_assigned', name: 'Assigned Page', permitted_tasks: ['ADVERTISE'] }],
          },
          status: 200,
          headers: {},
        })
        // owned_ad_accounts empty
        .mockResolvedValueOnce({
          data: { data: [] },
          status: 200,
          headers: {},
        })
        // client_ad_accounts success
        .mockResolvedValueOnce({
          data: { data: [{ id: '444', name: 'Client Account 444', account_status: 1, currency: 'USD' }] },
          status: 200,
          headers: {},
        }),
    } as any;

    const { txMock } = setupPrismaMocks();
    const api = new AccountsApi(graphClient);
    const result = await api.syncTenantAssets({ tenantId: 'tenant-a' });

    expect(result.pagesSynced).toBe(1);
    expect(result.pagesDiscoveryStrategy).toBe('me_accounts_filtered');
    expect(txMock.tenantPage.upsert).toHaveBeenCalledTimes(1);
    expect(graphClient.request).toHaveBeenCalledWith(
      { tenantId: 'tenant-a' },
      expect.objectContaining({ path: 'me/assigned_pages' })
    );
  });
});
