import type { EnvConfig } from '../config/env.js';
import { FacebookServiceFacade } from '../fb/FacebookServiceFacade.js';
import { DsaComplianceError } from '../fb/dsa.js';
import { PaymentMethodRequiredError } from '../fb/accounts.js';

describe('preflight blocks partial create', () => {
  it('blocks campaign creation when EU targeting lacks DSA', async () => {
    const env: EnvConfig = {
      nodeEnv: 'test',
      port: 3001,
      logLevel: 'error',
      globalSystemUserToken: 'token',
      tenantSuTokenMapRaw: undefined,
      graphApiVersion: 'v23.0',
      insightsCacheTtlMs: 1000,
      graphRetry: {
        maxRetries: 0,
        baseDelayMs: 1,
        maxDelayMs: 1,
        jitterMs: 0,
      },
      policy: {
        enforcementMode: 'allow_with_warning',
        maxBudgetIncreasePercent: 50,
        maxMutationsPerTenantPerHour: 120,
        broadTargetingAgeSpanThreshold: 35,
      },
    };

    const tenantRegistry = {
      assertTenantAccessible: jest.fn(async () => undefined),
      assertAdAccountAllowed: jest.fn(async () => undefined),
      getAllowedAdAccountIds: jest.fn(async () => []),
      inferTenantIdByAdAccount: jest.fn(async () => undefined),
    } as any;

    const dsaService = {
      ensureDsaForAdAccount: jest.fn(async () => {
        throw new DsaComplianceError();
      }),
    } as any;

    const facade = new FacebookServiceFacade({
      env,
      tenantRegistry,
      dsaService,
    });

    const createCampaignSpy = jest.fn();
    (facade as any).campaignsApi = {
      createCampaign: createCampaignSpy,
      getCampaignAccountId: jest.fn(),
      getCampaignBudget: jest.fn(),
      updateCampaign: jest.fn(),
      duplicateCampaign: jest.fn(),
    };

    await expect(
      facade.createCampaign({
        tenantId: 'tenant-a',
        accountId: 'act_123',
        name: 'Campaign',
        objective: 'OUTCOME_LEADS',
        dailyBudget: 1000,
        adSetTargeting: {
          geoLocations: {
            countries: ['RO'],
          },
        },
      })
    ).rejects.toBeInstanceOf(DsaComplianceError);

    expect(createCampaignSpy).not.toHaveBeenCalled();
  });

  it('blocks campaign creation when billing setup is missing', async () => {
    const env: EnvConfig = {
      nodeEnv: 'test',
      port: 3001,
      logLevel: 'error',
      globalSystemUserToken: 'token',
      tenantSuTokenMapRaw: undefined,
      graphApiVersion: 'v23.0',
      insightsCacheTtlMs: 1000,
      graphRetry: {
        maxRetries: 0,
        baseDelayMs: 1,
        maxDelayMs: 1,
        jitterMs: 0,
      },
      policy: {
        enforcementMode: 'allow_with_warning',
        maxBudgetIncreasePercent: 50,
        maxMutationsPerTenantPerHour: 120,
        broadTargetingAgeSpanThreshold: 35,
      },
    };

    const tenantRegistry = {
      assertTenantAccessible: jest.fn(async () => undefined),
      assertAdAccountAllowed: jest.fn(async () => undefined),
      getAllowedAdAccountIds: jest.fn(async () => []),
      inferTenantIdByAdAccount: jest.fn(async () => undefined),
    } as any;

    const dsaService = {
      ensureDsaForAdAccount: jest.fn(async () => undefined),
    } as any;

    const facade = new FacebookServiceFacade({
      env,
      tenantRegistry,
      dsaService,
    });

    const createCampaignSpy = jest.fn();
    (facade as any).campaignsApi = {
      createCampaign: createCampaignSpy,
      getCampaignAccountId: jest.fn(),
      getCampaignBudget: jest.fn(),
      updateCampaign: jest.fn(),
      duplicateCampaign: jest.fn(),
    };

    const ensurePaymentMethodConfigured = jest.fn(async () => {
      throw new PaymentMethodRequiredError('act_123');
    });
    (facade as any).accountsApi = {
      ensurePaymentMethodConfigured,
    };

    await expect(
      facade.createCampaign({
        tenantId: 'tenant-a',
        accountId: 'act_123',
        name: 'Campaign',
        objective: 'OUTCOME_LEADS',
        dailyBudget: 1000,
        adSetTargeting: {
          geoLocations: {
            countries: ['US'],
          },
        },
      })
    ).rejects.toBeInstanceOf(PaymentMethodRequiredError);

    expect(ensurePaymentMethodConfigured).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        adAccountId: 'act_123',
      }),
      'act_123'
    );
    expect(createCampaignSpy).not.toHaveBeenCalled();
  });
});
