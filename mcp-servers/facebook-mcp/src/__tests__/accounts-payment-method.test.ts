import { AccountsApi, PaymentMethodRequiredError } from '../fb/accounts.js';

describe('AccountsApi payment method preflight', () => {
  it('throws when funding_source is missing', async () => {
    const graphClient = {
      request: jest.fn(async () => ({
        data: {},
        status: 200,
        headers: {},
      })),
    } as any;
    const api = new AccountsApi(graphClient);

    await expect(
      api.ensurePaymentMethodConfigured(
        { tenantId: 'tenant-a', adAccountId: 'act_123' } as any,
        'act_123'
      )
    ).rejects.toBeInstanceOf(PaymentMethodRequiredError);
  });

  it('throws when funding_source is zero', async () => {
    const graphClient = {
      request: jest.fn(async () => ({
        data: { funding_source: 0 },
        status: 200,
        headers: {},
      })),
    } as any;
    const api = new AccountsApi(graphClient);

    await expect(
      api.ensurePaymentMethodConfigured(
        { tenantId: 'tenant-a', adAccountId: 'act_123' } as any,
        'act_123'
      )
    ).rejects.toBeInstanceOf(PaymentMethodRequiredError);
  });

  it('throws when funding_source_details is explicitly empty', async () => {
    const graphClient = {
      request: jest.fn(async () => ({
        data: { funding_source: '123456', funding_source_details: {} },
        status: 200,
        headers: {},
      })),
    } as any;
    const api = new AccountsApi(graphClient);

    await expect(
      api.ensurePaymentMethodConfigured(
        { tenantId: 'tenant-a', adAccountId: 'act_123' } as any,
        'act_123'
      )
    ).rejects.toBeInstanceOf(PaymentMethodRequiredError);
  });

  it('passes when funding_source exists', async () => {
    const graphClient = {
      request: jest.fn(async () => ({
        data: { funding_source: '123456' },
        status: 200,
        headers: {},
      })),
    } as any;
    const api = new AccountsApi(graphClient);

    await expect(
      api.ensurePaymentMethodConfigured(
        { tenantId: 'tenant-a', adAccountId: 'act_123' } as any,
        'act_123'
      )
    ).resolves.toBeUndefined();
  });
});
