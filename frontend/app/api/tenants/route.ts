import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerAuthSession } from '@/lib/auth';

export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
  }

  const memberships = await db.tenantMember.findMany({
    where: { userId: session.user.id },
    include: {
      tenant: {
        select: { id: true, name: true, createdAt: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({
    success: true,
    activeTenantId: session.user.activeTenantId,
    tenants: memberships.map((membership) => ({
      id: membership.tenant.id,
      name: membership.tenant.name,
      createdAt: membership.tenant.createdAt,
      membershipRole: membership.role,
    })),
  });
}
