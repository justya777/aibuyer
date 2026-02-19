import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getServerAuthSession } from '@/lib/auth';

const ActiveTenantSchema = z.object({
  tenantId: z.string().min(1),
});

export async function PUT(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tenantId } = ActiveTenantSchema.parse(body);
    const isPlatformAdmin = session.user.role === 'ADMIN';

    if (!isPlatformAdmin) {
      const membership = await db.tenantMember.findUnique({
        where: {
          userId_tenantId: {
            userId: session.user.id,
            tenantId,
          },
        },
        select: { id: true },
      });

      if (!membership) {
        return NextResponse.json(
          { success: false, error: 'Tenant access denied.' },
          { status: 403 }
        );
      }
    }

    await db.user.update({
      where: { id: session.user.id },
      data: { activeTenantId: tenantId },
    });

    return NextResponse.json({ success: true, tenantId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid payload.', details: error.flatten() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update tenant.' },
      { status: 500 }
    );
  }
}
