import type {
  FacebookAccount,
  FacebookPage,
  GetAccountsParams,
  GetPagesParams,
} from '../types/facebook.js';
import { TenantPageSource } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
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

type SyncTenantAssetsResult = {
  tenantId: string;
  businessId: string;
  fallbackPagesUsed: boolean;
  pagesSynced: number;
  adAccountsSynced: number;
  pagesDiscoveryStrategy: 'owned_pages' | 'client_pages' | 'me_accounts_filtered' | 'none';
  adAccountsDiscoveryStrategy: 'owned_ad_accounts' | 'client_ad_accounts' | 'me_adaccounts_filtered' | 'none';
  autoAssignedDefaultPageId: string | null;
};

type TenantPageView = {
  id: string;
  name: string;
  canPromote: boolean;
  source: TenantPageSource;
  confirmed: boolean;
  tasks: string[];
  lastSeenAt: Date;
};

function parseArrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry)).filter(Boolean);
}

function parsePageSource(
  existingSource: TenantPageSource | undefined,
  incomingSource: TenantPageSource
): TenantPageSource {
  if (incomingSource === TenantPageSource.BUSINESS_OWNED) {
    return TenantPageSource.BUSINESS_OWNED;
  }
  if (existingSource === TenantPageSource.FALLBACK_CONFIRMED) {
    return TenantPageSource.FALLBACK_CONFIRMED;
  }
  return incomingSource;
}

export class AccountsApi {
  private readonly graphClient: GraphClient;

  constructor(graphClient: GraphClient) {
    this.graphClient = graphClient;
  }

  private mapBusinessPages(
    pages: Array<Record<string, unknown>>,
    source: TenantPageSource
  ): Array<{
    pageId: string;
    name: string;
    tasksJson: string[];
    source: TenantPageSource;
  }> {
    return pages
      .filter((page) => page.id)
      .map((page) => ({
        pageId: String(page.id),
        name: String(page.name || page.id),
        tasksJson: [],
        source,
      }));
  }

  private mapFallbackPages(
    pages: Array<Record<string, unknown>>
  ): Array<{
    pageId: string;
    name: string;
    tasksJson: string[];
    source: TenantPageSource;
  }> {
    return pages
      .filter((page) => page.id)
      .map((page) => {
        const tasks = parseArrayOfStrings(page.tasks);
        const perms = parseArrayOfStrings(page.perms);
        return {
          pageId: String(page.id),
          name: String(page.name || page.id),
          tasksJson: tasks.length > 0 ? tasks : perms,
          source: TenantPageSource.FALLBACK_UNVERIFIED,
        };
      });
  }

  private mapAssignedPages(
    pages: Array<Record<string, unknown>>
  ): Array<{
    pageId: string;
    name: string;
    tasksJson: string[];
    source: TenantPageSource;
  }> {
    return pages
      .filter((page) => page.id)
      .map((page) => {
        const permittedTasks = parseArrayOfStrings(page.permitted_tasks);
        const tasks = parseArrayOfStrings(page.tasks);
        return {
          pageId: String(page.id),
          name: String(page.name || page.id),
          tasksJson: permittedTasks.length > 0 ? permittedTasks : tasks,
          source: TenantPageSource.FALLBACK_UNVERIFIED,
        };
      });
  }

  private mapAdAccounts(
    accounts: Array<Record<string, unknown>>
  ): Array<{
    adAccountId: string;
    name: string;
    status: string;
    currency: string;
    timezoneName: string;
  }> {
    return accounts
      .filter((account) => account.id)
      .map((account) => ({
        adAccountId: normalizeAdAccountId(String(account.id)),
        name: String(account.name || account.id),
        status: String(account.account_status || ''),
        currency: String(account.currency || ''),
        timezoneName: String(account.timezone_name || ''),
      }));
  }

  private extractBusinessIds(value: unknown): string[] {
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    const values: string[] = [];

    const pushBusinessId = (entry: unknown): void => {
      if (typeof entry === 'string') {
        const value = entry.trim();
        if (value) values.push(value);
        return;
      }
      if (entry && typeof entry === 'object') {
        const id = String((entry as Record<string, unknown>).id || '').trim();
        if (id) values.push(id);
      }
    };

    pushBusinessId(record.business);
    pushBusinessId(record.owned_business);
    pushBusinessId(record.owner_business);

    return Array.from(new Set(values));
  }

