import { NextRequest, NextResponse } from 'next/server';
import { MCPClient } from '../../../../lib/mcp-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId');
    const accountId = searchParams.get('accountId');
    
    if (!campaignId && !accountId) {
      return NextResponse.json({
        success: false,
        error: 'Either campaignId or accountId is required'
      }, { status: 400 });
    }

    const mcpClient = new MCPClient();

    // Call the Facebook MCP server to get ad sets
    const params: any = {
      limit: 50,
      status: ['ACTIVE', 'PAUSED', 'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES']
    };

    if (campaignId) {
      params.campaignId = campaignId;
    }

    const rawAdSets = await mcpClient.callTool('get_adsets', params);

    console.log(`Raw Facebook ad sets fetched:`, rawAdSets);

    const adSets = rawAdSets || [];

    console.log(`Filtered ad sets:`, adSets);

    return NextResponse.json({
      success: true,
      adSets: adSets,
      count: adSets.length,
      campaignId: campaignId,
      accountId: accountId
    });

  } catch (error) {
    console.error('Facebook ad sets API error:', error);
    
    return NextResponse.json({
      success: true,
      adSets: [],
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      fallback: true
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      accountId, 
      campaignId, 
      name, 
      optimizationGoal, 
      billingEvent, 
      status, 
      dailyBudget, 
      lifetimeBudget,
      bidAmount,
      targeting 
    } = body;

    if (!accountId || !campaignId || !name || !optimizationGoal || !billingEvent) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: accountId, campaignId, name, optimizationGoal, billingEvent'
      }, { status: 400 });
    }

    const mcpClient = new MCPClient();

    const adSetData = {
      accountId,
      campaignId,
      name,
      optimizationGoal,
      billingEvent,
      status: status || 'PAUSED',
      ...(dailyBudget && { dailyBudget }),
      ...(lifetimeBudget && { lifetimeBudget }),
      ...(bidAmount && { bidAmount }),
      ...(targeting && { targeting })
    };

    const newAdSet = await mcpClient.callTool('create_adset', adSetData);

    return NextResponse.json({
      success: true,
      adSet: newAdSet
    });

  } catch (error) {
    console.error('Facebook ad set creation error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create ad set'
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { adSetId, ...updateData } = body;

    if (!adSetId) {
      return NextResponse.json({
        success: false,
        error: 'Ad set ID is required'
      }, { status: 400 });
    }

    const mcpClient = new MCPClient();

    const updatedAdSet = await mcpClient.callTool('update_adset', {
      adSetId,
      ...updateData
    });

    return NextResponse.json({
      success: true,
      adSet: updatedAdSet
    });

  } catch (error) {
    console.error('Facebook ad set update error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update ad set'
    }, { status: 500 });
  }
}
