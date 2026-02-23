import { DsaSource, TenantPageSource } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { MCPClient } from '@/lib/mcp-client';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

const SetDefaultPageSchema = z.object({
  pageId: z.string().min(1),
});

function normalizeAdAccountId(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

async function assertTenantAdmin(userId: string, tenantId: string, isPlatformAdmin: boolean): Promise<void> {
  if (isPlatformAdmin) return;
  const membership = await db.tenantMember.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true },
  });
  if (!membership || membership.role !== 'ADMIN') {
    throw new TenantAccessError('Only tenant admins can update default pages.');
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
    { success: false, error: error instanceof Error ? error.message : 'Failed to set default page.' },
    { status: 500 }
  );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; businessId: string; actId: string }> }
) {
  try {
    const { tenantId, businessId, actId } = await params;
    const adAccountId = normalizeAdAccountId(actId);
    const context = await resolveTenantContext(request, { allowAdminCrossTenant: true });
    if (!context.isPlatformAdmin && context.tenantId !== tenantId) {
      throw new TenantAccessError('Tenant access denied.');
    }
    await assertTenantAdmin(context.userId, tenantId, context.isPlatformAdmin);

    const payload = SetDefaultPageSchema.parse(await request.json());
    const pageId = payload.pageId.trim();

    const [business, adAccount, page] = await Promise.all([
      db.businessPortfolio.findUnique({
        where: { tenantId_businessId: { tenantId, businessId } },
        select: { businessId: true },
      }),
      db.tenantAdAccount.findFirst({
        where: { tenantId, businessId, adAccountId },
        select: { id: true },
      }),
      db.tenantPage.findFirst({
        where: { tenantId, businessId, pageId },
        select: { id: true, source: true },
      }),
    ]);
    if (!business) {
      return NextResponse.json(
        { success: false, error: `Business ${businessId} is not mapped to tenant ${tenantId}.` },
        { status: 404 }
      );
    }
    if (!adAccount) {
      return NextResponse.json(
        { success: false, error: `Ad account ${adAccountId} is not mapped to business ${businessId}.` },
        { status: 404 }
      );
    }
    if (!page) {
      return NextResponse.json(
        { success: false, error: `Page ${pageId} is not mapped to business ${businessId}.` },
        { status: 404 }
      );
    }

    const mcpClient = new MCPClient({
      tenantId,
      userId: context.userId,
      isPlatformAdmin: context.isPlatformAdmin,
    });
    const result = await mcpClient.callTool('set_default_page_for_ad_account', {
      businessId,
      adAccountId,
      pageId,
    });

    const updatedSettings = await db.adAccountSettings.upsert({
      where: {
        tenantId_adAccountId: {
          tenantId,
          adAccountId,
        },
      },
      update: {
        businessId,
        defaultPageId: pageId,
        dsaSource: DsaSource.MANUAL,
      },
      create: {
        tenantId,
        businessId,
        adAccountId,
        defaultPageId: pageId,
      },
    });

    if (page.source === TenantPageSource.FALLBACK_UNVERIFIED) {
      await db.tenantPage.updateMany({
        where: {
          tenantId,
          businessId,
          pageId,
          source: TenantPageSource.FALLBACK_UNVERIFIED,
        },
        data: {
          source: TenantPageSource.FALLBACK_CONFIRMED,
          lastSeenAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      tenantId,
      businessId,
      result,
      settings: {
        adAccountId: updatedSettings.adAccountId,
        defaultPageId: updatedSettings.defaultPageId,
        dsaBeneficiary: updatedSettings.dsaBeneficiary,
        dsaPayor: updatedSettings.dsaPayor,
        dsaSource: updatedSettings.dsaSource,
        dsaUpdatedAt: updatedSettings.dsaUpdatedAt,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
