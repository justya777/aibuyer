import type {
  FacebookAccount,
  FacebookPage,
  GetAccountsParams,
  GetPagesParams,
} from '../types/facebook.js';
import { GraphClient } from './core/graph-client.js';
import type { RequestContext } from './core/types.js';
import { normalizeAdAccountId } from './core/tenant-registry.js';

function mapAccountStatus(status: number): 'active' | 'inactive' | 'limited' | 'disabled' {
  switch (status) {
    case 1:
      return 'active';
    case 2:
      return 'disabled';
    case 3:
      return 'limited';
    default:
      return 'inactive';
  }
}

export class AccountsApi {
  private readonly graphClient: GraphClient;

  constructor(graphClient: GraphClient) {
    this.graphClient = graphClient;
  }

  async getAccounts(
    ctx: RequestContext,
    params: GetAccountsParams,
    allowedAdAccountIds: string[]
  ): Promise<FacebookAccount[]> {
    const fields = params.fields?.length
      ? params.fields
      : [
          'id',
          'name',
          'account_status',
          'currency',
          'timezone_name',
          'created_time',
          'amount_spent',
          'spend_cap',
        ];

    const response = await this.graphClient.request<{ data?: Array<Record<string, unknown>> }>(ctx, {
      method: 'GET',
      path: 'me/adaccounts',
      query: {
        limit: params.limit || 50,
        fields: fields.join(','),
      },
    });

    const accounts = response.data.data || [];
    return accounts
      .filter((account) => {
        const id = normalizeAdAccountId(String(account.id || ''));
        return allowedAdAccountIds.includes(id);
      })
      .map((account) => ({
        id: normalizeAdAccountId(String(account.id || '')),
        name: String(account.name || ''),
        status: mapAccountStatus(Number(account.account_status || 0)),
        currency: String(account.currency || 'USD'),
        timezone: String(account.timezone_name || 'UTC'),
        lastActivity: new Date(),
        createdAt: account.created_time ? new Date(String(account.created_time)) : new Date(),
        metrics: {
          ctr: 0,
          cpm: 0,
          cpc: 0,
          budget: Number(account.spend_cap || 0),
          spend: Number(account.amount_spent || 0),
          impressions: 0,
          clicks: 0,
          conversions: 0,
          reach: 0,
          frequency: 0,
        },
        activeCampaigns: 0,
        totalCampaigns: 0,
      }));
  }

  async getPages(ctx: RequestContext, params: GetPagesParams): Promise<FacebookPage[]> {
    const response = await this.graphClient.request<{ data?: Array<Record<string, unknown>> }>(ctx, {
      method: 'GET',
      path: 'me/accounts',
      query: {
        limit: params.limit || 50,
        fields: 'id,name,category,tasks,access_token',
      },
    });

    const pages = response.data.data || [];
    return pages.map((page) => ({
      id: String(page.id || ''),
      name: String(page.name || ''),
      category: String(page.category || 'Unknown'),
      tasks: Array.isArray(page.tasks) ? page.tasks.map((task) => String(task)) : [],
      createdAt: new Date(),
    }));
  }

  async getPromotablePages(
    ctx: RequestContext,
    accountId: string
  ): Promise<Array<{ id: string; name: string; canPromote: boolean }>> {
    const cleanAccountId = normalizeAdAccountId(accountId).replace('act_', '');
    const response = await this.graphClient.request<{ data?: Array<Record<string, unknown>> }>(ctx, {
      method: 'GET',
      path: `act_${cleanAccountId}/promotable_pages`,
      query: { fields: 'id,name' },
    });
    return (response.data.data || []).map((page) => ({
      id: String(page.id || ''),
      name: String(page.name || ''),
      canPromote: true,
    }));
  }
}
