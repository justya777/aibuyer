import { GraphClient } from '../fb/core/graph-client.js';
import type { TokenProvider } from '../fb/core/token-provider.js';
import { AdSetsApi } from '../fb/adsets.js';
import { AdsApi } from '../fb/ads.js';
import { TargetingApi } from '../fb/targeting.js';
import { GetCampaignsSchema, GetAdSetsSchema, GetAdsSchema } from '../mcp/tools.js';

function createMockGraphClient() {
  const tokenProvider: TokenProvider = {
    getToken: jest.fn(async () => 'test-token'),
  };
  const httpClient = {
    request: jest.fn().mockResolvedValue({
      status: 200,
      data: { data: [] },
      headers: {},
    }),
  };
  const client = new GraphClient(tokenProvider, {
    apiVersion: 'v23.0',
    retry: { maxRetries: 0, baseDelayMs: 10, maxDelayMs: 20, jitterMs: 0 },
    httpClient,
  });
  return { client, httpClient };
}

describe('effective_status encoding', () => {
  describe('AdSetsApi.getAdSets', () => {
    it('sends effective_status as JSON-stringified array', async () => {
      const { client, httpClient } = createMockGraphClient();
      const targetingApi = new TargetingApi(client);
      const api = new AdSetsApi(client, targetingApi);
      const statuses = ['ACTIVE', 'PAUSED'];

      await api.getAdSets(
        { tenantId: 'tenant-1' },
        { tenantId: 'tenant-1', campaignId: '12345', status: statuses }
      );

      const callArgs = httpClient.request.mock.calls[0][0];
      expect(callArgs.params.effective_status).toBe(JSON.stringify(statuses));
    });

    it('omits effective_status when status is undefined', async () => {
      const { client, httpClient } = createMockGraphClient();
      const targetingApi = new TargetingApi(client);
      const api = new AdSetsApi(client, targetingApi);

      await api.getAdSets(
        { tenantId: 'tenant-1' },
        { tenantId: 'tenant-1', campaignId: '12345' }
      );

      const callArgs = httpClient.request.mock.calls[0][0];
      expect(callArgs.params.effective_status).toBeUndefined();
    });

    it('omits effective_status when status is empty array', async () => {
      const { client, httpClient } = createMockGraphClient();
      const targetingApi = new TargetingApi(client);
      const api = new AdSetsApi(client, targetingApi);

      await api.getAdSets(
        { tenantId: 'tenant-1' },
        { tenantId: 'tenant-1', campaignId: '12345', status: [] }
      );

      const callArgs = httpClient.request.mock.calls[0][0];
      expect(callArgs.params.effective_status).toBeUndefined();
    });
  });

  describe('AdsApi.getAds', () => {
    it('sends effective_status as JSON-stringified array', async () => {
      const { client, httpClient } = createMockGraphClient();
      const api = new AdsApi(client);
      const statuses = ['ACTIVE', 'PAUSED', 'WITH_ISSUES'];

      await api.getAds(
        { tenantId: 'tenant-1' },
        { tenantId: 'tenant-1', adSetId: '67890', status: statuses }
      );

      const callArgs = httpClient.request.mock.calls[0][0];
      expect(callArgs.params.effective_status).toBe(JSON.stringify(statuses));
    });

    it('omits effective_status when status is undefined', async () => {
      const { client, httpClient } = createMockGraphClient();
      const api = new AdsApi(client);

      await api.getAds(
        { tenantId: 'tenant-1' },
        { tenantId: 'tenant-1', adSetId: '67890' }
      );

      const callArgs = httpClient.request.mock.calls[0][0];
      expect(callArgs.params.effective_status).toBeUndefined();
    });

    it('omits effective_status when status is empty array', async () => {
      const { client, httpClient } = createMockGraphClient();
      const api = new AdsApi(client);

      await api.getAds(
        { tenantId: 'tenant-1' },
        { tenantId: 'tenant-1', adSetId: '67890', status: [] }
      );

      const callArgs = httpClient.request.mock.calls[0][0];
      expect(callArgs.params.effective_status).toBeUndefined();
    });
  });
});

