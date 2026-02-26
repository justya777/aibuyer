import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

const CreateBusinessSchema = z.object({
  businessId: z.string().min(1),
  label: z.string().optional(),
});

async function assertTenantAdmin(userId: string, tenantId: string, isPlatformAdmin: boolean): Promise<void> {
  if (isPlatformAdmin) return;
  const membership = await db.tenantMember.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true },
  });
  if (!membership || membership.role !== 'ADMIN') {
    throw new TenantAccessError('Only tenant admins can manage business portfolios.');
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
    { success: false, error: error instanceof Error ? error.message : 'Failed to process businesses.' },
    { status: 500 }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const context = await resolveTenantContext(request, { allowAdminCrossTenant: true });
    if (!context.isPlatformAdmin && context.tenantId !== tenantId) {
      throw new TenantAccessError('Tenant access denied.');
    }

    const [businesses, tenant] = await Promise.all([
      db.businessPortfolio.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      db.tenant.findUnique({
        where: { id: tenantId },
        select: { businessId: true },
      }),
    ]);

    const mergedBusinesses = [...businesses];
    if (
      tenant?.businessId &&
      !mergedBusinesses.some((entry) => entry.businessId === tenant.businessId)
    ) {
      mergedBusinesses.push({
        id: `legacy-${tenant.businessId}`,
        tenantId,
        businessId: tenant.businessId,
        label: null,
        lastSyncAt: null,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      });
    }

    const summaries = await Promise.all(
      mergedBusinesses.map(async (business) => {
        const [adAccountsCount, pagesCount] = await Promise.all([
          db.tenantAdAccount.count({
            where: { tenantId, businessId: business.businessId },
          }),
          db.tenantPage.count({
            where: { tenantId, businessId: business.businessId },
          }),
        ]);

        return {
          tenantId,
          businessId: business.businessId,
          label: business.label,
          lastSyncAt: business.lastSyncAt,
          createdAt: business.createdAt,
          counts: {
            adAccounts: adAccountsCount,
            pages: pagesCount,
          },
        };
      })
    );

    return NextResponse.json({
      success: true,
      tenantId,
      businesses: summaries,
    });
  } catch (error) {
    return handleError(error);
  }
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

    const payload = CreateBusinessSchema.parse(await request.json());
    const businessId = payload.businessId.trim();
    const label = payload.label?.trim() || null;

    const business = await db.businessPortfolio.upsert({
      where: {
        tenantId_businessId: {
          tenantId,
          businessId,
        },
      },
      update: { label },
      create: {
        tenantId,
        businessId,
        label,
      },
    });

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { businessId: true },
    });
    if (!tenant?.businessId) {
      await db.tenant.update({
        where: { id: tenantId },
        data: { businessId },
      });
    }

    return NextResponse.json({
      success: true,
      tenantId,
      business: {
        tenantId,
        businessId: business.businessId,
        label: business.label,
        lastSyncAt: business.lastSyncAt,
        createdAt: business.createdAt,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
