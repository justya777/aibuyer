import { GraphClient } from '../fb/core/graph-client.js';
import { graphQuery } from '../fb/core/query-builder.js';
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

describe('RateLimitCooldownError', () => {
  it('is thrown when account is in cooldown', async () => {
    const { RateLimitCooldownError } = await import('../fb/core/graph-client.js');
    const future = new Date(Date.now() + 30_000);
    const err = new RateLimitCooldownError('act_123', future);
    expect(err.name).toBe('RateLimitCooldownError');
    expect(err.retryAfterSeconds).toBeGreaterThan(0);
    expect(err.retryAfterSeconds).toBeLessThanOrEqual(30);
    expect(err.message).toContain('act_123');
    expect(err.message).toContain('code=17');
  });
});

describe('QueryBuilder', () => {
  it('builds effective_status as JSON-stringified array', () => {
    const q = graphQuery().withEffectiveStatus(['ACTIVE', 'PAUSED']).build();
    expect(q.effective_status).toBe(JSON.stringify(['ACTIVE', 'PAUSED']));
  });

  it('omits effective_status for undefined input', () => {
    const q = graphQuery().withEffectiveStatus(undefined).build();
    expect(q.effective_status).toBeUndefined();
  });

  it('omits effective_status for empty array', () => {
    const q = graphQuery().withEffectiveStatus([]).build();
    expect(q.effective_status).toBeUndefined();
  });

  it('joins fields with comma', () => {
    const q = graphQuery().withFields(['id', 'name', 'status']).build();
    expect(q.fields).toBe('id,name,status');
  });

  it('clamps limit to 1-200', () => {
    expect(graphQuery().withLimit(0).build().limit).toBe('1');
    expect(graphQuery().withLimit(300).build().limit).toBe('200');
    expect(graphQuery().withLimit(50).build().limit).toBe('50');
  });

  it('chains methods fluently', () => {
    const q = graphQuery()
      .withLimit(25)
      .withFields(['id', 'name'])
      .withEffectiveStatus(['ACTIVE'])
      .build();
    expect(q.limit).toBe('25');
    expect(q.fields).toBe('id,name');
    expect(q.effective_status).toBe(JSON.stringify(['ACTIVE']));
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
