import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AuthRequiredError, requirePlatformAdmin } from '@/lib/tenant-context';

export async function GET() {
  try {
    await requirePlatformAdmin();

    const [tenants, adAccountsByBusiness, pagesByBusiness] = await Promise.all([
      db.tenant.findMany({
        include: {
          members: {
            include: {
              user: {
                select: { id: true, email: true, role: true, createdAt: true },
              },
            },
          },
          assets: {
            select: { id: true, adAccountId: true, createdAt: true },
          },
          adAccountSettings: {
            select: {
              adAccountId: true,
              dsaBeneficiary: true,
              dsaPayor: true,
              dsaSource: true,
              dsaUpdatedAt: true,
            },
          },
          businesses: {
            select: {
              businessId: true,
              label: true,
              lastSyncAt: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.tenantAdAccount.findMany({
        select: { tenantId: true, businessId: true },
      }),
      db.tenantPage.findMany({
        select: { tenantId: true, businessId: true },
      }),
    ]);

    const adAccountCountByBusiness = new Map<string, number>();
    for (const row of adAccountsByBusiness) {
      if (!row.businessId) continue;
      const key = `${row.tenantId}:${row.businessId}`;
      adAccountCountByBusiness.set(key, (adAccountCountByBusiness.get(key) || 0) + 1);
    }

    const pageCountByBusiness = new Map<string, number>();
    for (const row of pagesByBusiness) {
      if (!row.businessId) continue;
      const key = `${row.tenantId}:${row.businessId}`;
      pageCountByBusiness.set(key, (pageCountByBusiness.get(key) || 0) + 1);
    }

    return NextResponse.json({
      success: true,
      tenants: tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        createdAt: tenant.createdAt,
        members: tenant.members.map((member) => ({
          userId: member.user.id,
          email: member.user.email,
          platformRole: member.user.role,
          tenantRole: member.role,
          joinedAt: member.createdAt,
        })),
        assets: tenant.assets,
        dsaMappings: tenant.adAccountSettings,
        businesses: tenant.businesses.map((business) => {
          const countKey = `${tenant.id}:${business.businessId}`;
          return {
            businessId: business.businessId,
            label: business.label,
            lastSyncAt: business.lastSyncAt,
            counts: {
              adAccounts: adAccountCountByBusiness.get(countKey) || 0,
              pages: pageCountByBusiness.get(countKey) || 0,
            },
          };
        }),
      })),
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch tenants.' },
      { status: 500 }
    );
  }
}
