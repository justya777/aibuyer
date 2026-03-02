import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

const DisconnectSchema = z.object({
  businessId: z.string().min(1),
});

async function assertTenantAdmin(userId: string, tenantId: string, isPlatformAdmin: boolean): Promise<void> {
  if (isPlatformAdmin) return;
  const membership = await db.tenantMember.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true },
  });
  if (!membership || membership.role !== 'ADMIN') {
    throw new TenantAccessError('Only tenant admins can manage Meta connections.');
  }
}

function handleError(error: unknown): NextResponse {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { success: false, error: 'Invalid payload.', details: error.flatten() },
      { status: 400 }
    );
  }
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 401 });
  }
  if (error instanceof TenantAccessError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }
  return NextResponse.json(
    { success: false, error: 'Failed to disconnect Meta account.' },
    { status: 500 }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const context = await resolveTenantContext(request, { allowAdminCrossTenant: true });
    if (!context.isPlatformAdmin && context.tenantId !== tenantId) {
      throw new TenantAccessError('Tenant access denied.');
    }
    await assertTenantAdmin(context.userId, tenantId, context.isPlatformAdmin);

    const payload = DisconnectSchema.parse(await request.json());
    const { businessId } = payload;

    const credential = await db.metaCredential.findUnique({
      where: { tenantId_businessId: { tenantId, businessId } },
      select: { id: true },
    });

    if (!credential) {
      return NextResponse.json(
        { success: false, error: 'No Meta credential found for this business.' },
        { status: 404 }
      );
    }

    await db.metaCredential.update({
      where: { tenantId_businessId: { tenantId, businessId } },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({ success: true, tenantId, businessId });
  } catch (error) {
    return handleError(error);
  }
}
