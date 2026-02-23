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

async function assertTenantAdmin(userId: string, tenantId: string, isPlatformAdmin: boolean): Promise<void> {
  if (isPlatformAdmin) return;
  const membership = await db.tenantMember.findUnique({
    where: {
      userId_tenantId: {
        userId,
        tenantId,
      },
    },
    select: { role: true },
  });
  if (!membership || membership.role !== 'ADMIN') {
    throw new TenantAccessError('Only tenant admins can update default pages.');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; actId: string }> }
) {
  try {
    const resolved = await params;
    const tenantId = resolved.tenantId;
    const adAccountId = normalizeAdAccountId(resolved.actId);
    const context = await resolveTenantContext(request, { allowAdminCrossTenant: true });
    if (!context.isPlatformAdmin && context.tenantId !== tenantId) {
      throw new TenantAccessError('Tenant access denied.');
    }
    await assertTenantAdmin(context.userId, tenantId, context.isPlatformAdmin);

    const payload = SetDefaultPageSchema.parse(await request.json());
    const pageId = payload.pageId.trim();

    const [adAccount, page] = await Promise.all([
      db.tenantAdAccount.findUnique({
        where: {
          tenantId_adAccountId: {
            tenantId,
            adAccountId,
          },
        },
        select: { id: true },
      }),
      db.tenantPage.findUnique({
        where: {
          tenantId_pageId: {
            tenantId,
            pageId,
          },
        },
        select: { id: true, source: true },
      }),
    ]);
    if (!adAccount) {
      return NextResponse.json(
        { success: false, error: `Ad account ${adAccountId} is not mapped to tenant ${tenantId}.` },
        { status: 404 }
      );
    }
    if (!page) {
      return NextResponse.json(
        { success: false, error: `Page ${pageId} is not mapped to tenant ${tenantId}.` },
        { status: 404 }
      );
    }

    const mcpClient = new MCPClient({
      tenantId,
      userId: context.userId,
      isPlatformAdmin: context.isPlatformAdmin,
    });
    const result = await mcpClient.callTool('set_default_page_for_ad_account', {
      adAccountId,
      pageId,
    });

    const settings = await db.adAccountSettings.findUnique({
      where: {
        tenantId_adAccountId: {
          tenantId,
          adAccountId,
        },
      },
      select: {
        adAccountId: true,
        defaultPageId: true,
        dsaBeneficiary: true,
        dsaPayor: true,
        dsaSource: true,
        dsaUpdatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      tenantId,
      result,
      settings,
    });
  } catch (error) {
    return handleError(error);
  }
}
