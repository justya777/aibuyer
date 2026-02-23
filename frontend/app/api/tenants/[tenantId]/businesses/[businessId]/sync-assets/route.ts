import { TenantPageSource } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MCPClient } from '@/lib/mcp-client';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

async function assertTenantAdmin(userId: string, tenantId: string, isPlatformAdmin: boolean): Promise<void> {
  if (isPlatformAdmin) return;
  const membership = await db.tenantMember.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true },
  });
  if (!membership || membership.role !== 'ADMIN') {
    throw new TenantAccessError('Only tenant admins can sync business assets.');
  }
}

function handleError(error: unknown): NextResponse {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 401 });
  }
  if (error instanceof TenantAccessError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }
  return NextResponse.json(
    { success: false, error: error instanceof Error ? error.message : 'Failed to sync assets.' },
    { status: 500 }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; businessId: string }> }
) {
  try {
    const { tenantId, businessId } = await params;
    const context = await resolveTenantContext(request, { allowAdminCrossTenant: true });
    if (!context.isPlatformAdmin && context.tenantId !== tenantId) {
      throw new TenantAccessError('Tenant access denied.');
    }
    await assertTenantAdmin(context.userId, tenantId, context.isPlatformAdmin);

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

    const startedAt = new Date();

    const mcpClient = new MCPClient({
      tenantId,
      userId: context.userId,
      isPlatformAdmin: context.isPlatformAdmin,
    });
    const result = await mcpClient.callTool('sync_tenant_assets', { businessId });

    // Persist BP context on newly synced rows so tenant can keep multiple BP snapshots.
    await db.$transaction(async (tx) => {
      await tx.tenantAdAccount.updateMany({
        where: {
          tenantId,
          lastSyncedAt: { gte: startedAt },
        },
        data: { businessId },
      });
      await tx.tenantPage.updateMany({
        where: {
          tenantId,
          lastSeenAt: { gte: startedAt },
        },
        data: { businessId },
      });
      await tx.adAccountSettings.updateMany({
        where: {
          tenantId,
          updatedAt: { gte: startedAt },
        },
        data: { businessId },
      });
      await tx.businessPortfolio.update({
        where: { tenantId_businessId: { tenantId, businessId } },
        data: { lastSyncAt: new Date() },
      });
    });

    const [adAccounts, pages] = await Promise.all([
      db.tenantAdAccount.findMany({
        where: { tenantId, businessId },
        select: { adAccountId: true },
      }),
      db.tenantPage.findMany({
        where: { tenantId, businessId },
        select: { pageId: true, source: true },
      }),
    ]);

    const confirmedPages = pages.filter(
      (entry) => entry.source !== TenantPageSource.FALLBACK_UNVERIFIED
    );

    if (confirmedPages.length === 1 && adAccounts.length > 0) {
      const pageId = confirmedPages[0].pageId;
      for (const account of adAccounts) {
        await db.adAccountSettings.upsert({
          where: {
            tenantId_adAccountId: {
              tenantId,
              adAccountId: account.adAccountId,
            },
          },
          update: {},
          create: {
            tenantId,
            businessId,
            adAccountId: account.adAccountId,
            defaultPageId: pageId,
          },
        });
      }
      await db.adAccountSettings.updateMany({
        where: {
          tenantId,
          adAccountId: { in: adAccounts.map((entry) => entry.adAccountId) },
          defaultPageId: null,
        },
        data: {
          businessId,
          defaultPageId: pageId,
        },
      });
    }

    const fallbackOnly = pages.length > 0 && confirmedPages.length === 0;

    return NextResponse.json({
      success: true,
      tenantId,
      businessId,
      result,
      warnings: fallbackOnly
        ? [
            'Only FALLBACK_UNVERIFIED pages were discovered. Confirm a page by setting it as default for an ad account.',
          ]
        : [],
      counts: {
        adAccounts: adAccounts.length,
        pages: pages.length,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
