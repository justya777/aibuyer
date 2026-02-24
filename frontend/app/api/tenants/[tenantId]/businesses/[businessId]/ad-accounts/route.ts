import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

function normalizeAdAccountId(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

function handleError(error: unknown): NextResponse {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 401 });
  }
  if (error instanceof TenantAccessError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }
  return NextResponse.json(
    { success: false, error: error instanceof Error ? error.message : 'Failed to load business ad accounts.' },
    { status: 500 }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; businessId: string }> }
) {
  try {
    const { tenantId, businessId } = await params;
    const context = await resolveTenantContext(request, { allowAdminCrossTenant: true });
    if (!context.isPlatformAdmin && context.tenantId !== tenantId) {
      throw new TenantAccessError('Tenant access denied.');
    }

    const business = await db.businessPortfolio.findUnique({
      where: { tenantId_businessId: { tenantId, businessId } },
      select: { businessId: true },
    });
    if (!business) {
      return NextResponse.json(
        { success: false, error: `Business ${businessId} not found for tenant ${tenantId}.` },
        { status: 404 }
      );
    }

    const adAccounts = await db.tenantAdAccount.findMany({
      where: { tenantId, businessId },
      orderBy: { updatedAt: 'desc' },
    });
    const settings = await db.adAccountSettings.findMany({
      where: { tenantId, OR: [{ businessId }, { businessId: null }] },
    });
    const settingsByAccountId = new Map(
      settings.map((item) => [normalizeAdAccountId(item.adAccountId), item])
    );

    return NextResponse.json({
      success: true,
      tenantId,
      businessId,
      adAccounts: adAccounts.map((asset) => {
        const normalizedAdAccountId = normalizeAdAccountId(asset.adAccountId);
        const adAccountSettings = settingsByAccountId.get(normalizedAdAccountId);
        return {
          id: asset.id,
          businessId,
          adAccountId: normalizedAdAccountId,
          name: asset.name || normalizedAdAccountId,
          status: asset.status || null,
          currency: asset.currency || null,
          timezoneName: asset.timezoneName || null,
          createdAt: asset.createdAt,
          lastSyncedAt: asset.lastSyncedAt,
          defaultPageId: adAccountSettings?.defaultPageId || null,
          dsaBeneficiary: adAccountSettings?.dsaBeneficiary || null,
          dsaPayor: adAccountSettings?.dsaPayor || null,
          dsaSource: adAccountSettings?.dsaSource || null,
          dsaUpdatedAt: adAccountSettings?.dsaUpdatedAt || null,
          dsaConfigured: Boolean(adAccountSettings?.dsaBeneficiary && adAccountSettings?.dsaPayor),
          dsaStatus: adAccountSettings?.dsaBeneficiary && adAccountSettings?.dsaPayor ? 'CONFIGURED' : 'MISSING',
        };
      }),
    });
  } catch (error) {
    return handleError(error);
  }
}
