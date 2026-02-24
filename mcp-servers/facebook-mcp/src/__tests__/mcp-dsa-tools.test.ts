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
});
