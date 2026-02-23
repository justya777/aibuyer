import { TenantPageSource } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

function mapPageSource(source: TenantPageSource): 'CONFIRMED_BM' | 'FALLBACK_UNVERIFIED' {
  if (source === TenantPageSource.FALLBACK_UNVERIFIED) {
    return 'FALLBACK_UNVERIFIED';
  }
  return 'CONFIRMED_BM';
}

function handleError(error: unknown): NextResponse {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 401 });
  }
  if (error instanceof TenantAccessError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }
  return NextResponse.json(
    { success: false, error: error instanceof Error ? error.message : 'Failed to load business pages.' },
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

    const pages = await db.tenantPage.findMany({
      where: { tenantId, businessId },
      orderBy: [{ source: 'asc' }, { name: 'asc' }, { pageId: 'asc' }],
    });

    return NextResponse.json({
      success: true,
      tenantId,
      businessId,
      pages: pages.map((page) => ({
        id: page.pageId,
        pageId: page.pageId,
        name: page.name || page.pageId,
        source: mapPageSource(page.source),
        confirmed: page.source !== TenantPageSource.FALLBACK_UNVERIFIED,
        lastSeenAt: page.lastSeenAt,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}
