import { NextRequest, NextResponse } from 'next/server';
import { MCPClient } from '../../../../lib/mcp-client';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const context = await resolveTenantContext(request);
    const mcpClient = new MCPClient(context);

    // Call the Facebook MCP server to get accounts
    const accounts = await mcpClient.callTool('get_accounts', {
      limit: 50,
      fields: [
        'id',
        'name', 
        'account_status',
        'currency',
        'timezone_name',
        'created_time',
        'amount_spent',
        'spend_cap',
        'balance'
      ]
    });

    console.log('Facebook accounts fetched:', accounts);

    return NextResponse.json({
      success: true,
      accounts: accounts || [],
      count: accounts ? accounts.length : 0
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
