import { NextRequest, NextResponse } from 'next/server';
import { MCPClient } from '../../../../lib/mcp-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    
    if (!accountId) {
      return NextResponse.json({
        success: false,
        error: 'Account ID is required'
      }, { status: 400 });
    }

    const mcpClient = new MCPClient();

    // Call the Facebook MCP server to get campaigns (excluding problematic statuses)
    const rawCampaigns = await mcpClient.callTool('get_campaigns', {
      accountId: accountId,
      limit: 50,
      status: ['ACTIVE', 'PAUSED', 'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES']
      // Excluded 'ARCHIVED' as it often contains deleted campaigns
    });

    console.log(`Raw Facebook campaigns fetched for account ${accountId}:`, rawCampaigns);

    // Apply the campaigns (filtered by status exclusion above)
    const campaigns = rawCampaigns || [];

    console.log(`Filtered campaigns for account ${accountId}:`, campaigns);

    return NextResponse.json({
      success: true,
      campaigns: campaigns || [],
      count: campaigns ? campaigns.length : 0,
      accountId: accountId,
      filteredOut: rawCampaigns ? rawCampaigns.length - campaigns.length : 0
    });

  } catch (error) {
    console.error('Facebook campaigns API error:', error);
    
    // Return empty array instead of error so UI doesn't break
    return NextResponse.json({
      success: true,
      campaigns: [],
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      fallback: true
    });
  }
}
