import { TenantPageSource } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { normalizeAdAccountId, normalizePageId, TenantRegistry } from './tenant-registry.js';
import type { RequestContext } from './types.js';

interface PageResolverDbClient {
  adAccountSettings: {
    findUnique: (args: unknown) => Promise<{ defaultPageId: string | null } | null>;
  };
  tenantPage: {
    findMany: (args: unknown) => Promise<Array<{ pageId: string }>>;
  };
}

export class PageResolutionError extends Error {
  readonly code = 'DEFAULT_PAGE_REQUIRED';

  constructor(message = 'Select a default Page for this ad account') {
    super(message);
    this.name = 'PageResolutionError';
  }
}

export class PageResolver {
  private readonly tenantRegistry: TenantRegistry;
  private readonly dbClient: PageResolverDbClient;

  constructor(
    tenantRegistry: TenantRegistry = new TenantRegistry(),
    dbClient: PageResolverDbClient = prisma as unknown as PageResolverDbClient
  ) {
    this.tenantRegistry = tenantRegistry;
    this.dbClient = dbClient;
  }

  async resolvePageId(
    ctx: RequestContext,
    adAccountId: string,
    explicitPageId?: string | null
  ): Promise<string> {
    const normalizedAdAccountId = normalizeAdAccountId(adAccountId);
    await this.tenantRegistry.assertAdAccountAllowed(
      ctx.tenantId,
      normalizedAdAccountId,
      ctx.userId,
      Boolean(ctx.isPlatformAdmin)
    );

    if (explicitPageId?.trim()) {
      const normalizedExplicitPageId = normalizePageId(explicitPageId);
      await this.tenantRegistry.assertPageAllowed(
        ctx.tenantId,
        normalizedExplicitPageId,
        ctx.userId,
        Boolean(ctx.isPlatformAdmin)
      );
      return normalizedExplicitPageId;
    }

    const settings = await this.dbClient.adAccountSettings.findUnique({
      where: {
        tenantId_adAccountId: {
          tenantId: ctx.tenantId,
          adAccountId: normalizedAdAccountId,
        },
      },
      select: { defaultPageId: true },
    });
    if (settings?.defaultPageId) {
      await this.tenantRegistry.assertPageAllowed(
        ctx.tenantId,
        settings.defaultPageId,
        ctx.userId,
        Boolean(ctx.isPlatformAdmin)
      );
      return settings.defaultPageId;
    }

    const confirmedPages = await this.dbClient.tenantPage.findMany({
      where: {
        tenantId: ctx.tenantId,
        NOT: { source: TenantPageSource.FALLBACK_UNVERIFIED },
      },
      select: { pageId: true },
    });
    if (confirmedPages.length === 1) {
      return confirmedPages[0].pageId;
    }

    throw new PageResolutionError('Select a default Page for this ad account');
  }
}
