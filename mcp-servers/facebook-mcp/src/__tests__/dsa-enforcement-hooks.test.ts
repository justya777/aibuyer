import { AdSetsApi } from '../fb/adsets.js';
import { AdsApi } from '../fb/ads.js';

describe('DSA enforcement hooks', () => {
  it('attaches DSA payload in EU create_adset path', async () => {
    const graphClient = {
      request: jest
        .fn()
        .mockResolvedValueOnce({
          data: { daily_budget: null, lifetime_budget: null },
          status: 200,
          headers: {},
        })
        .mockResolvedValueOnce({
          data: { id: 'adset_1' },
          status: 200,
          headers: {},
        })
        .mockResolvedValueOnce({
          data: {
            id: 'adset_1',
            account_id: 'act_123',
            campaign_id: 'cmp_1',
            name: 'EU Ad Set',
            status: 'PAUSED',
            optimization_goal: 'REACH',
            billing_event: 'IMPRESSIONS',
            targeting: { geo_locations: { countries: ['RO'] } },
            created_time: '2026-01-01T00:00:00.000Z',
            updated_time: '2026-01-01T00:00:00.000Z',
          },
          status: 200,
          headers: {},
        }),
    } as any;
    const targetingApi = {
      buildAdSetTargeting: jest.fn(async () => ({ geo_locations: { countries: ['RO'] } })),
    } as any;
    const dsaService = {
      ensureDsaForAdAccount: jest.fn(async () => ({
        dsaBeneficiary: 'Meta Beneficiary',
        dsaPayor: 'Meta Payor',
      })),
    } as any;
    const pageResolver = {
      resolvePageId: jest.fn(),
    } as any;

    const api = new AdSetsApi(graphClient, targetingApi, dsaService, pageResolver);
    await api.createAdSet(
      { tenantId: 'tenant-a', adAccountId: 'act_123' },
      {
        tenantId: 'tenant-a',
        accountId: 'act_123',
        campaignId: 'cmp_1',
        name: 'EU Ad Set',
        optimizationGoal: 'REACH',
        billingEvent: 'IMPRESSIONS',
        status: 'PAUSED',
        dailyBudget: 1000,
        targeting: {
          geoLocations: {
            countries: ['RO'],
          },
        },
      }
    );

    expect(dsaService.ensureDsaForAdAccount).toHaveBeenCalledWith(
      { tenantId: 'tenant-a', adAccountId: 'act_123' },
      'act_123'
    );
    const createCallBody = graphClient.request.mock.calls[1][1].body;
    expect(createCallBody.dsa_beneficiary).toBe('Meta Beneficiary');
    expect(createCallBody.dsa_payor).toBe('Meta Payor');
  });

  it('does not enforce DSA in non-EU create_adset path', async () => {
    const graphClient = {
      request: jest
        .fn()
        .mockResolvedValueOnce({
          data: { daily_budget: null, lifetime_budget: null },
          status: 200,
          headers: {},
        })
        .mockResolvedValueOnce({
          data: { id: 'adset_2' },
          status: 200,
          headers: {},
        })
        .mockResolvedValueOnce({
          data: {
            id: 'adset_2',
            account_id: 'act_123',
            campaign_id: 'cmp_1',
            name: 'US Ad Set',
            status: 'PAUSED',
            optimization_goal: 'REACH',
            billing_event: 'IMPRESSIONS',
            targeting: { geo_locations: { countries: ['US'] } },
            created_time: '2026-01-01T00:00:00.000Z',
            updated_time: '2026-01-01T00:00:00.000Z',
          },
          status: 200,
          headers: {},
        }),
    } as any;
    const targetingApi = {
      buildAdSetTargeting: jest.fn(async () => ({ geo_locations: { countries: ['US'] } })),
    } as any;
    const dsaService = {
      ensureDsaForAdAccount: jest.fn(),
    } as any;

    const api = new AdSetsApi(graphClient, targetingApi, dsaService);
    await api.createAdSet(
      { tenantId: 'tenant-a', adAccountId: 'act_123' },
      {
        tenantId: 'tenant-a',
        accountId: 'act_123',
        campaignId: 'cmp_1',
        name: 'US Ad Set',
        optimizationGoal: 'REACH',
        billingEvent: 'IMPRESSIONS',
        status: 'PAUSED',
        dailyBudget: 1000,
        targeting: {
          geoLocations: {
            countries: ['US'],
          },
        },
      }
    );

    expect(dsaService.ensureDsaForAdAccount).not.toHaveBeenCalled();
    const createCallBody = graphClient.request.mock.calls[1][1].body;
    expect(createCallBody.dsa_beneficiary).toBeUndefined();
    expect(createCallBody.dsa_payor).toBeUndefined();
  });

  it('attaches DSA payload in EU create_ad path by reading parent adset targeting', async () => {
    const graphClient = {
      request: jest
        .fn()
        .mockResolvedValueOnce({
          data: { targeting: { geo_locations: { countries: ['RO'] } } },
          status: 200,
          headers: {},
        })
        .mockResolvedValueOnce({
          data: { id: 'ad_1' },
          status: 200,
          headers: {},
        })
        .mockResolvedValueOnce({
          data: {
            id: 'ad_1',
            account_id: 'act_123',
            campaign_id: 'cmp_1',
            adset_id: 'adset_1',
            name: 'EU Ad',
            status: 'PAUSED',
            created_time: '2026-01-01T00:00:00.000Z',
            updated_time: '2026-01-01T00:00:00.000Z',
          },
          status: 200,
          headers: {},
        }),
    } as any;
    const dsaService = {
      ensureDsaForAdAccount: jest.fn(async () => ({
        dsaBeneficiary: 'Meta Beneficiary',
        dsaPayor: 'Meta Payor',
      })),
    } as any;

    const api = new AdsApi(graphClient, undefined, dsaService);
    await api.createAd(
      { tenantId: 'tenant-a', adAccountId: 'act_123' },
      {
        tenantId: 'tenant-a',
        accountId: 'act_123',
        adSetId: 'adset_1',
        name: 'EU Ad',
        creative: {},
        status: 'PAUSED',
      }
    );

    expect(dsaService.ensureDsaForAdAccount).toHaveBeenCalledWith(
      { tenantId: 'tenant-a', adAccountId: 'act_123' },
      'act_123'
    );
    const createCallBody = graphClient.request.mock.calls[1][1].body;
    expect(createCallBody.dsa_beneficiary).toBe('Meta Beneficiary');
    expect(createCallBody.dsa_payor).toBe('Meta Payor');
  });

  it('does not enforce DSA in non-EU create_ad path', async () => {
    const graphClient = {
      request: jest
        .fn()
        .mockResolvedValueOnce({
          data: { targeting: { geo_locations: { countries: ['US'] } } },
          status: 200,
          headers: {},
        })
        .mockResolvedValueOnce({
          data: { id: 'ad_2' },
          status: 200,
          headers: {},
        })
        .mockResolvedValueOnce({
          data: {
            id: 'ad_2',
            account_id: 'act_123',
            campaign_id: 'cmp_1',
            adset_id: 'adset_2',
            name: 'US Ad',
            status: 'PAUSED',
            created_time: '2026-01-01T00:00:00.000Z',
            updated_time: '2026-01-01T00:00:00.000Z',
          },
          status: 200,
          headers: {},
        }),
    } as any;
    const dsaService = {
      ensureDsaForAdAccount: jest.fn(),
    } as any;

    const api = new AdsApi(graphClient, undefined, dsaService);
    await api.createAd(
      { tenantId: 'tenant-a', adAccountId: 'act_123' },
      {
        tenantId: 'tenant-a',
        accountId: 'act_123',
        adSetId: 'adset_2',
        name: 'US Ad',
        creative: {},
        status: 'PAUSED',
      }
    );

    expect(dsaService.ensureDsaForAdAccount).not.toHaveBeenCalled();
    const createCallBody = graphClient.request.mock.calls[1][1].body;
    expect(createCallBody.dsa_beneficiary).toBeUndefined();
    expect(createCallBody.dsa_payor).toBeUndefined();
  });
});
