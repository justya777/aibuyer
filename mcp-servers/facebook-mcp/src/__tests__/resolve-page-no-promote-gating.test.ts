import { AdsApi } from '../fb/ads.js';

describe('resolvePageId integration', () => {
  it('creates link ad without calling promote_pages edges', async () => {
    const graphClient = {
      request: jest
        .fn()
        .mockResolvedValueOnce({
          data: { targeting: { geo_locations: { countries: ['US'] } } },
          status: 200,
          headers: {},
        })
        .mockResolvedValueOnce({ data: { id: '12345' }, status: 200, headers: {} })
        .mockResolvedValueOnce({
          data: {
            id: '12345',
            account_id: 'act_111',
            campaign_id: 'cmp_1',
            adset_id: 'adset_1',
            name: 'Link Ad',
            status: 'PAUSED',
          },
          status: 200,
          headers: {},
        }),
    } as any;
    const pageResolver = {
      resolvePageId: jest.fn(async () => 'page_1'),
    } as any;
    const adsApi = new AdsApi(graphClient, pageResolver);

    await adsApi.createAd(
      { tenantId: 'tenant-a', adAccountId: 'act_111' },
      {
        tenantId: 'tenant-a',
        accountId: 'act_111',
        adSetId: 'adset_1',
        name: 'Link Ad',
        creative: {
          linkUrl: 'https://example.com',
          title: 'Title',
        },
      }
    );

    expect(pageResolver.resolvePageId).toHaveBeenCalledTimes(1);
    const calledPaths = graphClient.request.mock.calls.map((call: any[]) => call[1]?.path || '');
    expect(calledPaths.some((path: string) => String(path).includes('promote_pages'))).toBe(false);
    expect(calledPaths.some((path: string) => String(path).includes('promotable_pages'))).toBe(false);
  });
});
