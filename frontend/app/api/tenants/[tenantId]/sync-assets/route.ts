import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MCPClient } from '@/lib/mcp-client';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

function handleError(error: unknown): NextResponse {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 401 });
  }
  if (error instanceof TenantAccessError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }
  return NextResponse.json(
    { success: false, error: error instanceof Error ? error.message : 'Failed to sync tenant assets.' },
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
    throw new TenantAccessError('Only tenant admins can sync tenant assets.');
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const resolved = await params;
    const tenantId = resolved.tenantId;
    const context = await resolveTenantContext(request, { allowAdminCrossTenant: true });
    if (!context.isPlatformAdmin && context.tenantId !== tenantId) {
      throw new TenantAccessError('Tenant access denied.');
    }
    await assertTenantAdmin(context.userId, tenantId, context.isPlatformAdmin);

    const mcpClient = new MCPClient({
      tenantId,
      userId: context.userId,
      isPlatformAdmin: context.isPlatformAdmin,
    });
    const result = await mcpClient.callTool('sync_tenant_assets', {});

    const [adAccountsCount, pagesCount] = await Promise.all([
      db.tenantAdAccount.count({ where: { tenantId } }),
      db.tenantPage.count({ where: { tenantId } }),
    ]);

    return NextResponse.json({
      success: true,
      tenantId,
      result,
      counts: {
        adAccounts: adAccountsCount,
        pages: pagesCount,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
