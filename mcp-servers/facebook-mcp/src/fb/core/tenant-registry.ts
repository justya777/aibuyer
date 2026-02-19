import { TenantIsolationError } from './types.js';
import { prisma } from '../../db/prisma.js';

function normalizeAdAccountId(adAccountId: string): string {
  return adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
}

export class TenantRegistry {
  async assertTenantAccessible(
    tenantId: string,
    userId?: string,
    isPlatformAdmin = false
  ): Promise<void> {
    if (isPlatformAdmin) {
      const exists = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
      });
      if (!exists) {
        throw new TenantIsolationError(`Tenant ${tenantId} was not found.`);
      }
      return;
    }

    if (!userId) {
      throw new TenantIsolationError('userId is required for tenant access checks.');
    }

    const membership = await prisma.tenantMember.findUnique({
      where: {
        userId_tenantId: {
          userId,
          tenantId,
        },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new TenantIsolationError(`User ${userId} is not a member of tenant ${tenantId}.`);
    }
  }

  async hasTenant(tenantId: string): Promise<boolean> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    return Boolean(tenant);
  }

  async listTenantIds(userId?: string, isPlatformAdmin = false): Promise<string[]> {
    if (isPlatformAdmin) {
      const tenants = await prisma.tenant.findMany({ select: { id: true } });
      return tenants.map((tenant) => tenant.id);
    }

    if (!userId) return [];
    const memberships = await prisma.tenantMember.findMany({
      where: { userId },
      select: { tenantId: true },
    });
    return memberships.map((membership) => membership.tenantId);
  }

  async getAllowedAdAccountIds(
    tenantId: string,
    userId?: string,
    isPlatformAdmin = false
  ): Promise<string[]> {
    await this.assertTenantAccessible(tenantId, userId, isPlatformAdmin);
    const assets = await prisma.tenantAsset.findMany({
      where: { tenantId },
      select: { adAccountId: true },
    });
    return assets.map((asset) => normalizeAdAccountId(asset.adAccountId));
  }

  async isAdAccountAllowed(
    tenantId: string,
    adAccountId: string,
    userId?: string,
    isPlatformAdmin = false
  ): Promise<boolean> {
    await this.assertTenantAccessible(tenantId, userId, isPlatformAdmin);
    const normalized = normalizeAdAccountId(adAccountId);
    const asset = await prisma.tenantAsset.findUnique({
      where: {
        tenantId_adAccountId: {
          tenantId,
          adAccountId: normalized,
        },
      },
      select: { id: true },
    });
    return Boolean(asset);
  }

  async assertAdAccountAllowed(
    tenantId: string,
    adAccountId: string,
    userId?: string,
    isPlatformAdmin = false
  ): Promise<void> {
    const allowed = await this.isAdAccountAllowed(tenantId, adAccountId, userId, isPlatformAdmin);
    if (!allowed) {
      throw new TenantIsolationError(
        `Tenant ${tenantId} is not allowed to access ad account ${normalizeAdAccountId(adAccountId)}`
      );
    }
  }

  async inferTenantIdByAdAccount(
    adAccountId: string,
    userId?: string,
    isPlatformAdmin = false
  ): Promise<string | undefined> {
    const normalized = normalizeAdAccountId(adAccountId);
    const matches = await prisma.tenantAsset.findMany({
      where: isPlatformAdmin
        ? { adAccountId: normalized }
        : {
            adAccountId: normalized,
            tenant: userId ? { members: { some: { userId } } } : undefined,
          },
      select: { tenantId: true },
    });
    const tenantIds = matches.map((match) => match.tenantId);

    if (tenantIds.length === 1) {
      return tenantIds[0];
    }

    if (tenantIds.length > 1) {
      throw new TenantIsolationError(
        `Ad account ${normalized} is mapped to multiple tenants. Explicit tenantId is required.`
      );
    }

    return undefined;
  }
}

export { normalizeAdAccountId };