describe('rate limit detection in GraphClient', () => {
  it('detects code=17 as rate limit', async () => {
    const tokenProvider: TokenProvider = {
      getToken: jest.fn(async () => 'test-token'),
    };
    const httpClient = {
      request: jest.fn().mockResolvedValue({
        status: 400,
        data: { error: { code: 17, message: 'Ad account has too many API calls', error_subcode: 2446079 } },
        headers: {},
      }),
    };
    const client = new GraphClient(tokenProvider, {
      apiVersion: 'v23.0',
      retry: { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 2, jitterMs: 0 },
      httpClient,
      sleepFn: async () => {},
    });

    await expect(
      client.request({ tenantId: 'tenant-1' }, { method: 'GET', path: 'act_123/campaigns' })
    ).rejects.toThrow();

    expect(httpClient.request).toHaveBeenCalledTimes(2);
  });

  it('detects code=4 as rate limit', async () => {
    const tokenProvider: TokenProvider = {
      getToken: jest.fn(async () => 'test-token'),
    };
    const httpClient = {
      request: jest.fn().mockResolvedValue({
        status: 400,
        data: { error: { code: 4, message: 'Application request limit reached' } },
        headers: {},
      }),
    };
    const client = new GraphClient(tokenProvider, {
      apiVersion: 'v23.0',
      retry: { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 2, jitterMs: 0 },
      httpClient,
      sleepFn: async () => {},
    });

    await expect(
      client.request({ tenantId: 'tenant-1' }, { method: 'GET', path: 'act_123/campaigns' })
    ).rejects.toThrow();

    expect(httpClient.request).toHaveBeenCalledTimes(2);
  });

  it('detects subcode=2446079 as rate limit', async () => {
    const tokenProvider: TokenProvider = {
      getToken: jest.fn(async () => 'test-token'),
    };
    const httpClient = {
      request: jest.fn().mockResolvedValue({
        status: 400,
        data: { error: { code: 17, error_subcode: 2446079, message: 'Too many calls' } },
        headers: {},
      }),
    };
    const client = new GraphClient(tokenProvider, {
      apiVersion: 'v23.0',
      retry: { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 2, jitterMs: 0 },
      httpClient,
      sleepFn: async () => {},
    });

    await expect(
      client.request({ tenantId: 'tenant-1' }, { method: 'GET', path: 'act_123/campaigns' })
    ).rejects.toThrow();

    expect(httpClient.request).toHaveBeenCalledTimes(2);
  });
});

describe('coerceStringArray in Zod schemas', () => {
  it('coerces a JSON string to an array in GetCampaignsSchema', () => {
    const result = GetCampaignsSchema.parse({
      tenantId: 't1',
      accountId: 'act_123',
      status: '["ACTIVE","PAUSED"]',
    });
    expect(result.status).toEqual(['ACTIVE', 'PAUSED']);
  });

  it('coerces a single string to an array in GetCampaignsSchema', () => {
    const result = GetCampaignsSchema.parse({
      tenantId: 't1',
      accountId: 'act_123',
      status: 'ACTIVE',
    });
    expect(result.status).toEqual(['ACTIVE']);
  });

  it('passes through an array unchanged in GetAdSetsSchema', () => {
    const result = GetAdSetsSchema.parse({
      tenantId: 't1',
      campaignId: 'c1',
      status: ['ACTIVE', 'PAUSED'],
    });
    expect(result.status).toEqual(['ACTIVE', 'PAUSED']);
  });

  it('allows undefined status in GetAdsSchema', () => {
    const result = GetAdsSchema.parse({ tenantId: 't1' });
    expect(result.status).toBeUndefined();
  });
});
