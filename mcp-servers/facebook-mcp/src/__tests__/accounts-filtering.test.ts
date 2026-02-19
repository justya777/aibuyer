import { AccountsApi } from '../fb/accounts.js';

describe('get_accounts tenant filtering', () => {
  it('returns only ad accounts assigned to tenant', async () => {
    const graphClient = {
      request: jest.fn(async () => ({
        data: {
          data: [
            { id: 'act_100', name: 'Allowed A', account_status: 1 },
            { id: 'act_200', name: 'Blocked B', account_status: 1 },
            { id: '300', name: 'Allowed C (normalized)', account_status: 1 },
          ],
        },
        status: 200,
        headers: {},
      })),
    } as any;

    const api = new AccountsApi(graphClient);
    const result = await api.getAccounts(
      { tenantId: 'tenant-1' },
      { tenantId: 'tenant-1', limit: 50 },
      ['act_100', 'act_300']
    );

    expect(result).toHaveLength(2);
    expect(result.map((account) => account.id)).toEqual(['act_100', 'act_300']);
  });
});
