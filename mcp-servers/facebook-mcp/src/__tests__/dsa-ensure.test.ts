import { DsaSource } from '@prisma/client';
import { DsaService } from '../fb/dsa.js';

describe('DsaService.ensureDsaForAdAccount', () => {
  const ctx = { tenantId: 'tenant-a', adAccountId: 'act_123' };

  it('uses DB values when already present', async () => {
    const graphClient = {
      request: jest.fn(),
    } as any;
    const dbClient = {
      tenant: {
        findUnique: jest.fn(async () => ({ name: 'Tenant A' })),
      },
      adAccountSettings: {
        findUnique: jest.fn(async () => ({
          dsaBeneficiary: 'Existing Beneficiary',
          dsaPayor: 'Existing Payor',
          dsaSource: DsaSource.MANUAL,
          dsaUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
        })),
        upsert: jest.fn(),
      },
    } as any;

    const service = new DsaService(graphClient, dbClient);
    const result = await service.ensureDsaForAdAccount(ctx, '123');

    expect(result.dsaBeneficiary).toBe('Existing Beneficiary');
    expect(result.dsaPayor).toBe('Existing Payor');
    expect(graphClient.request).not.toHaveBeenCalled();
    expect(dbClient.adAccountSettings.upsert).not.toHaveBeenCalled();
  });

  it('autofills from Meta recommendation and upserts DB', async () => {
    const graphClient = {
      request: jest.fn(async () => ({
        data: {
          data: [
            {
              recommended_dsa_beneficiary: 'Meta Beneficiary',
              recommended_dsa_payor: 'Meta Payor',
            },
          ],
        },
      })),
    } as any;
    const dbClient = {
      tenant: {
        findUnique: jest.fn(async () => ({ name: 'Tenant A' })),
      },
      adAccountSettings: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(async () => ({
          dsaBeneficiary: 'Meta Beneficiary',
          dsaPayor: 'Meta Payor',
          dsaSource: DsaSource.RECOMMENDATION,
          dsaUpdatedAt: new Date('2026-01-02T00:00:00.000Z'),
        })),
      },
    } as any;

    const service = new DsaService(graphClient, dbClient);
    const result = await service.ensureDsaForAdAccount(ctx, 'act_123');

    expect(result.dsaBeneficiary).toBe('Meta Beneficiary');
    expect(result.dsaPayor).toBe('Meta Payor');
    expect(dbClient.adAccountSettings.upsert).toHaveBeenCalledTimes(1);
  });

  it('falls back to tenant name when no recommendation is returned', async () => {
    const graphClient = {
      request: jest.fn(async () => ({ data: { data: [] } })),
    } as any;
    const dbClient = {
      tenant: {
        findUnique: jest.fn(async () => ({ name: 'Tenant Auto Fallback' })),
      },
      adAccountSettings: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(async () => ({
          dsaBeneficiary: 'Tenant Auto Fallback',
          dsaPayor: 'Tenant Auto Fallback',
          dsaSource: DsaSource.MANUAL,
          dsaUpdatedAt: new Date('2026-01-02T00:00:00.000Z'),
        })),
      },
    } as any;

    const service = new DsaService(graphClient, dbClient);
    const result = await service.ensureDsaForAdAccount(ctx, 'act_123');
    expect(result.dsaBeneficiary).toBe('Tenant Auto Fallback');
    expect(result.dsaPayor).toBe('Tenant Auto Fallback');
    expect(result.dsaSource).toBe(DsaSource.MANUAL);
    expect(dbClient.adAccountSettings.upsert).toHaveBeenCalledTimes(1);
  });

  it('continues with recommendation when AdAccountSettings table is missing', async () => {
    const graphClient = {
      request: jest.fn(async () => ({
        data: {
          data: [
            {
              recommended_dsa_beneficiary: 'Meta Beneficiary',
              recommended_dsa_payor: 'Meta Payor',
            },
          ],
        },
      })),
    } as any;
    const dbClient = {
      tenant: {
        findUnique: jest.fn(async () => ({ name: 'Tenant A' })),
      },
      adAccountSettings: {
        findUnique: jest.fn(async () => {
          throw new Error('The table `manager.AdAccountSettings` does not exist in the current database.');
        }),
        upsert: jest.fn(),
      },
    } as any;

    const service = new DsaService(graphClient, dbClient);
    const result = await service.ensureDsaForAdAccount(ctx, 'act_123');

    expect(result.dsaBeneficiary).toBe('Meta Beneficiary');
    expect(result.dsaPayor).toBe('Meta Payor');
    expect(result.dsaSource).toBe(DsaSource.RECOMMENDATION);
    expect(dbClient.adAccountSettings.upsert).toHaveBeenCalledTimes(1);
  });
});
