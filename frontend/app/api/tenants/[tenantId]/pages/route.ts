import { NextRequest, NextResponse } from 'next/server';
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
    { success: false, error: error instanceof Error ? error.message : 'Failed to load tenant pages.' },
    { status: 500 }
  );
}

export async function GET(
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

    const mcpClient = new MCPClient({
      tenantId,
      userId: context.userId,
      isPlatformAdmin: context.isPlatformAdmin,
    });
    const pages = await mcpClient.callTool('list_tenant_pages', {});

    return NextResponse.json({
      success: true,
      tenantId,
      pages: Array.isArray(pages) ? pages : [],
    });
  } catch (error) {
    return handleError(error);
  }
}
