import type { RequestContext } from './types.js';

export interface TokenProvider {
  getToken(ctx: RequestContext): Promise<string>;
}

interface EnvTokenProviderOptions {
  tenantTokenMapRaw?: string;
  globalToken?: string;
}

function parseTenantTokenMap(raw: string | undefined): Map<string, string> {
  if (!raw) return new Map<string, string>();
  const parsed = JSON.parse(raw) as Record<string, string>;
  const map = new Map<string, string>();
  for (const [tenantId, token] of Object.entries(parsed)) {
    const normalizedTenantId = tenantId.trim();
    const normalizedToken = token.trim();
    if (!normalizedTenantId || !normalizedToken) continue;
    map.set(normalizedTenantId, normalizedToken);
  }
  return map;
}

export class EnvTokenProvider implements TokenProvider {
  private readonly tenantTokens: Map<string, string>;
  private readonly globalToken?: string;

  constructor(options: EnvTokenProviderOptions) {
    this.tenantTokens = parseTenantTokenMap(options.tenantTokenMapRaw);
    this.globalToken = options.globalToken?.trim() || undefined;
  }

  async getToken(ctx: RequestContext): Promise<string> {
    const tenantToken = this.tenantTokens.get(ctx.tenantId);
    if (tenantToken) {
      return tenantToken;
    }
    if (this.globalToken) {
      return this.globalToken;
    }
    throw new Error(
      `No Meta system user token configured for tenant ${ctx.tenantId}. Set TENANT_SU_TOKEN_MAP or GLOBAL_SYSTEM_USER_TOKEN.`
    );
  }
}
