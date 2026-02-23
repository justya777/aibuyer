import { TenantRegistry } from './tenant-registry.js';
import type { RequestContext } from './types.js';

interface AssetIsolationInput {
  adAccountId?: string;
  pageId?: string;
}

export class IsolationGate {
  private readonly tenantRegistry: TenantRegistry;

  constructor(tenantRegistry: TenantRegistry = new TenantRegistry()) {
    this.tenantRegistry = tenantRegistry;
  }

  async assertTenantAccess(ctx: RequestContext): Promise<void> {
    await this.tenantRegistry.assertTenantAccessible(
      ctx.tenantId,
      ctx.userId,
      Boolean(ctx.isPlatformAdmin)
    );
  }

  async assertAssetAccess(ctx: RequestContext, input: AssetIsolationInput): Promise<void> {
    await this.assertTenantAccess(ctx);
    if (input.adAccountId) {
      await this.tenantRegistry.assertAdAccountAllowed(
        ctx.tenantId,
        input.adAccountId,
        ctx.userId,
        Boolean(ctx.isPlatformAdmin)
      );
    }
    if (input.pageId) {
      await this.tenantRegistry.assertPageAllowed(
        ctx.tenantId,
        input.pageId,
        ctx.userId,
        Boolean(ctx.isPlatformAdmin)
      );
    }
  }

  async inferTenantIdByAdAccount(
    adAccountId: string,
    userId?: string,
    isPlatformAdmin?: boolean
  ): Promise<string | undefined> {
    return this.tenantRegistry.inferTenantIdByAdAccount(adAccountId, userId, Boolean(isPlatformAdmin));
  }
}
