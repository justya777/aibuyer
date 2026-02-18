import { NextRequest, NextResponse } from 'next/server';
import { MCPClient } from '../../../../lib/mcp-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const campaignId = searchParams.get('campaignId');
    const level = searchParams.get('level') || 'account';

    const mcpClient = new MCPClient();
    const debugData: any = {
      timestamp: new Date().toISOString(),
      requests: []
    };

    // 1. Get raw accounts data
    console.log('🔍 [DEBUG] Fetching raw Facebook accounts data...');
    const rawAccounts = await mcpClient.callTool('get_accounts', {
      limit: 10,
      fields: [
        'id',
        'name', 
        'account_status',
        'currency',
        'timezone_name',
        'created_time',
        'amount_spent',
        'spend_cap',
        'balance',
        'account_id'
      ]
    });

    debugData.requests.push({
      endpoint: 'get_accounts',
      response: rawAccounts,
      fields_requested: [
        'id', 'name', 'account_status', 'currency', 'timezone_name',
        'created_time', 'amount_spent', 'spend_cap', 'balance'
      ]
    });

    // 2. If accountId provided, get insights data
    if (accountId) {
      console.log(`🔍 [DEBUG] Fetching insights for account: ${accountId}`);
      
      try {
        const accountInsights = await mcpClient.callTool('get_insights', {
          level: 'account',
          accountId: accountId,
          datePreset: 'last_7d',
          fields: [
            'spend',
            'impressions',
            'clicks',
            'ctr',
            'cpm',
            'cpc',
            'conversions',
            'cost_per_conversion',
            'reach',
            'frequency'
          ]
        });

        debugData.requests.push({
          endpoint: 'get_insights (account level)',
          accountId: accountId,
          response: accountInsights,
          fields_requested: [
            'spend', 'impressions', 'clicks', 'ctr', 'cpm', 'cpc',
            'conversions', 'cost_per_conversion', 'reach', 'frequency'
          ]
        });
      } catch (insightsError) {
        console.error('Insights error:', insightsError);
        debugData.requests.push({
          endpoint: 'get_insights (account level)',
          accountId: accountId,
          error: insightsError instanceof Error ? insightsError.message : 'Unknown insights error'
        });
      }

      // 3. Get campaigns for this account
      try {
        console.log(`🔍 [DEBUG] Fetching campaigns for account: ${accountId}`);
        const campaigns = await mcpClient.callTool('get_campaigns', {
          accountId: accountId,
          limit: 5,
          status: ['ACTIVE', 'PAUSED']
        });

        debugData.requests.push({
          endpoint: 'get_campaigns',
          accountId: accountId,
          response: campaigns,
          count: campaigns ? campaigns.length : 0
        });

        // If we have campaigns and a specific campaignId, get campaign insights
        if (campaigns && campaigns.length > 0) {
          const targetCampaignId = campaignId || campaigns[0].id;
          
          console.log(`🔍 [DEBUG] Fetching campaign insights for: ${targetCampaignId}`);
          const campaignInsights = await mcpClient.callTool('get_insights', {
            level: 'campaign',
            campaignId: targetCampaignId,
            datePreset: 'last_7d',
            fields: [
              'spend',
              'impressions',
              'clicks',
              'ctr',
              'cpm',
              'cpc',
              'conversions',
              'cost_per_conversion'
            ]
          });

          debugData.requests.push({
            endpoint: 'get_insights (campaign level)',
            campaignId: targetCampaignId,
            response: campaignInsights,
            fields_requested: [
              'spend', 'impressions', 'clicks', 'ctr', 'cpm', 'cpc',
              'conversions', 'cost_per_conversion'
            ]
          });
        }

      } catch (campaignError) {
        console.error('Campaign error:', campaignError);
        debugData.requests.push({
          endpoint: 'get_campaigns',
          accountId: accountId,
          error: campaignError instanceof Error ? campaignError.message : 'Unknown campaign error'
        });
      }
    }

    return NextResponse.json({
      success: true,
      debug: debugData,
      usage: {
        note: "This endpoint shows raw Facebook API responses for development",
        parameters: {
          accountId: "optional - fetch insights for specific account",
          campaignId: "optional - fetch insights for specific campaign", 
          level: "account|campaign|adset|ad (default: account)"
        },
        examples: {
          basic: "/api/facebook/debug",
          with_account: "/api/facebook/debug?accountId=act_123456789",
          with_campaign: "/api/facebook/debug?accountId=act_123456789&campaignId=123456789"
        }
      }
    });

  } catch (error) {
    console.error('🚨 [DEBUG] Facebook debug API error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
