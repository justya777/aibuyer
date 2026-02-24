import { DsaAutofillPermissionDeniedError, DsaService } from '../fb/dsa.js';
import { GraphApiError } from '../fb/core/graph-client.js';

function graphError(status: number, code: number, message: string): GraphApiError {
  return new GraphApiError(message, {
    status,
    data: { error: { code, message } },
    isRetryable: false,
    attempt: 1,
  });
}

describe('DsaService.getDsaAutofillSuggestions', () => {
  const ctx = { tenantId: 'tenant-a', adAccountId: 'act_123' };

  it('returns high-confidence suggestions from business and ad account metadata', async () => {
    const graphClient = {
      request: jest.fn(async (_ctx: unknown, request: { path: string }) => {
        if (request.path === 'biz_1') {
          return { data: { id: 'biz_1', name: 'Business One', verification_status: 'VERIFIED' } };
        }
        if (request.path === 'act_123') {
          return {
            data: {
              id: 'act_123',
              name: 'Account One',
              account_id: '123',
              currency: 'USD',
              timezone_name: 'UTC',
              business: { id: 'biz_1', name: 'Business One' },
            },
          };
        }
        if (request.path === 'page_1') {
          return {
            data: {
              id: 'page_1',
              name: 'Page One',
              business: { id: 'biz_1', name: 'Business One' },
            },
          };
        }
        return { data: {} };
      }),
    } as any;
    const dbClient = {
      tenant: {
        findUnique: jest.fn(async () => ({ name: 'Tenant A' })),
      },
      tenantPage: {
        findUnique: jest.fn(async () => ({ pageId: 'page_1' })),
      },
    } as any;

    const service = new DsaService(graphClient, dbClient);
    const result = await service.getDsaAutofillSuggestions(ctx, {
      businessId: 'biz_1',
      adAccountId: 'act_123',
      pageId: 'page_1',
    });

    expect(result.beneficiary.value).toBe('Business One');
    expect(result.beneficiary.source).toBe('BUSINESS_NAME');
    expect(result.beneficiary.confidence).toBe('HIGH');
    expect(result.payer.value).toBe('Account One');
    expect(result.payer.source).toBe('AD_ACCOUNT_NAME');
    expect(result.payer.confidence).toBe('HIGH');
    expect(result.meta.business?.id).toBe('biz_1');
    expect(result.meta.page?.id).toBe('page_1');
  });

  it('ignores missing page metadata and still returns suggestions', async () => {
    const graphClient = {
      request: jest.fn(async (_ctx: unknown, request: { path: string }) => {
        if (request.path === 'biz_1') {
          return { data: { id: 'biz_1', name: 'Business One', verification_status: 'UNVERIFIED' } };
        }
        if (request.path === 'act_123') {
          return {
            data: {
              id: 'act_123',
              name: 'Account One',
              business: { id: 'biz_1', name: 'Business One' },
            },
          };
        }
        if (request.path === 'page_1') {
          throw graphError(404, 100, 'Unsupported get request');
        }
        return { data: {} };
      }),
    } as any;
    const dbClient = {
      tenant: {
        findUnique: jest.fn(async () => ({ name: 'Tenant A' })),
      },
      tenantPage: {
        findUnique: jest.fn(async () => ({ pageId: 'page_1' })),
      },
    } as any;

    const service = new DsaService(graphClient, dbClient);
    const result = await service.getDsaAutofillSuggestions(ctx, {
      businessId: 'biz_1',
      adAccountId: 'act_123',
      pageId: 'page_1',
    });

    expect(result.meta.page).toBeUndefined();
    expect(result.beneficiary.source).toBe('BUSINESS_NAME');
    expect(result.payer.source).toBe('AD_ACCOUNT_NAME');
  });

  it('falls back to tenant name when business metadata is missing', async () => {
    const graphClient = {
      request: jest.fn(async (_ctx: unknown, request: { path: string }) => {
        if (request.path === 'biz_1') {
          throw graphError(404, 100, 'Unsupported get request');
        }
        if (request.path === 'act_123') {
          return {
            data: {
              id: 'act_123',
              name: 'Account One',
            },
          };
        }
        return { data: {} };
      }),
    } as any;
    const dbClient = {
      tenant: {
        findUnique: jest.fn(async () => ({ name: 'Tenant Fallback' })),
      },
      tenantPage: {
        findUnique: jest.fn(async () => null),
      },
    } as any;

    const service = new DsaService(graphClient, dbClient);
    const result = await service.getDsaAutofillSuggestions(ctx, {
      businessId: 'biz_1',
      adAccountId: 'act_123',
    });

    expect(result.beneficiary.source).toBe('TENANT_FALLBACK');
    expect(result.beneficiary.value).toBe('Tenant Fallback');
    expect(result.beneficiary.confidence).toBe('LOW');
    expect(result.payer.source).toBe('AD_ACCOUNT_NAME');
  });

  it('throws permission denied when Graph access is denied', async () => {
    const graphClient = {
      request: jest.fn(async (_ctx: unknown, request: { path: string }) => {
        if (request.path === 'biz_1') {
          throw graphError(403, 10, 'Application does not have permission for this action');
        }
        return { data: {} };
      }),
    } as any;
    const dbClient = {
      tenant: {
        findUnique: jest.fn(async () => ({ name: 'Tenant A' })),
      },
      tenantPage: {
        findUnique: jest.fn(async () => null),
      },
    } as any;

    const service = new DsaService(graphClient, dbClient);

    await expect(
      service.getDsaAutofillSuggestions(ctx, {
        businessId: 'biz_1',
        adAccountId: 'act_123',
      })
    ).rejects.toBeInstanceOf(DsaAutofillPermissionDeniedError);
  });
});
