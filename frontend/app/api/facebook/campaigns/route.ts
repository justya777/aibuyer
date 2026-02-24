import { NextRequest, NextResponse } from 'next/server';
import { MCPClient } from '../../../../lib/mcp-client';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

    const context = await resolveTenantContext(request);
    const mcpClient = new MCPClient(context);
    const normalizedAccountId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;

    // Call the Facebook MCP server to get campaigns (excluding problematic statuses)
    const rawCampaigns = await mcpClient.callTool('get_campaigns', {
      accountId: normalizedAccountId,
      limit: 50,
      status: ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'],
    });

    // Keep only campaigns that come from the requested ad account and dedupe by ID.
    const campaigns = (Array.isArray(rawCampaigns) ? rawCampaigns : [])
      .filter((campaign) => {
        const campaignAccountId =
          typeof campaign?.accountId === 'string' ? campaign.accountId : '';
        return campaignAccountId === normalizedAccountId;
      })
      .filter((campaign) => campaign?.status === 'active' || campaign?.status === 'paused')
      .filter(
        (campaign, index, all) =>
          all.findIndex((entry) => entry.id === campaign.id) === index
      );

    return NextResponse.json(
      {
        success: true,
        campaigns,
        count: campaigns.length,
        accountId: normalizedAccountId,
        filteredOut: Array.isArray(rawCampaigns) ? rawCampaigns.length - campaigns.length : 0,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );

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
