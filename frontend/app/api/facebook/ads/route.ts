import { NextRequest, NextResponse } from 'next/server';
import { MCPClient } from '../../../../lib/mcp-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const adSetId = searchParams.get('adSetId');
    const campaignId = searchParams.get('campaignId');
    
    if (!adSetId && !campaignId) {
      return NextResponse.json({
        success: false,
        error: 'Either adSetId or campaignId is required'
      }, { status: 400 });
    }

    const mcpClient = new MCPClient();

    // Call the Facebook MCP server to get ads
    const params: any = {
      limit: 50,
      status: ['ACTIVE', 'PAUSED', 'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED']
    };

    if (adSetId) {
      params.adSetId = adSetId;
    } else if (campaignId) {
      params.campaignId = campaignId;
    }

    const rawAds = await mcpClient.callTool('get_ads', params);

    console.log(`Raw Facebook ads fetched:`, rawAds);

    const ads = rawAds || [];

    console.log(`Filtered ads:`, ads);

    return NextResponse.json({
      success: true,
      ads: ads,
      count: ads.length,
      adSetId: adSetId,
      campaignId: campaignId
    });

  } catch (error) {
    console.error('Facebook ads API error:', error);
    
    return NextResponse.json({
      success: true,
      ads: [],
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
      adSetId, 
      name, 
      status, 
      creative 
    } = body;

    if (!accountId || !adSetId || !name || !creative) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: accountId, adSetId, name, creative'
      }, { status: 400 });
    }

    const mcpClient = new MCPClient();

    const adData = {
      accountId,
      adSetId,
      name,
      status: status || 'PAUSED',
      creative
    };

    const newAd = await mcpClient.callTool('create_ad', adData);

    return NextResponse.json({
      success: true,
      ad: newAd
    });

  } catch (error) {
    console.error('Facebook ad creation error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create ad'
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { adId, ...updateData } = body;

    if (!adId) {
      return NextResponse.json({
        success: false,
        error: 'Ad ID is required'
      }, { status: 400 });
    }

    const mcpClient = new MCPClient();

    const updatedAd = await mcpClient.callTool('update_ad', {
      adId,
      ...updateData
    });

    return NextResponse.json({
      success: true,
      ad: updatedAd
    });

  } catch (error) {
    console.error('Facebook ad update error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update ad'
    }, { status: 500 });
  }
}
