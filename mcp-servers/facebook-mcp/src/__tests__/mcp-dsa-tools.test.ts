import { FacebookToolHandlers } from '../mcp/handlers.js';

describe('MCP DSA tools', () => {
  it('routes get_dsa_settings to facebook service', async () => {
    const facebookService = {
      getDsaSettings: jest.fn(async () => ({
        adAccountId: 'act_123',
        dsaBeneficiary: 'A',
        dsaPayor: 'B',
        source: 'MANUAL',
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        configured: true,
      })),
    } as any;
    const handlers = new FacebookToolHandlers(facebookService);

    const result = await handlers.handleToolCall('get_dsa_settings', {
      tenantId: 'tenant-a',
      adAccountId: 'act_123',
    });

    expect(facebookService.getDsaSettings).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      adAccountId: 'act_123',
    });
    expect((result as any).configured).toBe(true);
  });

  it('routes set_dsa_settings to facebook service', async () => {
    const facebookService = {
      setDsaSettings: jest.fn(async () => ({
        adAccountId: 'act_123',
        dsaBeneficiary: 'Company A',
        dsaPayor: 'Company B',
        source: 'MANUAL',
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        configured: true,
      })),
    } as any;
    const handlers = new FacebookToolHandlers(facebookService);

    const result = await handlers.handleToolCall('set_dsa_settings', {
      tenantId: 'tenant-a',
      adAccountId: 'act_123',
      dsaBeneficiary: 'Company A',
      dsaPayor: 'Company B',
    });

    expect(facebookService.setDsaSettings).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      adAccountId: 'act_123',
      dsaBeneficiary: 'Company A',
      dsaPayor: 'Company B',
    });
    expect((result as any).configured).toBe(true);
  });

  it('routes get_dsa_autofill_suggestions to facebook service', async () => {
    const facebookService = {
      getDsaAutofillSuggestions: jest.fn(async () => ({
        beneficiary: {
          value: 'Business A',
          source: 'BUSINESS_NAME',
          confidence: 'HIGH',
          reasons: ['Used Business Portfolio name from Meta.'],
        },
        payer: {
          value: 'Account A',
          source: 'AD_ACCOUNT_NAME',
          confidence: 'HIGH',
          reasons: ['Used Ad Account name from Meta.'],
        },
        meta: {
          business: { id: 'biz_1', name: 'Business A', verification_status: 'VERIFIED' },
          adAccount: { id: 'act_123', name: 'Account A', currency: 'USD', timezone_name: 'UTC' },
        },
      })),
    } as any;
    const handlers = new FacebookToolHandlers(facebookService);

    const result = await handlers.handleToolCall('get_dsa_autofill_suggestions', {
      tenantId: 'tenant-a',
      businessId: 'biz_1',
      adAccountId: 'act_123',
      pageId: '12345',
    });

    expect(facebookService.getDsaAutofillSuggestions).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      businessId: 'biz_1',
      adAccountId: 'act_123',
      pageId: '12345',
    });
    expect((result as any).beneficiary.value).toBe('Business A');
  });
});
