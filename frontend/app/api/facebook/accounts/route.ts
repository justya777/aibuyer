import { NextRequest, NextResponse } from 'next/server';
import { MCPClient } from '../../../../lib/mcp-client';

export async function GET(request: NextRequest) {
  try {
    const mcpClient = new MCPClient();

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
    console.error('Facebook accounts API error:', error);
    
    // Return empty array instead of error so UI doesn't break
    return NextResponse.json({
      success: true,
      accounts: [],
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      fallback: true
    });
  }
}
