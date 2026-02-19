import { GraphClient, GraphApiError, parseRateLimitUsage } from '../fb/core/graph-client.js';
import type { TokenProvider } from '../fb/core/token-provider.js';

describe('GraphClient', () => {
  const tokenProvider: TokenProvider = {
    getToken: jest.fn(async () => 'tenant-token'),
  };

  it('retries on 429 and succeeds', async () => {
    const httpClient = {
      request: jest
        .fn()
        .mockResolvedValueOnce({
          status: 429,
          data: { error: { message: 'rate limited' } },
          headers: {},
        })
        .mockResolvedValueOnce({
          status: 200,
          data: { ok: true },
          headers: {},
        }),
    };
    const sleepFn = jest.fn(async () => undefined);
    const client = new GraphClient(tokenProvider, {
      apiVersion: 'v23.0',
      retry: { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 20, jitterMs: 0 },
      httpClient,
      sleepFn,
    });

    const result = await client.request({ tenantId: 'tenantA' }, { method: 'GET', path: 'me' });

    expect(result.data).toEqual({ ok: true });
    expect(httpClient.request).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledTimes(1);
    expect(sleepFn).toHaveBeenCalledWith(10);
  });

  it('throws after retry budget exhausted', async () => {
    const httpClient = {
      request: jest.fn().mockResolvedValue({
        status: 500,
        data: { error: { message: 'server error' } },
        headers: {},
      }),
    };
    const sleepFn = jest.fn(async () => undefined);
    const client = new GraphClient(tokenProvider, {
      apiVersion: 'v23.0',
      retry: { maxRetries: 1, baseDelayMs: 10, maxDelayMs: 20, jitterMs: 0 },
      httpClient,
      sleepFn,
    });

    await expect(
      client.request({ tenantId: 'tenantA' }, { method: 'GET', path: 'me' })
    ).rejects.toBeInstanceOf(GraphApiError);
    expect(httpClient.request).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledWith(10);
  });

  it('parses rate limit headers', () => {
    const usage = parseRateLimitUsage({
      'x-app-usage': '{"call_count":10}',
      'x-ad-account-usage': '{"acc_id_util_pct":12}',
      'x-business-use-case-usage': '{"act_123":[{"type":"ads_management","call_count":1}]}',
    });

    expect(usage.appUsage).toEqual({ call_count: 10 });
    expect(usage.adAccountUsage).toEqual({ acc_id_util_pct: 12 });
    expect(usage.businessUseCaseUsage).toEqual({
      act_123: [{ type: 'ads_management', call_count: 1 }],
    });
  });
});
