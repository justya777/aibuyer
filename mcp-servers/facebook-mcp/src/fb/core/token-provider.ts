import type { RequestContext } from './types.js';
import { TenantRegistry } from './tenant-registry.js';

export interface TokenProvider {
  getToken(ctx: RequestContext): Promise<string>;
}

export class EnvTokenProvider implements TokenProvider {
  private readonly tenantTokenMap: Record<string, string>;
  private readonly tenantRegistry: TenantRegistry;

  constructor(tenantTokenMap: Record<string, string>, tenantRegistry: TenantRegistry) {
    this.tenantTokenMap = tenantTokenMap;
    this.tenantRegistry = tenantRegistry;
  }

  async getToken(ctx: RequestContext): Promise<string> {
    const directToken = this.tenantTokenMap[ctx.tenantId];
    if (directToken) {
      return directToken;
    }

    const tokenRef = this.tenantRegistry.getSystemUserTokenRef(ctx.tenantId);
    if (!tokenRef) {
      throw new Error(
        `No token mapping found for tenant ${ctx.tenantId}. Configure TENANT_SU_TOKEN_MAP and TENANT_ACCESS_MAP.`
      );
    }

    const tokenByRef = this.tenantTokenMap[tokenRef];
    if (!tokenByRef) {
      throw new Error(
        `No token found for tokenRef ${tokenRef} (tenant ${ctx.tenantId}) in TENANT_SU_TOKEN_MAP.`
      );
    }

    return tokenByRef;
  }
}