  private async filterFallbackPagesByBusiness(
    ctx: RequestContext,
    pages: Array<{
      pageId: string;
      name: string;
      tasksJson: string[];
      source: TenantPageSource;
    }>,
    businessId: string
  ): Promise<
    Array<{
      pageId: string;
      name: string;
      tasksJson: string[];
      source: TenantPageSource;
    }>
  > {
    const pageRows: Array<{
      pageId: string;
      name: string;
      tasksJson: string[];
      source: TenantPageSource;
    }> = [];
    const concurrency = 8;

    for (let index = 0; index < pages.length; index += concurrency) {
      const batch = pages.slice(index, index + concurrency);
      const batchResult = await Promise.all(
        batch.map(async (page) => {
          try {
            const response = await this.graphClient.request<Record<string, unknown>>(ctx, {
              method: 'GET',
              path: page.pageId,
              query: { fields: 'business{id},owned_business{id},owner_business{id}' },
            });
            const resolvedBusinessIds = this.extractBusinessIds(response.data);
            if (resolvedBusinessIds.includes(businessId)) {
              return page;
            }

            // For partner-shared pages, owner business may differ; check agency linkage.
            const agenciesResponse = await this.graphClient.request<{
              data?: Array<Record<string, unknown>>;
            }>(ctx, {
              method: 'GET',
              path: `${page.pageId}/agencies`,
              query: { fields: 'id', limit: 200 },
            });
            const agencies = agenciesResponse.data.data || [];
            const hasMatchingAgency = agencies.some(
              (agency) => String(agency.id || '').trim() === businessId
            );
            if (hasMatchingAgency) {
              return page;
            }

            // Final page-level check: if business has assigned users on this page, treat as scoped.
            const assignedUsersResponse = await this.graphClient.request<{
              data?: Array<Record<string, unknown>>;
            }>(ctx, {
              method: 'GET',
              path: `${page.pageId}/assigned_users`,
              query: { business: businessId, fields: 'id', limit: 1 },
            });
            const assignedUsers = assignedUsersResponse.data.data || [];
            return assignedUsers.length > 0 ? page : null;
          } catch (error) {
            logger.warn('Failed to resolve page business during fallback filtering', {
              tenantId: ctx.tenantId,
              businessId,
              pageId: page.pageId,
              error: error instanceof Error ? error.message : String(error),
            });
            return null;
          }
        })
      );
      for (const candidate of batchResult) {
        if (candidate) {
          pageRows.push(candidate);
        }
      }
    }

    return pageRows;
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

  async listTenantPages(ctx: RequestContext): Promise<TenantPageView[]> {
    const rows = await prisma.tenantPage.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ source: 'asc' }, { name: 'asc' }, { pageId: 'asc' }],
    });

    return rows.map((row) => ({
      id: row.pageId,
      name: row.name || row.pageId,
      canPromote: row.source !== TenantPageSource.FALLBACK_UNVERIFIED,
      source: row.source,
      confirmed: row.source !== TenantPageSource.FALLBACK_UNVERIFIED,
      tasks: parseArrayOfStrings(row.tasksJson),
      lastSeenAt: row.lastSeenAt,
    }));
  }

  async getPages(ctx: RequestContext, _params: GetPagesParams): Promise<FacebookPage[]> {
    const pages = await this.listTenantPages(ctx);
    return pages.map((page) => ({
      id: page.id,
      name: page.name,
      category: page.source,
      tasks: page.tasks,
      createdAt: page.lastSeenAt,
    }));
  }

  async syncTenantAssets(ctx: RequestContext, businessIdOverride?: string): Promise<SyncTenantAssetsResult> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { businessId: true },
    });
    const businessId = businessIdOverride?.trim() || tenant?.businessId?.trim();
    if (!businessId) {
      throw new Error(
        `Tenant ${ctx.tenantId} does not have a businessId configured. Set tenant.businessId before sync.`
      );
    }

    let fallbackPagesUsed = false;
    let pagesDiscoveryStrategy: SyncTenantAssetsResult['pagesDiscoveryStrategy'] = 'none';
    let adAccountsDiscoveryStrategy: SyncTenantAssetsResult['adAccountsDiscoveryStrategy'] = 'none';
    let pageRows: Array<{
      pageId: string;
      name: string;
      tasksJson: string[];
      source: TenantPageSource;
    }> = [];
    try {
      const response = await this.graphClient.request<{ data?: Array<Record<string, unknown>> }>(ctx, {
        method: 'GET',
        path: `${businessId}/owned_pages`,
        query: { fields: 'id,name', limit: 200 },
      });
      pageRows = this.mapBusinessPages(response.data.data || [], TenantPageSource.BUSINESS_OWNED);
      if (pageRows.length > 0) {
        pagesDiscoveryStrategy = 'owned_pages';
      }
    } catch (ownedPagesError) {
      logger.warn('owned_pages lookup failed', {
        tenantId: ctx.tenantId,
        businessId,
        error: ownedPagesError instanceof Error ? ownedPagesError.message : String(ownedPagesError),
      });
    }

    if (pageRows.length === 0) {
      try {
        const response = await this.graphClient.request<{ data?: Array<Record<string, unknown>> }>(ctx, {
          method: 'GET',
          path: `${businessId}/client_pages`,
          query: { fields: 'id,name', limit: 200 },
        });
        pageRows = this.mapBusinessPages(response.data.data || [], TenantPageSource.BUSINESS_OWNED);
        if (pageRows.length > 0) {
          pagesDiscoveryStrategy = 'client_pages';
        }
      } catch (clientPagesError) {
        logger.warn('client_pages lookup failed', {
          tenantId: ctx.tenantId,
          businessId,
          error: clientPagesError instanceof Error ? clientPagesError.message : String(clientPagesError),
        });
      }
    }

    if (pageRows.length === 0) {
      fallbackPagesUsed = true;
      try {
        const fallback = await this.graphClient.request<{ data?: Array<Record<string, unknown>> }>(ctx, {
          method: 'GET',
          path: 'me/accounts',
          query: { fields: 'id,name,tasks,perms', limit: 200 },
        });
        const candidatePages = this.mapFallbackPages(fallback.data.data || []);
        pageRows = await this.filterFallbackPagesByBusiness(ctx, candidatePages, businessId);
        if (pageRows.length > 0) {
          pagesDiscoveryStrategy = 'me_accounts_filtered';
        }
      } catch (fallbackPagesError) {
        logger.warn('me/accounts fallback lookup failed', {
          tenantId: ctx.tenantId,
          businessId,
          error: fallbackPagesError instanceof Error ? fallbackPagesError.message : String(fallbackPagesError),
        });
      }
    }

    if (pageRows.length === 0) {
      fallbackPagesUsed = true;
      try {
        const assignedPages = await this.graphClient.request<{ data?: Array<Record<string, unknown>> }>(ctx, {
          method: 'GET',
          path: 'me/assigned_pages',
          query: { business: businessId, fields: 'id,name,permitted_tasks,tasks', limit: 200 },
        });
        pageRows = this.mapAssignedPages(assignedPages.data.data || []);
        if (pageRows.length > 0) {
          pagesDiscoveryStrategy = 'me_accounts_filtered';
        }
      } catch (assignedPagesError) {
        logger.warn('me/assigned_pages fallback lookup failed', {
          tenantId: ctx.tenantId,
          businessId,
          error: assignedPagesError instanceof Error ? assignedPagesError.message : String(assignedPagesError),
        });
      }
    }

    let adAccountRows: Array<{
      adAccountId: string;
      name: string;
      status: string;
      currency: string;
      timezoneName: string;
    }> = [];
    try {
      const response = await this.graphClient.request<{ data?: Array<Record<string, unknown>> }>(ctx, {
        method: 'GET',
        path: `${businessId}/owned_ad_accounts`,
        query: {
          fields: 'id,name,account_status,currency,timezone_name',
          limit: 200,
        },
      });
      adAccountRows = this.mapAdAccounts(response.data.data || []);
      if (adAccountRows.length > 0) {
        adAccountsDiscoveryStrategy = 'owned_ad_accounts';
      }
    } catch (ownedAdAccountsError) {
      logger.warn('owned_ad_accounts lookup failed', {
        tenantId: ctx.tenantId,
        businessId,
        error:
          ownedAdAccountsError instanceof Error
            ? ownedAdAccountsError.message
            : String(ownedAdAccountsError),
      });
    }

    if (adAccountRows.length === 0) {
      try {
        const fallback = await this.graphClient.request<{ data?: Array<Record<string, unknown>> }>(ctx, {
          method: 'GET',
          path: `${businessId}/client_ad_accounts`,
          query: {
            fields: 'id,name,account_status,currency,timezone_name',
            limit: 200,
          },
        });
        adAccountRows = this.mapAdAccounts(fallback.data.data || []);
        if (adAccountRows.length > 0) {
          adAccountsDiscoveryStrategy = 'client_ad_accounts';
        }
      } catch (clientAdAccountsError) {
        logger.warn('client_ad_accounts lookup failed', {
          tenantId: ctx.tenantId,
          businessId,
          error:
            clientAdAccountsError instanceof Error
              ? clientAdAccountsError.message
              : String(clientAdAccountsError),
        });
      }
    }

    if (adAccountRows.length === 0) {
      try {
        const fallback = await this.graphClient.request<{ data?: Array<Record<string, unknown>> }>(ctx, {
          method: 'GET',
          path: 'me/adaccounts',
          query: {
            fields: 'id,name,account_status,currency,timezone_name,business{id}',
            limit: 200,
          },
        });
        adAccountRows = this.mapAdAccounts(
          (fallback.data.data || []).filter(
            (account) => this.extractBusinessIds(account).includes(businessId)
          )
        );
        if (adAccountRows.length > 0) {
          adAccountsDiscoveryStrategy = 'me_adaccounts_filtered';
        }
      } catch (fallbackAdAccountsError) {
        logger.warn('me/adaccounts fallback lookup failed', {
          tenantId: ctx.tenantId,
          businessId,
          error:
            fallbackAdAccountsError instanceof Error
              ? fallbackAdAccountsError.message
              : String(fallbackAdAccountsError),
        });
      }
    }

    logger.info('Tenant asset sync discovery summary', {
      tenantId: ctx.tenantId,
      businessId,
      pagesDiscoveryStrategy,
      adAccountsDiscoveryStrategy,
      fallbackPagesUsed,
      pagesSynced: pageRows.length,
      adAccountsSynced: adAccountRows.length,
    });

    const now = new Date();
    const existingPageSources = await prisma.tenantPage.findMany({
      where: { tenantId: ctx.tenantId },
      select: { pageId: true, source: true },
    });
    const pageSourceById = new Map(existingPageSources.map((page) => [page.pageId, page.source]));

    await prisma.$transaction(async (tx) => {
      for (const page of pageRows) {
        const nextSource = parsePageSource(pageSourceById.get(page.pageId), page.source);
        await tx.tenantPage.upsert({
          where: {
            tenantId_pageId: {
              tenantId: ctx.tenantId,
              pageId: page.pageId,
            },
          },
          update: {
            name: page.name,
            tasksJson: page.tasksJson,
            source: nextSource,
            lastSeenAt: now,
          },
          create: {
            tenantId: ctx.tenantId,
            pageId: page.pageId,
            name: page.name,
            tasksJson: page.tasksJson,
            source: nextSource,
            lastSeenAt: now,
          },
        });
      }

      for (const adAccount of adAccountRows) {
        await tx.tenantAdAccount.upsert({
          where: {
            tenantId_adAccountId: {
              tenantId: ctx.tenantId,
              adAccountId: adAccount.adAccountId,
            },
          },
          update: {
            name: adAccount.name,
            status: adAccount.status,
            currency: adAccount.currency,
            timezoneName: adAccount.timezoneName,
            lastSyncedAt: now,
          },
          create: {
            tenantId: ctx.tenantId,
            adAccountId: adAccount.adAccountId,
            name: adAccount.name,
            status: adAccount.status,
            currency: adAccount.currency,
            timezoneName: adAccount.timezoneName,
            lastSyncedAt: now,
          },
        });
      }
    });

    const confirmedPages = await prisma.tenantPage.findMany({
      where: {
        tenantId: ctx.tenantId,
        NOT: { source: TenantPageSource.FALLBACK_UNVERIFIED },
      },
      select: { pageId: true },
    });
    let autoAssignedDefaultPageId: string | null = null;
    if (confirmedPages.length === 1 && adAccountRows.length > 0) {
      autoAssignedDefaultPageId = confirmedPages[0].pageId;
      const accountIds = adAccountRows.map((row) => row.adAccountId);
      await prisma.adAccountSettings.createMany({
        data: accountIds.map((adAccountId) => ({
          tenantId: ctx.tenantId,
          adAccountId,
          defaultPageId: autoAssignedDefaultPageId,
        })),
        skipDuplicates: true,
      });
      await prisma.adAccountSettings.updateMany({
        where: {
          tenantId: ctx.tenantId,
          adAccountId: { in: accountIds },
          defaultPageId: null,
        },
        data: { defaultPageId: autoAssignedDefaultPageId },
      });
    }

    return {
      tenantId: ctx.tenantId,
      businessId,
      fallbackPagesUsed,
      pagesSynced: pageRows.length,
      adAccountsSynced: adAccountRows.length,
      pagesDiscoveryStrategy,
      adAccountsDiscoveryStrategy,
      autoAssignedDefaultPageId,
    };
  }

  async confirmFallbackPageSelection(ctx: RequestContext, pageId: string): Promise<void> {
    await prisma.tenantPage.updateMany({
      where: {
        tenantId: ctx.tenantId,
        pageId,
        source: TenantPageSource.FALLBACK_UNVERIFIED,
      },
      data: {
        source: TenantPageSource.FALLBACK_CONFIRMED,
        lastSeenAt: new Date(),
      },
    });
  }

  async getPromotablePages(
    ctx: RequestContext,
    accountId: string
  ): Promise<Array<{ id: string; name: string; canPromote: boolean }>> {
    const allowedPages = await this.listTenantPages(ctx);
    const allowedPageIds = new Set(allowedPages.map((page) => page.id));
    const allowedPageById = new Map(allowedPages.map((page) => [page.id, page]));
    const cleanAccountId = normalizeAdAccountId(accountId).replace('act_', '');
    let pages: Array<Record<string, unknown>> = [];
    try {
      // Informational hint only. Never block ad/adset creation on this edge.
      const response = await this.graphClient.request<{ data?: Array<Record<string, unknown>> }>(ctx, {
        method: 'GET',
        path: `act_${cleanAccountId}/promote_pages`,
        query: { fields: 'id,name', limit: 100 },
      });
      pages = response.data.data || [];
    } catch {
      try {
        const fallback = await this.graphClient.request<{ data?: Array<Record<string, unknown>> }>(ctx, {
          method: 'GET',
          path: `act_${cleanAccountId}/promotable_pages`,
          query: { fields: 'id,name', limit: 100 },
        });
        pages = fallback.data.data || [];
      } catch {
        pages = [];
      }
    }

    // Never return pages outside tenant DB allowlist.
    const filtered = pages
      .map((page) => ({
        id: String(page.id || ''),
        name: String(page.name || ''),
      }))
      .filter((page) => page.id && allowedPageIds.has(page.id));

    if (filtered.length > 0) {
      return filtered.map((page) => {
        const allowed = allowedPageById.get(page.id);
        return {
          id: page.id,
          name: page.name || allowed?.name || page.id,
          canPromote: Boolean(allowed?.confirmed),
        };
      });
    }

    // When Graph edge is empty/unreliable, return tenant-allowed pages as informational fallback.
    return allowedPages.map((page) => ({
      id: page.id,
      name: page.name,
      canPromote: page.confirmed,
    }));
  }
}
