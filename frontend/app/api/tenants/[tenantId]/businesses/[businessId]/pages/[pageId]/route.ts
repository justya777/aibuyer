import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  AuthRequiredError,
  TenantAccessError,
  resolveTenantContext,
} from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

async function assertTenantAdmin(
  userId: string,
  tenantId: string,
  isPlatformAdmin: boolean
): Promise<void> {
  if (isPlatformAdmin) return;
  const membership = await db.tenantMember.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true },
  });
  if (!membership || membership.role !== 'ADMIN') {
    throw new TenantAccessError('Only tenant admins can remove pages.');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { tenantId: string; businessId: string; pageId: string } }
) {
  try {
    const { tenantId, businessId, pageId } = params;
    const context = await resolveTenantContext(request, { allowAdminCrossTenant: true });
    if (!context.isPlatformAdmin && context.tenantId !== tenantId) {
      throw new TenantAccessError('Tenant access denied.');
    }
    await assertTenantAdmin(context.userId, tenantId, context.isPlatformAdmin);

    const page = await db.tenantPage.findFirst({
      where: { tenantId, businessId, pageId },
    });
    if (!page) {
      return NextResponse.json(
        { success: false, error: 'Page not found in this business portfolio.' },
        { status: 404 }
      );
    }

    await db.tenantPage.updateMany({
      where: { tenantId, businessId, pageId },
      data: { businessId: null },
    });

    await db.auditLog.create({
      data: {
        tenantId,
        userId: context.userId,
        action: 'REMOVE_PAGE',
        assetId: pageId,
        summary: `Detached page ${page.name || pageId} from BP ${businessId}`,
        result: 'SUCCESS',
        metadata: {
          businessId,
          pageId,
          pageName: page.name,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Page removed from business portfolio.',
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
