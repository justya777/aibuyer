import axios from 'axios';
import path from 'node:path';
import dotenv from 'dotenv';
import { AccountsApi } from '../fb/accounts.js';
import { GraphClient } from '../fb/core/graph-client.js';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const AD_ACCOUNT_ID = '1825705654795965';
const API_VERSION = 'v24.0';
const BASE_URL = 'https://graph.facebook.com';
const runLive = process.env.RUN_LIVE_PROMOTABLE_TESTS === 'true';
const describeLive = runLive ? describe : describe.skip;

describeLive('live Graph promotable pages response', () => {
  it('prints raw Graph responses for promote pages lookups', async () => {
    const token =
      process.env.GLOBAL_SYSTEM_USER_TOKEN ||
      process.env.GLOBAL_SU_TOKEN ||
      process.env.META_SYSTEM_USER_TOKEN;
    if (!token) {
      throw new Error('GLOBAL_SYSTEM_USER_TOKEN (or alias) is missing in .env');
    }

    const promotePages = await axios.get(`${BASE_URL}/${API_VERSION}/${AD_ACCOUNT_ID}/promote_pages`, {
      params: { fields: 'id,name', access_token: token },
      validateStatus: () => true,
    });
    console.log(`Graph /promote_pages status=${promotePages.status}`);
    console.log('Graph /promote_pages payload:', JSON.stringify(promotePages.data, null, 2));

    const promotablePages = await axios.get(
      `${BASE_URL}/${API_VERSION}/${AD_ACCOUNT_ID}/promotable_pages`,
      {
        params: { fields: 'id,name', access_token: token },
        validateStatus: () => true,
      }
    );
    console.log(`Graph /promotable_pages status=${promotablePages.status}`);
    console.log('Graph /promotable_pages payload:', JSON.stringify(promotablePages.data, null, 2));

    expect([200, 400, 403]).toContain(promotePages.status);
    expect([200, 400, 403]).toContain(promotablePages.status);
  });

  it('prints mapped AccountsApi getPromotablePages result', async () => {
    const token =
      process.env.GLOBAL_SYSTEM_USER_TOKEN ||
      process.env.GLOBAL_SU_TOKEN ||
      process.env.META_SYSTEM_USER_TOKEN;
    if (!token) {
      throw new Error('GLOBAL_SYSTEM_USER_TOKEN (or alias) is missing in .env');
    }

    const tokenProvider = {
      getToken: jest.fn(async () => token),
    };
    const graphClient = new GraphClient(tokenProvider as any, {
      apiVersion: API_VERSION,
      retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1, jitterMs: 0 },
    });
    const api = new AccountsApi(graphClient);
    jest.spyOn(api, 'listTenantPages').mockResolvedValue([
      {
        id: 'p_1',
        name: 'Page One',
        canPromote: true,
        source: 'BUSINESS_OWNED' as any,
        confirmed: true,
        tasks: [],
        lastSeenAt: new Date(),
      },
    ]);
    const pages = await api.getPromotablePages({ tenantId: 'live-test' }, AD_ACCOUNT_ID);

    console.log('AccountsApi.getPromotablePages mapped result:', JSON.stringify(pages, null, 2));
    expect(Array.isArray(pages)).toBe(true);
  });
});
