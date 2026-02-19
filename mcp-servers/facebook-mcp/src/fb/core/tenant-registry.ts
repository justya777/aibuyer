import type { TenantAccessConfig } from '../../config/env.js';
import { TenantIsolationError } from './types.js';

function normalizeAdAccountId(adAccountId: string): string {
  return adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
}

export class TenantRegistry {
  private readonly tenantAccessMap: Record<string, TenantAccessConfig>;

  constructor(tenantAccessMap: Record<string, TenantAccessConfig>) {
    this.tenantAccessMap = tenantAccessMap;
  }

  getTenantConfig(tenantId: string): TenantAccessConfig | undefined {
    return this.tenantAccessMap[tenantId];
  }

  getAllowedAdAccountIds(tenantId: string): string[] {
    const cfg = this.getTenantConfig(tenantId);
    return cfg?.allowedAdAccountIds || [];
  }

  getSystemUserTokenRef(tenantId: string): string | undefined {
    return this.getTenantConfig(tenantId)?.systemUserTokenRef;
  }

  hasTenant(tenantId: string): boolean {
    return Boolean(this.getTenantConfig(tenantId));
  }

  listTenantIds(): string[] {
    return Object.keys(this.tenantAccessMap);
  }

  isAdAccountAllowed(tenantId: string, adAccountId: string): boolean {
    const cfg = this.getTenantConfig(tenantId);
    if (!cfg) return false;

    const normalized = normalizeAdAccountId(adAccountId);
    return cfg.allowedAdAccountIds.includes(normalized);
  }

  assertAdAccountAllowed(tenantId: string, adAccountId: string): void {
    if (!this.isAdAccountAllowed(tenantId, adAccountId)) {
      throw new TenantIsolationError(
        `Tenant ${tenantId} is not allowed to access ad account ${normalizeAdAccountId(adAccountId)}`
      );
    }
  }

  inferTenantIdByAdAccount(adAccountId: string): string | undefined {
    const normalized = normalizeAdAccountId(adAccountId);
    const matches = Object.entries(this.tenantAccessMap)
      .filter(([, cfg]) => cfg.allowedAdAccountIds.includes(normalized))
      .map(([tenantId]) => tenantId);

    if (matches.length === 1) {
      return matches[0];
    }

    if (matches.length > 1) {
      throw new TenantIsolationError(
        `Ad account ${normalized} is mapped to multiple tenants. Explicit tenantId is required.`
      );
    }

    return undefined;
  }
}

export { normalizeAdAccountId };
