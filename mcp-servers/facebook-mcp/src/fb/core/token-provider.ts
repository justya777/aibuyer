import type { RequestContext } from './types.js';
import { prisma } from '../../db/prisma.js';
import { decryptToken } from '../../security/token-encryption.js';

export interface TokenProvider {
  getToken(ctx: RequestContext): Promise<string>;
}

// ---------------------------------------------------------------------------
// DB-backed token provider (primary)
// ---------------------------------------------------------------------------

export class TenantNotConnectedError extends Error {
  readonly code = 'TENANT_NOT_CONNECTED';
  readonly http = 422;

  constructor(tenantId: string) {
    super('Tenant has not connected a Meta Business Portfolio.');
    this.name = 'TenantNotConnectedError';
  }
}

export class DbTokenProvider implements TokenProvider {
  async getToken(ctx: RequestContext): Promise<string> {
    const credential = await prisma.metaCredential.findFirst({
      where: {
        tenantId: ctx.tenantId,
        ...(ctx.businessId ? { businessId: ctx.businessId } : {}),
        revokedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { tokenEncrypted: true },
    });

    if (!credential) {
      throw new TenantNotConnectedError(ctx.tenantId);
    }

    return decryptToken(credential.tokenEncrypted);
  }
}

// ---------------------------------------------------------------------------
// ENV-based token provider (legacy fallback)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Composite provider: DB first, then env fallback
// ---------------------------------------------------------------------------

export class CompositeTokenProvider implements TokenProvider {
  private readonly providers: TokenProvider[];

  constructor(providers: TokenProvider[]) {
    this.providers = providers;
  }

  async getToken(ctx: RequestContext): Promise<string> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        return await provider.getToken(ctx);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }
}
