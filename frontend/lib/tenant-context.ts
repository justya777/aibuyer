import { NextRequest } from 'next/server';
import { db } from './db';
import { getServerAuthSession } from './auth';

export interface TenantRequestContext {
  userId: string;
  tenantId: string;
  isPlatformAdmin: boolean;
}

export class AuthRequiredError extends Error {}
export class TenantAccessError extends Error {}

export async function resolveTenantContext(
  request: NextRequest,
  options: { allowAdminCrossTenant?: boolean } = {}
): Promise<TenantRequestContext> {
  const session = await getServerAuthSession();
  const user = session?.user;

  if (!user?.id) {
    throw new AuthRequiredError('Authentication required.');
  }

  const isPlatformAdmin = user.role === 'ADMIN';
  const tenantFromHeader = request.headers.get('x-tenant-id')?.trim();
  const tenantId = tenantFromHeader || user.activeTenantId || '';

  if (!tenantId) {
    throw new TenantAccessError('No active tenant selected.');
  }

  if (!isPlatformAdmin || !options.allowAdminCrossTenant) {
    const membership = await db.tenantMember.findUnique({
      where: {
        userId_tenantId: {
          userId: user.id,
          tenantId,
        },
      },
      select: { id: true },
    });

    if (!membership && !isPlatformAdmin) {
      throw new TenantAccessError('Tenant access denied.');
    }
  }

  if (user.activeTenantId !== tenantId) {
    await db.user.update({
      where: { id: user.id },
      data: { activeTenantId: tenantId },
    });
  }

  return {
    userId: user.id,
    tenantId,
    isPlatformAdmin,
  };
}

export async function requirePlatformAdmin(): Promise<{ userId: string }> {
  const session = await getServerAuthSession();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    throw new AuthRequiredError('Platform admin required.');
  }
  return { userId: session.user.id };
}
