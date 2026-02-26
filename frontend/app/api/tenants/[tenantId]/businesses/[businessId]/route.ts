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
    throw new TenantAccessError('Only tenant admins can delete business portfolios.');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { tenantId: string; businessId: string } }
) {
  try {
    const { tenantId, businessId } = params;
    const context = await resolveTenantContext(request, { allowAdminCrossTenant: true });
    if (!context.isPlatformAdmin && context.tenantId !== tenantId) {
      throw new TenantAccessError('Tenant access denied.');
    }
    await assertTenantAdmin(context.userId, tenantId, context.isPlatformAdmin);

    const bp = await db.businessPortfolio.findFirst({
      where: { tenantId, businessId, deletedAt: null },
    });
    if (!bp) {
      return NextResponse.json(
        { success: false, error: 'Business portfolio not found.' },
        { status: 404 }
      );
    }

    const [detachedAdAccounts, detachedPages, detachedSettings, detachedPixels] =
      await db.$transaction([
        db.tenantAdAccount.updateMany({
          where: { tenantId, businessId },
          data: { businessId: null },
        }),
        db.tenantPage.updateMany({
          where: { tenantId, businessId },
          data: { businessId: null },
        }),
        db.adAccountSettings.updateMany({
          where: { tenantId, businessId },
          data: { businessId: null },
        }),
        db.tenantPixel.updateMany({
          where: { tenantId, businessId },
          data: { businessId: null },
        }),
      ]);

    await db.businessPortfolio.update({
      where: { id: bp.id },
      data: {
        deletedAt: new Date(),
        deletedBy: context.userId,
      },
    });

    await db.auditLog.create({
      data: {
        tenantId,
        userId: context.userId,
        action: 'DELETE_BUSINESS_PORTFOLIO',
        assetId: businessId,
        summary: `Soft-deleted business portfolio ${bp.label || businessId}`,
        result: 'SUCCESS',
        metadata: {
          businessId,
          label: bp.label,
          detachedAdAccounts: detachedAdAccounts.count,
          detachedPages: detachedPages.count,
          detachedSettings: detachedSettings.count,
          detachedPixels: detachedPixels.count,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Business portfolio deleted.',
      detached: {
        adAccounts: detachedAdAccounts.count,
        pages: detachedPages.count,
        settings: detachedSettings.count,
        pixels: detachedPixels.count,
      },
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
