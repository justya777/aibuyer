import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  AuthRequiredError,
  TenantAccessError,
  resolveTenantContext,
} from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

function normalizeAdAccountId(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

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
    throw new TenantAccessError('Only tenant admins can remove ad accounts.');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { tenantId: string; businessId: string; actId: string } }
) {
  try {
    const { tenantId, businessId, actId } = params;
    const adAccountId = normalizeAdAccountId(actId);
    const context = await resolveTenantContext(request, { allowAdminCrossTenant: true });
    if (!context.isPlatformAdmin && context.tenantId !== tenantId) {
      throw new TenantAccessError('Tenant access denied.');
    }
    await assertTenantAdmin(context.userId, tenantId, context.isPlatformAdmin);

    const adAccount = await db.tenantAdAccount.findFirst({
      where: { tenantId, businessId, adAccountId },
    });
    if (!adAccount) {
      return NextResponse.json(
        { success: false, error: 'Ad account not found in this business portfolio.' },
        { status: 404 }
      );
    }

    const [detachedAccount, detachedSettings, detachedPixels] = await db.$transaction([
      db.tenantAdAccount.updateMany({
        where: { tenantId, businessId, adAccountId },
        data: { businessId: null },
      }),
      db.adAccountSettings.updateMany({
        where: { tenantId, businessId, adAccountId },
        data: { businessId: null },
      }),
      db.tenantPixel.updateMany({
        where: { tenantId, businessId, adAccountId },
        data: { businessId: null },
      }),
    ]);

    await db.auditLog.create({
      data: {
        tenantId,
        userId: context.userId,
        action: 'REMOVE_AD_ACCOUNT',
        assetId: adAccountId,
        summary: `Detached ad account ${adAccount.name || adAccountId} from BP ${businessId}`,
        result: 'SUCCESS',
        metadata: {
          businessId,
          adAccountId,
          adAccountName: adAccount.name,
          detachedSettings: detachedSettings.count,
          detachedPixels: detachedPixels.count,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Ad account removed from business portfolio.',
      detached: {
        adAccounts: detachedAccount.count,
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
