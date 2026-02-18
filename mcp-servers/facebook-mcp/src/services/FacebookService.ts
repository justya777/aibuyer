import { FacebookAdsApi, AdAccount, Campaign, AdSet, Ad, User } from 'facebook-nodejs-business-sdk';
import axios from 'axios';
import { logger } from '../utils/logger.js';
import type {
  GetAccountsParams,
  GetPagesParams,
  GetCampaignsParams,
  CreateCampaignParams,
  UpdateCampaignParams,
  GetInsightsParams,
  GetAdSetsParams,
  CreateAdSetParams,
  UpdateAdSetParams,
  GetAdsParams,
  CreateAdParams,
  UpdateAdParams,
  FacebookAccount,
  FacebookPage,
  FacebookCampaign,
  FacebookAdSet,
  FacebookAd,
  FacebookInsights,
} from '../types/facebook.js';

export class FacebookService {
  private isInitialized: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    // Force reload environment variables
    require('dotenv').config();
    
    const accessToken = process.env.FB_ACCESS_TOKEN;
    const appId = process.env.FB_APP_ID;
    const appSecret = process.env.FB_APP_SECRET;
    const pageId = process.env.FB_PAGE_ID;
    const dsaBeneficiary = process.env.FB_DSA_BENEFICIARY;
    const dsaPayor = process.env.FB_DSA_PAYOR;

    logger.info(`🔍 Environment validation:`, {
      'Access Token': !!accessToken ? `Present (${accessToken.length} chars)` : 'Missing',
      'App ID': !!appId ? 'Present' : 'Missing',
      'App Secret': !!appSecret ? 'Present' : 'Missing', 
      'Page ID': !!pageId ? 'Present' : 'Missing (required for ad creation)',
      'DSA Beneficiary': !!dsaBeneficiary ? 'Present' : 'Missing (required for EU targeting)',
      'DSA Payor': !!dsaPayor ? 'Present' : 'Missing (required for EU targeting)'
    });

    if (!accessToken || accessToken.length < 100) {
      logger.error('❌ FB_ACCESS_TOKEN not found or incomplete. Facebook API will not work without proper credentials.');
      logger.error('🔑 Please ensure your Facebook access token is valid and has sufficient length (typically 200+ characters)');
      return;
    }

    // Warn about missing optional but important environment variables
    if (!pageId) {
      logger.warn('⚠️ FB_PAGE_ID is not set. This will be required for creating ads with creative content.');
    }
    
    if (!dsaBeneficiary || !dsaPayor) {
      logger.warn('⚠️ DSA compliance environment variables (FB_DSA_BENEFICIARY, FB_DSA_PAYOR) are not set.');
      logger.warn('⚠️ These will be required when targeting EU countries for Digital Services Act compliance.');
    }

    try {
      if (appId && appSecret) {
        FacebookAdsApi.init(accessToken, appId, appSecret, undefined, undefined, 'v23.0');
        logger.info('✅ Facebook API initialized with App ID and Secret');
      } else {
        FacebookAdsApi.setAccessToken(accessToken);
        logger.info('✅ Facebook API initialized with Access Token only');
      }
      
      // Set API version explicitly
      FacebookAdsApi.version = 'v23.0';
      
      this.isInitialized = true;
      logger.info('✅ Facebook API successfully initialized with v23.0');
    } catch (initError) {
      logger.error('❌ Failed to initialize Facebook API:', initError);
      this.isInitialized = false;
      throw new Error(`Facebook API initialization failed: ${initError instanceof Error ? initError.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse gender from Facebook API response
   * Facebook API returns genders as array of numbers: 1 = male, 2 = female
   */
  private parseGenderFromFBResponse(genders?: number[]): 'all' | 'male' | 'female' {
    if (!genders || genders.length === 0) return 'all';
    if (genders.includes(1) && genders.includes(2)) return 'all';
    if (genders.includes(1)) return 'male';
    if (genders.includes(2)) return 'female';
    return 'all';
  }

  /**
   * Parse gender from input parameters for ad set creation
   * Input format: array of numbers: 1 = male, 2 = female
   */
  private parseGenderFromInput(genders?: number[]): 'all' | 'male' | 'female' {
    if (!genders || genders.length === 0) return 'all';
    if (genders.includes(1) && genders.includes(2)) return 'all';
    if (genders.includes(1)) return 'male';
    if (genders.includes(2)) return 'female';
    return 'all';
  }

  /**
   * Search for Facebook locale IDs by language code or name
   * Uses Facebook's Targeting Search API to get valid locale IDs
   */
  private async searchLocaleIds(localeCodes: string[]): Promise<Array<{ key: string; name: string }>> {
    if (!localeCodes || localeCodes.length === 0) return [];

    const foundLocales: Array<{ key: string; name: string }> = [];
    
    // Common locale code to name mappings for better search
    const localeNameMappings: { [key: string]: string[] } = {
      'ro': ['Romanian', 'Română'],
      'en': ['English'],
      'es': ['Spanish', 'Español'],
      'de': ['German', 'Deutsch'],
      'fr': ['French', 'Français'],
      'it': ['Italian', 'Italiano'],
      'pt': ['Portuguese', 'Português'],
      'pl': ['Polish', 'Polski'],
      'nl': ['Dutch', 'Nederlands'],
      'ru': ['Russian', 'Русский'],
      'uk': ['Ukrainian', 'Українська'],
      'tr': ['Turkish', 'Türkçe'],
      'ar': ['Arabic', 'العربية'],
      'zh': ['Chinese', '中文'],
      'ja': ['Japanese', '日本語'],
      'ko': ['Korean', '한국어'],
      'hi': ['Hindi', 'हिन्दी'],
      'bg': ['Bulgarian', 'Български'],
      'hu': ['Hungarian', 'Magyar'],
      'cs': ['Czech', 'Čeština'],
      'sk': ['Slovak', 'Slovenčina'],
      'el': ['Greek', 'Ελληνικά'],
      'sv': ['Swedish', 'Svenska'],
      'da': ['Danish', 'Dansk'],
      'fi': ['Finnish', 'Suomi'],
      'no': ['Norwegian', 'Norsk'],
    };
    
    for (const localeCode of localeCodes) {
      const searchTerms = localeNameMappings[localeCode.toLowerCase()] || [localeCode];
      let found = false;
      
      for (const searchTerm of searchTerms) {
        if (found) break;
        
        try {
          logger.info(`🌐 Searching Facebook locales for "${searchTerm}" (from code "${localeCode}")`);
          const response = await axios.get(`https://graph.facebook.com/v23.0/search`, {
            params: {
              type: 'adlocale',
              q: searchTerm,
              limit: 5,
              access_token: this.getAccessToken()
            }
          });

          if (response.data.data && response.data.data.length > 0) {
            // Find exact match first, then take first result
            const exactMatch = response.data.data.find((l: any) => 
              l.name.toLowerCase() === searchTerm.toLowerCase()
            );
            const locale = exactMatch || response.data.data[0];
            foundLocales.push({
              key: locale.key,
              name: locale.name
            });
            logger.info(`✅ Found Facebook locale ID for "${localeCode}" → "${searchTerm}": ${locale.key} (${locale.name})`);
            found = true;
          }
        } catch (error) {
          logger.error(`❌ Error searching for locale "${searchTerm}":`, error);
        }
      }
      
      if (!found) {
        logger.warn(`⚠️ No Facebook locale found for "${localeCode}" after trying ${searchTerms.length} search terms`);
      }
    }

    return foundLocales;
  }

  /**
   * Search for Facebook interest IDs by name
   * Uses Facebook's Graph API search endpoint for interests
   */
  private async searchInterestIds(interestNames: string[]): Promise<Array<{ id: string; name: string }>> {
    if (!interestNames || interestNames.length === 0) return [];

    const foundInterests: Array<{ id: string; name: string }> = [];
    
    // Enhanced interest mapping for better targeting
    const interestMappings: { [key: string]: string[] } = {
      'Investment': ['Investment', 'Investing', 'Personal finance', 'Stock market', 'Finance'],
      'Investments': ['Investment', 'Investing', 'Personal finance', 'Stock market', 'Finance'],  
      'Business': ['Business and industry', 'Entrepreneurship', 'Small business', 'Business'],
      'Fashion': ['Fashion', 'Clothing', 'Style'],
      'Technology': ['Technology', 'Consumer electronics', 'Software'],
      'Fitness': ['Physical fitness', 'Health and wellness', 'Exercise']
    };
    
    for (const interestName of interestNames) {
      const searchTerms = interestMappings[interestName] || [interestName];
      let found = false;
      
      for (const searchTerm of searchTerms) {
        if (found) break;
        
        try {
          logger.info(`🔍 Searching Facebook interests for "${searchTerm}" (from "${interestName}")`);
          const response = await axios.get(`https://graph.facebook.com/v23.0/search`, {
            params: {
              type: 'adinterest',
              q: searchTerm,
              limit: 3, // Get multiple matches to find the best one
              access_token: this.getAccessToken()
            }
          });

          if (response.data.data && response.data.data.length > 0) {
            // Take the first valid result
            const interest = response.data.data[0];
            foundInterests.push({
              id: interest.id,
              name: interest.name
            });
            logger.info(`✅ Found Facebook interest ID for "${interestName}" → "${searchTerm}": ${interest.id} (${interest.name})`);
            found = true;
          }
        } catch (error) {
          logger.error(`❌ Error searching for interest "${searchTerm}":`, error);
        }
      }
      
      if (!found) {
        logger.warn(`⚠️ No Facebook interest found for "${interestName}" after trying ${searchTerms.length} search terms`);
      }
    }

    return foundInterests;
  }

  /**
   * Get the current access token
   */
  private getAccessToken(): string {
    // Force reload environment variables to get the latest token
    require('dotenv').config();
    return process.env.FB_ACCESS_TOKEN || '';
  }

  async getAccounts(params: GetAccountsParams): Promise<FacebookAccount[]> {
    if (!this.isInitialized) {
      throw new Error('Facebook API not initialized. Please check your FB_ACCESS_TOKEN environment variable.');
    }

    try {
      logger.info('Attempting to fetch Facebook accounts...');
      const me = new User('me');
      
      logger.info('Created User object, calling getAdAccounts...');
      const accounts = await me.getAdAccounts([
        'id',
        'name',
        'account_status',
        'currency',
        'timezone_name',
        'created_time',
        'amount_spent',
        'spend_cap'
      ], {
        limit: params.limit || 50,
      });

      logger.info(`Raw accounts response: ${JSON.stringify(accounts, null, 2)}`);
      logger.info(`Number of accounts found: ${accounts ? accounts.length : 0}`);

      if (!accounts || accounts.length === 0) {
        logger.warn('No ad accounts found for this user');
        return [];
      }

      const accountsWithMetrics: FacebookAccount[] = [];

      for (const account of accounts) {
        logger.info(`Processing account: ${account.id} - ${account.name}`);
        
        // Fetch real insights data for each account
        let insights;
        try {
          insights = await this.getAccountInsights(account.id);
          logger.info(`✅ [INSIGHTS] Account ${account.id} insights:`, JSON.stringify(insights, null, 2));
        } catch (error) {
          logger.warn(`⚠️ [INSIGHTS] Failed to fetch insights for account ${account.id}:`, error);
          insights = this.getEmptyInsights();
        }

        // Get campaign count for this account
        let campaignCounts = { active: 0, total: 0 };
        try {
          const campaigns = await this.getCampaigns({ 
            accountId: account.id, 
            limit: 100,
            status: ['ACTIVE', 'PAUSED', 'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES']
          });
          campaignCounts.total = campaigns.length;
          campaignCounts.active = campaigns.filter(c => c.status === 'active').length;
          logger.info(`📊 [CAMPAIGNS] Account ${account.id} has ${campaignCounts.active} active/${campaignCounts.total} total campaigns`);
        } catch (error) {
          logger.warn(`⚠️ [CAMPAIGNS] Failed to fetch campaigns for account ${account.id}:`, error);
        }
        
        accountsWithMetrics.push({
          id: account.id,
          name: account.name,
          status: this.mapAccountStatus(account.account_status),
          currency: account.currency || 'USD',
          timezone: account.timezone_name || 'UTC',
          lastActivity: new Date(),
          createdAt: new Date(account.created_time || Date.now()),
          metrics: {
            ctr: insights.ctr || 0,
            cpm: insights.cpm || 0,
            cpc: insights.cpc || 0,
            budget: account.spend_cap || 0,
            spend: insights.spend || parseFloat(account.amount_spent) || 0,
            impressions: insights.impressions || 0,
            clicks: insights.clicks || 0,
            conversions: insights.conversions || 0,
            reach: insights.reach || 0,
            frequency: insights.frequency || 1,
          },
          activeCampaigns: campaignCounts.active,
          totalCampaigns: campaignCounts.total,
        });
      }

      logger.info(`Successfully processed ${accountsWithMetrics.length} accounts`);
      return accountsWithMetrics;
    } catch (error) {
      logger.error('Error fetching Facebook accounts:', error);
      logger.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return [];
    }
  }

  async getPages(params: GetPagesParams = {}): Promise<FacebookPage[]> {
    if (!this.isInitialized) {
      throw new Error('Facebook API not initialized. Please check your FB_ACCESS_TOKEN environment variable.');
    }

    try {
      logger.info('🔍 Fetching accessible Facebook Pages...');
      
      const accessToken = this.getAccessToken();
      const response = await axios.get(
        'https://graph.facebook.com/v23.0/me/accounts',
        {
          params: {
            access_token: accessToken,
            fields: 'id,name,category,tasks,access_token',
            limit: params.limit || 50
          },
          timeout: 30000
        }
      );

      const rawPages = response.data.data || [];
      logger.info(`📋 Found ${rawPages.length} accessible pages`);

      const pages: FacebookPage[] = rawPages.map((page: any) => ({
        id: page.id,
        name: page.name,
        category: page.category || 'Unknown',
        tasks: page.tasks || [],
        accessToken: page.access_token,
        createdAt: new Date()
      }));

      // Log page details for transparency
      pages.forEach(page => {
        logger.info(`📄 Page: "${page.name}" (${page.id}) - Tasks: [${page.tasks.join(', ')}]`);
      });

      return pages;
    } catch (error) {
      logger.error('❌ Error fetching Facebook pages:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return [];
    }
  }

  /**
   * Get pages that can be promoted (used for ads) in a specific ad account
   * This is essential for lead generation campaigns which require a valid page_id
   */
  async getPromotablePages(accountId: string): Promise<Array<{ id: string; name: string; canPromote: boolean }>> {
    if (!this.isInitialized) {
      throw new Error('Facebook API not initialized. Please check your FB_ACCESS_TOKEN environment variable.');
    }

    try {
      logger.info(`🔍 Fetching promotable pages for ad account ${accountId}...`);
      
      const accessToken = this.getAccessToken();
      const cleanAccountId = accountId.replace('act_', '');
      
      const response = await axios.get(
        `https://graph.facebook.com/v23.0/act_${cleanAccountId}/promotable_pages`,
        {
          params: {
            access_token: accessToken,
            fields: 'id,name'
          },
          timeout: 30000
        }
      );

      const rawPages = response.data.data || [];
      logger.info(`📋 Found ${rawPages.length} promotable pages for ad account ${accountId}`);

      const pages = rawPages.map((page: any) => {
        logger.info(`✅ Promotable Page: "${page.name}" (${page.id})`);
        return {
          id: page.id,
          name: page.name,
          canPromote: true
        };
      });

      if (pages.length === 0) {
        logger.warn(`⚠️ No promotable pages found for ad account ${accountId}`);
        logger.warn(`💡 To fix this, you need to:`);
        logger.warn(`   1. Go to Facebook Business Settings`);
        logger.warn(`   2. Associate a Facebook Page with this ad account`);
        logger.warn(`   3. Give the page advertising permissions`);
      }

      return pages;
    } catch (error) {
      logger.error('❌ Error fetching promotable pages:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        accountId
      });
      
      // Return helpful error information
      if ((error as any).response?.data?.error) {
        const fbError = (error as any).response.data.error;
        logger.error(`🚫 Facebook API Error: ${fbError.message}`);
        if (fbError.code === 190) {
          logger.error(`💡 Your access token may have expired. Generate a new one from the Facebook Developer Console.`);
        }
      }
      
      return [];
    }
  }

  async getCampaigns(params: GetCampaignsParams): Promise<FacebookCampaign[]> {
    if (!this.isInitialized) {
      throw new Error('Facebook API not initialized. Please check your FB_ACCESS_TOKEN environment variable.');
    }

    try {
      const account = new AdAccount(params.accountId);
      const campaigns = await account.getCampaigns([
        'id',
        'name',
        'status',
        'objective',
        'created_time',
        'updated_time',
        'start_time',
        'stop_time',
        'daily_budget',
        'lifetime_budget',
        'budget_remaining',
      ], {
        limit: params.limit,
        // Include campaign statuses but exclude ARCHIVED (often contains deleted campaigns)
        effective_status: params.status || ['ACTIVE', 'PAUSED', 'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES'],
      });

      const campaignsWithMetrics: FacebookCampaign[] = [];

      for (const campaign of campaigns) {
        const insights = await this.getCampaignInsights(campaign.id);
        
        // Note: Facebook API v23.0+ doesn't provide targeting at campaign level
        // Targeting data is available at ad set level only
        const targeting = {
          countries: [],
          ageMin: undefined,
          ageMax: undefined,
          gender: 'all' as const,
          interests: [],
          behaviors: [],
        };
        
        campaignsWithMetrics.push({
          id: campaign.id,
          accountId: params.accountId,
          name: campaign.name,
          status: this.mapCampaignStatus(campaign.status),
          objective: campaign.objective,
          budget: {
            daily: campaign.daily_budget,
            lifetime: campaign.lifetime_budget,
            remaining: campaign.budget_remaining || 0,
          },
          targeting,
          performance: {
            spend: insights.spend || 0,
            impressions: insights.impressions || 0,
            clicks: insights.clicks || 0,
            ctr: insights.ctr || 0,
            cpm: insights.cpm || 0,
            cpc: insights.cpc || 0,
            conversions: insights.conversions || 0,
            costPerConversion: insights.costPerConversion || 0,
          },
          startDate: new Date(campaign.start_time),
          endDate: campaign.stop_time ? new Date(campaign.stop_time) : undefined,
          createdAt: new Date(campaign.created_time),
          updatedAt: new Date(campaign.updated_time),
        });
      }

      return campaignsWithMetrics;
    } catch (error) {
      logger.error('Error fetching Facebook campaigns:', error);
      throw error;
    }
  }

  async createCampaign(params: CreateCampaignParams): Promise<FacebookCampaign> {
    if (!this.isInitialized) {
      throw new Error('Facebook API not initialized. Please check your FB_ACCESS_TOKEN environment variable.');
    }

    try {
      logger.info(`🚀 Creating campaign "${params.name}" for account ${params.accountId}`);
      logger.info(`📊 Campaign parameters:`, JSON.stringify(params, null, 2));
      
      // Validate required parameters
      if (!params.name || !params.objective || !params.accountId) {
        throw new Error('Missing required parameters: name, objective, and accountId are required');
      }

      // Ensure we have either daily budget or lifetime budget
      if (!params.dailyBudget && !params.lifetimeBudget) {
        logger.warn('⚠️ No budget specified, setting default daily budget of $10');
        params.dailyBudget = 1000; // $10 in cents
      }

      const account = new AdAccount(params.accountId);
      
      const campaignData: any = {
        name: params.name,
        objective: params.objective,
        status: params.status || 'PAUSED', // Default to PAUSED for safety
        special_ad_categories: [], // Required by Facebook API - empty array for general campaigns
      };

      if (params.dailyBudget) {
        campaignData.daily_budget = params.dailyBudget;
        logger.info(`💰 Daily budget set: $${(params.dailyBudget / 100).toFixed(2)}`);
      }

      if (params.lifetimeBudget) {
        campaignData.lifetime_budget = params.lifetimeBudget;
        logger.info(`💰 Lifetime budget set: $${(params.lifetimeBudget / 100).toFixed(2)}`);
      }

      // Note: Facebook API v23.0+ doesn't support targeting at campaign level
      // Targeting must be set at the Ad Set level
      if (params.targeting) {
        logger.info('📍 Targeting parameters received (will be used for ad set creation):', JSON.stringify(params.targeting, null, 2));
        logger.info('⚠️ Facebook API v23.0+: Targeting is set at Ad Set level, not Campaign level');
      }

      logger.info(`🔄 Sending campaign creation request to Facebook API:`, JSON.stringify(campaignData, null, 2));
      const campaign = await account.createCampaign([], campaignData);

      logger.info(`✅ Successfully created campaign ${campaign.id} for account ${params.accountId}`);
      logger.info(`📋 Campaign details: Name="${params.name}", Objective=${params.objective}, Status=${params.status}`);

      return {
        id: campaign.id,
        accountId: params.accountId,
        name: params.name,
        status: this.mapCampaignStatus(params.status || 'PAUSED'),
        objective: params.objective,
        budget: {
          daily: params.dailyBudget,
          lifetime: params.lifetimeBudget,
          remaining: params.lifetimeBudget || params.dailyBudget || 0,
        },
        targeting: {
          countries: params.targeting?.geoLocations?.countries || [],
          ageMin: params.targeting?.ageMin,
          ageMax: params.targeting?.ageMax,
          gender: params.targeting?.genders ? (params.targeting.genders.includes(1) && params.targeting.genders.includes(2) ? 'all' : params.targeting.genders.includes(1) ? 'male' : 'female') : 'all',
          interests: params.targeting?.interests || [],
          behaviors: params.targeting?.behaviors || [],
        },
        performance: {
          spend: 0,
          impressions: 0,
          clicks: 0,
          ctr: 0,
          cpm: 0,
          cpc: 0,
          conversions: 0,
          costPerConversion: 0,
        },
        startDate: new Date(),
        endDate: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      logger.error('❌ Error creating Facebook campaign:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        campaignName: params.name,
        accountId: params.accountId,
        objective: params.objective
      });
      
      // Enhanced error handling for common Facebook API issues
      if (error instanceof Error) {
        if (error.message.includes('budget')) {
          throw new Error(`Budget error: ${error.message}. Please check that daily_budget or lifetime_budget is properly specified.`);
        }
        if (error.message.includes('objective')) {
          throw new Error(`Objective error: ${error.message}. Valid objectives include: TRAFFIC, CONVERSIONS, LEAD_GENERATION, etc.`);
        }
        if (error.message.includes('permission')) {
          throw new Error(`Permission error: ${error.message}. Please check your Facebook app permissions and access token.`);
        }
      }
      
      throw error;
    }
  }

  async updateCampaign(params: UpdateCampaignParams): Promise<FacebookCampaign> {
    if (!this.isInitialized) {
      throw new Error('Facebook API not initialized. Please check your FB_ACCESS_TOKEN environment variable.');
    }

    try {
      const campaign = new Campaign(params.campaignId);
      const updateData: any = {};

      if (params.name) updateData.name = params.name;
      if (params.status) updateData.status = params.status;
      if (params.dailyBudget) updateData.daily_budget = params.dailyBudget;
      if (params.lifetimeBudget) updateData.lifetime_budget = params.lifetimeBudget;

      await campaign.update([], updateData);

      logger.info(`Updated campaign ${params.campaignId}`);

      // Fetch updated campaign data
      const updatedCampaign = await campaign.read([
        'id',
        'name',
        'status',
        'objective',
        'account_id',
        'daily_budget',
        'lifetime_budget',
        'budget_remaining',
        'created_time',
        'updated_time',
      ]);

      return {
        id: updatedCampaign.id,
        accountId: updatedCampaign.account_id,
        name: updatedCampaign.name,
        status: this.mapCampaignStatus(updatedCampaign.status),
        objective: updatedCampaign.objective,
        budget: {
          daily: updatedCampaign.daily_budget,
          lifetime: updatedCampaign.lifetime_budget,
          remaining: updatedCampaign.budget_remaining || 0,
        },
        targeting: {
          countries: [],
          gender: 'all',
          interests: [],
          behaviors: [],
        },
        performance: {
          spend: 0,
          impressions: 0,
          clicks: 0,
          ctr: 0,
          cpm: 0,
          cpc: 0,
          conversions: 0,
          costPerConversion: 0,
        },
        startDate: new Date(),
        endDate: undefined,
        createdAt: new Date(updatedCampaign.created_time),
        updatedAt: new Date(updatedCampaign.updated_time),
      };
    } catch (error) {
      // Check if this is a "deleted campaign" error from Facebook API
      const errorResponse = (error as any)?.response;
      const isDeletedCampaignError = 
        errorResponse?.error_user_title?.includes('Deleted campaigns can\'t be edited') ||
        errorResponse?.error_user_msg?.includes('This campaign has been deleted') ||
        (error instanceof Error && error.message?.includes('Deleted campaigns can\'t be edited'));
      
      if (isDeletedCampaignError) {
        logger.warn(`Campaign ${params.campaignId} appears to be deleted and cannot be updated`);
        throw new Error(`Campaign ${params.campaignId} has been deleted in Facebook and cannot be modified. Please remove it from your campaign list.`);
      }
      
      logger.error('Error updating Facebook campaign:', error);
      throw error;
    }
  }

  async getInsights(params: GetInsightsParams): Promise<FacebookInsights> {
    if (!this.isInitialized) {
      throw new Error('Facebook API not initialized. Please check your FB_ACCESS_TOKEN environment variable.');
    }

    try {
      const fields = params.fields || [
        'spend',
        'impressions',
        'clicks',
        'ctr',
        'cpm',
        'cpc',
        'conversions',
        'cost_per_conversion',
        'reach',
        'frequency',
      ];

      const insightParams = {
        date_preset: params.datePreset,
        fields: fields,
      };

      let insights: any;

      switch (params.level) {
        case 'account':
          if (!params.accountId) throw new Error('Account ID required for account-level insights');
          const account = new AdAccount(params.accountId);
          insights = await account.getInsights(fields, insightParams);
          break;
        case 'campaign':
          if (!params.campaignId) throw new Error('Campaign ID required for campaign-level insights');
          const campaign = new Campaign(params.campaignId);
          insights = await campaign.getInsights(fields, insightParams);
          break;
        case 'adset':
          if (!params.adSetId) throw new Error('Ad Set ID required for ad set-level insights');
          const adSet = new AdSet(params.adSetId);
          insights = await adSet.getInsights(fields, insightParams);
          break;
        case 'ad':
          if (!params.adId) throw new Error('Ad ID required for ad-level insights');
          const ad = new Ad(params.adId);
          insights = await ad.getInsights(fields, insightParams);
          break;
        default:
          throw new Error(`Unknown insights level: ${params.level}`);
      }

      if (!insights || insights.length === 0) {
        return this.getEmptyInsights();
      }

      const insight = insights[0];
      return this.mapInsights(insight);
    } catch (error) {
      logger.error('Error fetching Facebook insights:', error);
      throw error;
    }
  }

  // Helper methods
  private mapAccountStatus(status: number): 'active' | 'inactive' | 'limited' | 'disabled' {
    switch (status) {
      case 1: return 'active';
      case 2: return 'disabled';
      case 3: return 'limited';
      default: return 'inactive';
    }
  }

  private mapCampaignStatus(status: string): 'active' | 'paused' | 'deleted' {
    switch (status) {
      case 'ACTIVE': return 'active';
      case 'PAUSED': return 'paused';
      case 'DELETED': return 'deleted';
      default: return 'paused';
    }
  }

  private mapInsights(insight: any): FacebookInsights {
    logger.info(`🔄 [FB API] Mapping raw insight data:`, JSON.stringify(insight, null, 2));
    
    const mapped = {
      spend: parseFloat(insight.spend) || 0,
      impressions: parseInt(insight.impressions) || 0,
      clicks: parseInt(insight.clicks) || 0,
      ctr: parseFloat(insight.ctr) || 0,
      cpm: parseFloat(insight.cpm) || 0,
      cpc: parseFloat(insight.cpc) || 0,
      conversions: parseInt(insight.conversions) || 0,
      costPerConversion: parseFloat(insight.cost_per_conversion) || 0,
      reach: parseInt(insight.reach) || 0,
      frequency: parseFloat(insight.frequency) || 1,
    };
    
    logger.info(`✅ [FB API] Mapped insight values:`, {
      'spend (raw → mapped)': `${insight.spend} → ${mapped.spend}`,
      'impressions (raw → mapped)': `${insight.impressions} → ${mapped.impressions}`,
      'clicks (raw → mapped)': `${insight.clicks} → ${mapped.clicks}`,
      'ctr (raw → mapped)': `${insight.ctr} → ${mapped.ctr}`,
      'cpm (raw → mapped)': `${insight.cpm} → ${mapped.cpm}`,
      'cpc (raw → mapped)': `${insight.cpc} → ${mapped.cpc}`,
      'conversions (raw → mapped)': `${insight.conversions} → ${mapped.conversions}`,
      'cost_per_conversion (raw → mapped)': `${insight.cost_per_conversion} → ${mapped.costPerConversion}`,
      'reach (raw → mapped)': `${insight.reach} → ${mapped.reach}`,
      'frequency (raw → mapped)': `${insight.frequency} → ${mapped.frequency}`
    });
    
    return mapped;
  }

  private getEmptyInsights(): FacebookInsights {
    return {
      spend: 0,
      impressions: 0,
      clicks: 0,
      ctr: 0,
      cpm: 0,
      cpc: 0,
      conversions: 0,
      costPerConversion: 0,
      reach: 0,
      frequency: 0,
    };
  }


  private async getAccountInsights(accountId: string): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Facebook API not initialized. Please check your FB_ACCESS_TOKEN environment variable.');
    }

    try {
      logger.info(`🔍 [FB API] Requesting insights for account: ${accountId}`);
      const account = new AdAccount(accountId);
      
      const fieldsRequested = [
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
      ];
      
      const params = {
        date_preset: 'last_7d'
      };
      
      logger.info(`🔍 [FB API] Insights request - Fields: ${fieldsRequested.join(', ')}, Params:`, JSON.stringify(params, null, 2));
      
      const insights = await account.getInsights(fieldsRequested, params);

      logger.info(`📊 [FB API] Raw insights response for account ${accountId}:`, JSON.stringify(insights, null, 2));
      logger.info(`📊 [FB API] Insights count: ${insights ? insights.length : 0}`);

      if (!insights || insights.length === 0) {
        logger.warn(`⚠️ [FB API] No insights data found for account ${accountId}, returning empty insights`);
        return this.getEmptyInsights();
      }

      const insight = insights[0];
      logger.info(`📊 [FB API] First insight object for account ${accountId}:`, JSON.stringify(insight, null, 2));
      
      const mappedInsights = this.mapInsights(insight);
      logger.info(`✅ [FB API] Mapped insights for account ${accountId}:`, JSON.stringify(mappedInsights, null, 2));
      
      return mappedInsights;
    } catch (error) {
      logger.error(`🚨 [FB API] Error fetching account insights for ${accountId}:`, error);
      logger.error(`🚨 [FB API] Error details:`, {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        accountId
      });
      throw error;
    }
  }

  private async getCampaignInsights(campaignId: string): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Facebook API not initialized. Please check your FB_ACCESS_TOKEN environment variable.');
    }

    try {
      logger.info(`🔍 [FB API] Requesting campaign insights for: ${campaignId}`);
      const campaign = new Campaign(campaignId);
      
      const fieldsRequested = [
        'spend',
        'impressions',
        'clicks', 
        'ctr',
        'cpm',
        'cpc',
        'conversions',
        'cost_per_conversion'
      ];
      
      const params = {
        date_preset: 'last_7d'
      };
      
      logger.info(`🔍 [FB API] Campaign insights request - Fields: ${fieldsRequested.join(', ')}, Params:`, JSON.stringify(params, null, 2));
      
      const insights = await campaign.getInsights(fieldsRequested, params);

      logger.info(`📊 [FB API] Raw campaign insights response for ${campaignId}:`, JSON.stringify(insights, null, 2));
      logger.info(`📊 [FB API] Campaign insights count: ${insights ? insights.length : 0}`);

      if (!insights || insights.length === 0) {
        logger.warn(`⚠️ [FB API] No campaign insights data found for ${campaignId}, returning empty insights`);
        return this.getEmptyInsights();
      }

      const insight = insights[0];
      logger.info(`📊 [FB API] First campaign insight object for ${campaignId}:`, JSON.stringify(insight, null, 2));
      
      const mappedInsights = this.mapInsights(insight);
      logger.info(`✅ [FB API] Mapped campaign insights for ${campaignId}:`, JSON.stringify(mappedInsights, null, 2));
      
      return mappedInsights;
    } catch (error) {
      logger.error(`🚨 [FB API] Error fetching campaign insights for ${campaignId}:`, error);
      logger.error(`🚨 [FB API] Campaign insights error details:`, {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        campaignId
      });
      throw error;
    }
  }

  // Ad Set Management Methods - Simplified for SDK compatibility
  async getAdSets(params: GetAdSetsParams): Promise<FacebookAdSet[]> {
    if (!this.isInitialized) {
      throw new Error('Facebook API not initialized. Please check your FB_ACCESS_TOKEN environment variable.');
    }

    try {
      const accessToken = process.env.FB_ACCESS_TOKEN;
      
      const url = `https://graph.facebook.com/v23.0/${params.campaignId}/adsets`;
      
      const response = await axios.get(url, {
        params: {
          access_token: accessToken,
          fields: 'id,name,status,optimization_goal,billing_event,daily_budget,lifetime_budget,targeting,created_time,updated_time',
          limit: params.limit || 25
        }
      });

      const adSets = response.data.data || [];
      
      return adSets.map((adSetData: any) => ({
        id: adSetData.id,
        accountId: `act_${adSetData.account_id || ''}`,
        campaignId: params.campaignId || adSetData.campaign_id,
        name: adSetData.name,
        status: this.mapAdSetStatus(adSetData.status),
        optimizationGoal: adSetData.optimization_goal,
        billingEvent: adSetData.billing_event,
        budget: {
          daily: adSetData.daily_budget ? parseInt(adSetData.daily_budget) : undefined,
          lifetime: adSetData.lifetime_budget ? parseInt(adSetData.lifetime_budget) : undefined,
          remaining: adSetData.daily_budget ? parseInt(adSetData.daily_budget) : (adSetData.lifetime_budget ? parseInt(adSetData.lifetime_budget) : 0),
        },
        targeting: {
          countries: adSetData.targeting?.geo_locations?.countries || [],
          ageMin: adSetData.targeting?.age_min,
          ageMax: adSetData.targeting?.age_max,
          gender: this.parseGenderFromFBResponse(adSetData.targeting?.genders),
          interests: adSetData.targeting?.interests?.map((i: any) => i.name) || [],
          behaviors: adSetData.targeting?.behaviors?.map((b: any) => b.name) || [],
          customAudiences: adSetData.targeting?.custom_audiences?.map((a: any) => a.id) || [],
        },
        performance: {
          spend: 0,
          impressions: 0,
          clicks: 0,
          ctr: 0,
          cpm: 0,
          cpc: 0,
          conversions: 0,
          costPerConversion: 0,
        },
        startDate: new Date(adSetData.created_time || Date.now()),
        createdAt: new Date(adSetData.created_time || Date.now()),
        updatedAt: new Date(adSetData.updated_time || Date.now()),
      }));
    } catch (error) {
      logger.error('Error fetching Facebook ad sets:', error);
      throw error;
    }
  }

  /**
   * Validate and fix targeting parameters based on campaign name context
   */
  private validateAndFixTargeting(campaignName: string, targeting: any): any {
    if (!targeting) return targeting;
    
    const fixedTargeting = { ...targeting };
    const nameLower = campaignName.toLowerCase();
    
    logger.info(`🔍 Validating targeting against campaign name: "${campaignName}"`);
    logger.info(`🔍 Original targeting:`, JSON.stringify(targeting, null, 2));
    
    // Fix gender based on campaign name - use word boundaries for accuracy
    const menPattern = /\b(men|male|guys|boys)\b/i;
    const womenPattern = /\b(women|woman|female|girls|ladies)\b/i;
    
    if (menPattern.test(campaignName) && !womenPattern.test(campaignName)) {
      if (targeting.genders && (targeting.genders[0] === 2 || targeting.genders.includes(2))) {
        logger.warn(`⚠️ FIXING GENDER: Campaign name mentions 'men' but targeting has genders: ${JSON.stringify(targeting.genders)} → [1]`);
        fixedTargeting.genders = [1]; // Male
      }
    } else if (womenPattern.test(campaignName) && !menPattern.test(campaignName)) {
      if (targeting.genders && (targeting.genders[0] === 1 || targeting.genders.includes(1))) {
        logger.warn(`⚠️ FIXING GENDER: Campaign name mentions 'women' but targeting has genders: ${JSON.stringify(targeting.genders)} → [2]`);
        fixedTargeting.genders = [2]; // Female
      }
    }
    
    // Fix age range based on campaign name
    const ageRangeMatch = nameLower.match(/(\d+)[-\s]*(\d+)/);
    if (ageRangeMatch) {
      const expectedAgeMin = parseInt(ageRangeMatch[1]);
      const expectedAgeMax = parseInt(ageRangeMatch[2]);
      
      if (targeting.ageMin !== expectedAgeMin || targeting.ageMax !== expectedAgeMax) {
        logger.warn(`⚠️ FIXING AGE: Campaign name suggests ${expectedAgeMin}-${expectedAgeMax} but targeting has ${targeting.ageMin}-${targeting.ageMax}`);
        fixedTargeting.ageMin = expectedAgeMin;
        fixedTargeting.ageMax = expectedAgeMax;
      }
    }
    
    // Fix interests based on campaign name - be less aggressive, only fix obvious conflicts
    const investmentPattern = /\b(investment|invest|trading|stocks|crypto|finance|money|income)\b/i;
    const fashionPattern = /\b(fashion|style|clothing|apparel|outfit)\b/i;
    
    // Only fix if there's a clear conflict between campaign name and targeting
    if (investmentPattern.test(campaignName) && !fashionPattern.test(campaignName)) {
      if (targeting.interests && targeting.interests.some((i: string) => i.toLowerCase().includes('fashion'))) {
        logger.warn(`⚠️ FIXING INTERESTS: Campaign name is about investment but targeting includes fashion interests`);
        fixedTargeting.interests = ['Investment', 'Personal finance', 'Business and industry'];
      }
    } else if (fashionPattern.test(campaignName) && !investmentPattern.test(campaignName)) {
      if (targeting.interests && !targeting.interests.some((i: string) => i.toLowerCase().includes('fashion'))) {
        logger.warn(`⚠️ FIXING INTERESTS: Campaign name mentions fashion but targeting lacks fashion interests`);
        fixedTargeting.interests = ['Fashion'];
      }
    }
    
    // For mixed campaigns (e.g., "Fashion and Passive Income"), keep original targeting
    if (investmentPattern.test(campaignName) && fashionPattern.test(campaignName)) {
      logger.info(`📋 Campaign targets both fashion and investment - keeping original interests: ${targeting.interests?.join(', ')}`);
    }
    
    logger.info(`✅ Fixed targeting:`, JSON.stringify(fixedTargeting, null, 2));
    return fixedTargeting;
  }

  async createAdSet(params: CreateAdSetParams): Promise<FacebookAdSet> {
    if (!this.isInitialized) {
      throw new Error('Facebook API not initialized. Please check your FB_ACCESS_TOKEN environment variable.');
    }

    try {
      logger.info(`🚀 Creating ad set "${params.name}" for campaign ${params.campaignId}`);
      logger.info(`📊 Ad Set parameters:`, JSON.stringify(params, null, 2));
      
      // Validate required parameters
      if (!params.name || !params.campaignId || !params.accountId) {
        throw new Error('Missing required parameters: name, campaignId, and accountId are required');
      }

      // Note: Facebook now requires budget at either campaign OR ad set level, not both
      // If campaign has budget, ad set should not have budget
      // Only set ad set budget if explicitly provided and we know campaign doesn't have budget
      if (!params.dailyBudget && !params.lifetimeBudget) {
        logger.info('ℹ️ No budget specified for ad set - assuming campaign-level budget is used');
        // Don't set default budget - let Facebook handle this based on campaign budget
      }

      // Set default optimization and billing if not provided
      if (!params.optimizationGoal) {
        params.optimizationGoal = 'LINK_CLICKS';
        logger.info(`📊 Setting default optimization goal: ${params.optimizationGoal}`);
      }
      if (!params.billingEvent) {
        params.billingEvent = 'LINK_CLICKS';
        logger.info(`💳 Setting default billing event: ${params.billingEvent}`);
      }
      
      const account = new AdAccount(params.accountId);
      
      // Handle locales at root level - move into targeting if needed
      // AI sometimes puts locales outside of targeting object
      const rootLocales = (params as any).locales;
      if (rootLocales && Array.isArray(rootLocales)) {
        if (!params.targeting) {
          (params as any).targeting = {};
        }
        if (params.targeting && !params.targeting.locales) {
          params.targeting.locales = rootLocales;
          logger.info(`🌐 Moved locales from root level into targeting: ${JSON.stringify(rootLocales)}`);
        }
      }
      
      // Validate and fix targeting parameters
      const fixedTargeting = this.validateAndFixTargeting(params.name, params.targeting);
      const correctedParams = { ...params, targeting: fixedTargeting };
      
      const adSetData: any = {
        name: correctedParams.name,
        campaign_id: correctedParams.campaignId,
        optimization_goal: correctedParams.optimizationGoal,
        billing_event: correctedParams.billingEvent,
        status: correctedParams.status || 'PAUSED',
      };

      // Add budget if explicitly specified (avoid conflicts with campaign-level budgets)
      if (correctedParams.dailyBudget) {
        adSetData.daily_budget = correctedParams.dailyBudget;
        logger.info(`💰 Setting ad set daily budget: $${(correctedParams.dailyBudget / 100).toFixed(2)}`);
      }

      if (correctedParams.lifetimeBudget) {
        adSetData.lifetime_budget = correctedParams.lifetimeBudget;
        logger.info(`💰 Setting ad set lifetime budget: $${(correctedParams.lifetimeBudget / 100).toFixed(2)}`);
      }

      if (!correctedParams.dailyBudget && !correctedParams.lifetimeBudget) {
        logger.info(`💰 No ad set budget specified - using campaign-level budget`);
      }

      // Add bid amount if specified
      if (correctedParams.bidAmount) {
        adSetData.bid_amount = correctedParams.bidAmount;
      }

      // Add DSA beneficiary for compliance (required for EU/Romania targeting)
      // This is required for Digital Services Act compliance when targeting certain regions
      const euCountries = ['RO', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PL', 'SE', 'DK', 'FI', 'NO', 'CZ', 'HU', 'PT', 'GR', 'IE', 'LV', 'LT', 'EE', 'SI', 'SK', 'HR', 'BG', 'MT', 'LU', 'CY'];
      // Check both geoLocations.countries and root-level countries (AI sends both formats)
      const targetingCountries = correctedParams.targeting?.geoLocations?.countries || (correctedParams.targeting as any)?.countries || [];
      const targetingEuCountries = targetingCountries.filter((country: string) => 
        euCountries.includes(country)
      );
      
      if (targetingEuCountries.length > 0) {
        const dsaBeneficiary = process.env.FB_DSA_BENEFICIARY;
        const dsaPayor = process.env.FB_DSA_PAYOR;
        
        if (!dsaBeneficiary || !dsaPayor) {
          logger.error(`❌ DSA compliance fields required for EU targeting but environment variables not set!`);
          logger.error(`❌ Targeting EU countries: ${targetingEuCountries.join(', ')}`);
          logger.error(`💡 SOLUTION: Add these environment variables to your .env file:`);
          logger.error(`💡 FB_DSA_BENEFICIARY="Your Company Name"`);
          logger.error(`💡 FB_DSA_PAYOR="Your Company Name"`);
          logger.error(`💡 For most advertisers, you can use your company name for both fields.`);
          throw new Error(`DSA Compliance Required: When targeting EU countries (${targetingEuCountries.join(', ')}), you must set FB_DSA_BENEFICIARY and FB_DSA_PAYOR environment variables. Add them to your .env file with your company name.`);
        }
        
        adSetData.dsa_beneficiary = dsaBeneficiary;
        adSetData.dsa_payor = dsaPayor;
        logger.info(`🇪🇺 Added DSA compliance fields for EU targeting. Countries: ${targetingEuCountries.join(', ')}`);
        logger.info(`📋 DSA Beneficiary: ${dsaBeneficiary}, DSA Payor: ${dsaPayor}`);
      }

      // Add targeting if specified
      if (correctedParams.targeting) {
        const targeting: any = {};
        
        // 🛡️ AUTO-FIX: Handle both targeting.geoLocations.countries AND targeting.countries
        // AI sometimes sends countries at root level instead of nested in geoLocations
        let geoLocations = correctedParams.targeting.geoLocations;
        
        // If countries is at root level (not in geoLocations), wrap it properly
        if (!geoLocations && (correctedParams.targeting as any).countries) {
          logger.info(`🔧 AUTO-FIX: Moving targeting.countries into targeting.geoLocations.countries`);
          geoLocations = {
            countries: (correctedParams.targeting as any).countries
          };
        }
        
        if (geoLocations) {
          targeting.geo_locations = {};
          if (geoLocations.countries) {
            targeting.geo_locations.countries = geoLocations.countries;
            logger.info(`🌍 Country targeting: ${geoLocations.countries.join(', ')}`);
          }
          if (geoLocations.regions) {
            targeting.geo_locations.regions = geoLocations.regions;
          }
          if (geoLocations.cities) {
            targeting.geo_locations.cities = geoLocations.cities;
          }
        }

        if (correctedParams.targeting.ageMin) {
          targeting.age_min = correctedParams.targeting.ageMin;
        }

        if (correctedParams.targeting.ageMax) {
          targeting.age_max = correctedParams.targeting.ageMax;
        }

        if (correctedParams.targeting.genders) {
          // Fix gender targeting - Facebook expects [1] for male, [2] for female, [1,2] for all
          // Remove any invalid gender values (0 is not valid)
          const validGenders = correctedParams.targeting.genders.filter((g: number) => g === 1 || g === 2);
          if (validGenders.length > 0) {
            targeting.genders = validGenders;
            logger.info(`👥 Gender targeting set to: ${validGenders.map((g: number) => g === 1 ? 'Male' : 'Female').join(', ')}`);
          } else {
            // Default to all genders if no valid genders provided
            targeting.genders = [1, 2];
            logger.info(`👥 No valid gender targeting provided, defaulting to all genders`);
          }
        }

        if (correctedParams.targeting.interests && correctedParams.targeting.interests.length > 0) {
          // Look up proper Facebook interest IDs
          logger.info(`🔍 Looking up Facebook interest IDs for: ${correctedParams.targeting.interests.join(', ')}`);
          try {
            const foundInterests = await this.searchInterestIds(correctedParams.targeting.interests);
            
            if (foundInterests.length > 0) {
              targeting.interests = foundInterests;
              logger.info(`✅ Added ${foundInterests.length} interests to targeting:`, foundInterests.map((i: any) => `${i.name} (${i.id})`).join(', '));
            } else {
              logger.warn(`⚠️ No Facebook interests found for: ${correctedParams.targeting.interests.join(', ')}`);
              logger.warn(`⚠️ Proceeding without interest targeting - this may result in broader audience`);
            }
          } catch (interestError) {
            logger.error(`❌ Error looking up interests:`, interestError);
            logger.warn(`⚠️ Proceeding without interest targeting due to lookup error`);
          }
        }

        if (correctedParams.targeting.behaviors) {
          targeting.behaviors = correctedParams.targeting.behaviors.map((behavior: string) => ({ name: behavior }));
        }

        if (correctedParams.targeting.customAudiences) {
          targeting.custom_audiences = correctedParams.targeting.customAudiences.map((audienceId: string) => ({ id: audienceId }));
        }

        // Language targeting - Uses Facebook Targeting Search API to look up valid locale IDs
        // Accepts both string codes (e.g., "ro", "en") and numeric Facebook locale IDs
        // Also check for locales at root level (AI sometimes puts them there)
        let localeInput = correctedParams.targeting?.locales;
        if (!localeInput || localeInput.length === 0) {
          // Fallback: check root level params for locales
          const rootLocales = (params as any).locales || (correctedParams as any).locales;
          if (rootLocales && Array.isArray(rootLocales) && rootLocales.length > 0) {
            localeInput = rootLocales;
            logger.info(`🌐 Found locales at root level, moving to targeting: ${JSON.stringify(rootLocales)}`);
          }
        }
        
        if (localeInput && localeInput.length > 0) {
          const stringCodes: string[] = [];
          const numericIds: number[] = [];
          
          // Separate string codes (need lookup) from numeric IDs (already valid)
          for (const locale of localeInput) {
            if (typeof locale === 'number') {
              numericIds.push(locale);
            } else if (typeof locale === 'string') {
              // Check if it's a numeric string
              const parsed = parseInt(locale, 10);
              if (!isNaN(parsed) && parsed.toString() === locale) {
                numericIds.push(parsed);
              } else {
                stringCodes.push(locale);
              }
            }
          }
          
          logger.info(`🌐 Processing locales: ${stringCodes.length} string codes, ${numericIds.length} numeric IDs`);
          
          try {
            const allLocaleIds: number[] = [...numericIds];
            
            // Look up string locale codes via Facebook API
            if (stringCodes.length > 0) {
              logger.info(`🌐 Looking up Facebook locale IDs for: ${stringCodes.join(', ')}`);
              const foundLocales = await this.searchLocaleIds(stringCodes);
              if (foundLocales.length > 0) {
                const foundIds = foundLocales.map(l => parseInt(l.key, 10));
                allLocaleIds.push(...foundIds);
                logger.info(`✅ Found ${foundLocales.length} locales:`, JSON.stringify(foundLocales, null, 2));
              } else {
                logger.warn(`⚠️ No valid Facebook locales found for: ${stringCodes.join(', ')}`);
              }
            }
            
            if (allLocaleIds.length > 0) {
              targeting.locales = allLocaleIds;
              logger.info(`✅ Added ${allLocaleIds.length} locales to targeting: ${allLocaleIds.join(', ')}`);
            } else {
              logger.info(`💡 Proceeding without language targeting. Country targeting is still applied.`);
            }
          } catch (localeError) {
            logger.error(`❌ Error looking up locales:`, localeError);
            logger.warn(`⚠️ Proceeding without language targeting due to lookup error`);
          }
        }

        if (Object.keys(targeting).length > 0) {
          // Add Facebook Advantage+ Audience requirement (set to 0 to disable)
          targeting.targeting_automation = {
            advantage_audience: 0
          };
          adSetData.targeting = targeting;
          logger.info(`🎯 Final targeting structure:`, JSON.stringify(targeting, null, 2));
        } else {
          logger.warn(`⚠️ No targeting parameters provided - ad set will have very broad targeting`);
        }
      }

      // Add promoted object for lead generation campaigns (required for OUTCOME_LEADS)
      if (correctedParams.optimizationGoal === 'LEAD_GENERATION') {
        let validPageId: string | null = null;
        
        const accessToken = this.getAccessToken();
        const accountId = correctedParams.accountId.replace('act_', '');
        
        // Method 1: Try to get promotable pages for the ad account
        try {
          logger.info(`🔍 Looking for promotable pages for ad account act_${accountId}...`);
          
          const pagesResponse = await axios.get(
            `https://graph.facebook.com/v23.0/act_${accountId}/promotable_pages`,
            {
              params: {
                access_token: accessToken,
                fields: 'id,name'
              },
              timeout: 15000
            }
          );
          
          const promotablePages = pagesResponse.data.data || [];
          logger.info(`📋 Found ${promotablePages.length} promotable pages for ad account`);
          
          if (promotablePages.length > 0) {
            validPageId = promotablePages[0].id;
            logger.info(`✅ Using promotable page: "${promotablePages[0].name}" (${validPageId})`);
          }
        } catch (pageError: any) {
          const errorMsg = pageError?.response?.data?.error?.message || pageError?.message || 'Unknown error';
          logger.warn(`⚠️ Could not fetch promotable_pages: ${errorMsg}`);
        }
        
        // Method 2: Try /me/accounts to get pages the user manages
        if (!validPageId) {
          try {
            logger.info(`🔍 Trying to get pages from /me/accounts...`);
            
            const userPagesResponse = await axios.get(
              `https://graph.facebook.com/v23.0/me/accounts`,
              {
                params: {
                  access_token: accessToken,
                  fields: 'id,name,tasks'
                },
                timeout: 15000
              }
            );
            
            const userPages = userPagesResponse.data.data || [];
            logger.info(`📋 Found ${userPages.length} pages via /me/accounts`);
            
            // Prefer pages with ADVERTISE permission
            const advertisePage = userPages.find((p: any) => p.tasks?.includes('ADVERTISE'));
            if (advertisePage) {
              validPageId = advertisePage.id;
              logger.info(`✅ Using page with ADVERTISE permission: "${advertisePage.name}" (${validPageId})`);
            } else if (userPages.length > 0) {
              validPageId = userPages[0].id;
              logger.info(`✅ Using first available page: "${userPages[0].name}" (${validPageId})`);
            }
          } catch (userPagesError: any) {
            const errorMsg = userPagesError?.response?.data?.error?.message || userPagesError?.message || 'Unknown error';
            logger.warn(`⚠️ Could not fetch /me/accounts: ${errorMsg}`);
          }
        }
        
        // Method 3: Only use FB_PAGE_ID if we couldn't find any pages via API
        // But DON'T use it if API calls succeeded but returned no valid pages
        // (this means the page isn't associated with the ad account)
        
        if (validPageId) {
          adSetData.promoted_object = {
            page_id: validPageId
          };
          logger.info(`📄 Added promoted object for lead generation: Page ID ${validPageId}`);
        } else {
          // Method 3: Try FB_PAGE_ID from environment as last resort
          // This page might not be detected via API but could still work
          const envPageId = process.env.FB_PAGE_ID;
          if (envPageId) {
            logger.warn(`⚠️ No pages found via API, but FB_PAGE_ID is set: ${envPageId}`);
            logger.warn(`⚠️ Attempting to use this page for lead generation...`);
            adSetData.promoted_object = {
              page_id: envPageId
            };
            logger.info(`📄 Added promoted object with FB_PAGE_ID: ${envPageId}`);
          } else {
            // NO VALID PAGE FOUND - Switch to IMPRESSIONS-based optimization
            logger.warn(`⚠️ NO VALID PAGE FOUND for lead generation!`);
            logger.warn(`⚠️ Switching optimization goal from LEAD_GENERATION to LINK_CLICKS`);
            logger.warn(`💡 To use lead generation, you need a Facebook Page associated with your ad account:`);
            logger.warn(`   1. Go to Facebook Business Settings → Accounts → Pages`);
            logger.warn(`   2. Add a Page to your Business account`);
            logger.warn(`   3. Assign the Page to ad account act_${accountId}`);
            
            // Switch to LINK_CLICKS optimization but keep IMPRESSIONS billing
            // (LINK_CLICKS billing may not be available for new ad accounts)
            adSetData.optimization_goal = 'LINK_CLICKS';
            adSetData.billing_event = 'IMPRESSIONS';
            logger.info(`🔄 Changed optimization_goal to LINK_CLICKS, billing_event to IMPRESSIONS`);
          }
        }
      }

      // Use direct HTTP API call approach since SDK method names are unclear
      const accessToken = process.env.FB_ACCESS_TOKEN;
      const accountId = params.accountId.replace('act_', '');
      
      logger.info(`🔄 Sending ad set creation request to Facebook API:`, JSON.stringify(adSetData, null, 2));

      const response = await axios.post(
        `https://graph.facebook.com/v23.0/act_${accountId}/adsets`,
        adSetData,
        {
          params: {
            access_token: accessToken
          },
          timeout: 30000, // 30 second timeout
          validateStatus: function (status: number) {
            return status >= 200 && status < 300; // Only resolve for 2xx status codes
          }
        }
      );
      
      const adSet = response.data;
      logger.info(`📋 Facebook API Response:`, JSON.stringify(response.data, null, 2));
      
      if (!adSet.id) {
        throw new Error('Facebook API did not return an ad set ID. Check your parameters and permissions.');
      }

      logger.info(`✅ Successfully created ad set ${adSet.id} for campaign ${correctedParams.campaignId}`);
      logger.info(`📋 Ad Set details: Name="${correctedParams.name}", Budget=${correctedParams.dailyBudget || correctedParams.lifetimeBudget}`);

      return {
        id: adSet.id,
        accountId: correctedParams.accountId,
        campaignId: correctedParams.campaignId,
        name: correctedParams.name,
        status: this.mapAdSetStatus(correctedParams.status || 'PAUSED'),
        optimizationGoal: correctedParams.optimizationGoal,
        billingEvent: correctedParams.billingEvent,
        budget: {
          daily: correctedParams.dailyBudget || undefined,
          lifetime: correctedParams.lifetimeBudget || undefined,
          remaining: correctedParams.lifetimeBudget || correctedParams.dailyBudget || 0,
        },
        targeting: {
          countries: correctedParams.targeting?.geoLocations?.countries || [],
          ageMin: correctedParams.targeting?.ageMin,
          ageMax: correctedParams.targeting?.ageMax,
          gender: this.parseGenderFromInput(correctedParams.targeting?.genders),
          interests: correctedParams.targeting?.interests || [],
          behaviors: correctedParams.targeting?.behaviors || [],
          customAudiences: correctedParams.targeting?.customAudiences || [],
        },
        performance: {
          spend: 0,
          impressions: 0,
          clicks: 0,
          ctr: 0,
          cpm: 0,
          cpc: 0,
          conversions: 0,
          costPerConversion: 0,
        },
        startDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      logger.error('❌ Error creating Facebook ad set:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        adSetName: params.name,
        campaignId: params.campaignId,
        accountId: params.accountId
      });
      
      // Enhanced error handling for common Facebook API issues
      if (error instanceof Error) {
        if (error.message.includes('targeting')) {
          throw new Error(`Targeting error: ${error.message}. Please check your audience targeting parameters.`);
        }
        if (error.message.includes('budget')) {
          throw new Error(`Budget error: ${error.message}. Please check that daily_budget or lifetime_budget is properly specified.`);
        }
        if (error.message.includes('campaign')) {
          throw new Error(`Campaign error: ${error.message}. Please check that the campaign ID exists and is accessible.`);
        }
        if (error.message.includes('permission')) {
          throw new Error(`Permission error: ${error.message}. Please check your Facebook app permissions and access token.`);
        }
      }
      
      // Handle axios errors specifically
      if ((error as any).response) {
        const axiosError = error as any;
        const fbError = axiosError.response.data?.error;
        const errorCode = fbError?.code;
        const errorSubcode = fbError?.error_subcode;
        const errorMsg = fbError?.message || '';
        
        logger.error(`🚫 Facebook API HTTP Error:`, {
          status: axiosError.response.status,
          statusText: axiosError.response.statusText,
          data: axiosError.response.data
        });
        
        // Handle "global id not allowed" error - page not associated with ad account
        if (errorMsg.includes('global id') && errorMsg.includes('not allowed')) {
          const pageId = process.env.FB_PAGE_ID;
          throw new Error(`❌ PAGE NOT ASSOCIATED WITH AD ACCOUNT

The Facebook Page (${pageId}) exists but is NOT associated with your ad account (act_${params.accountId.replace('act_', '')}).

🔧 TO FIX THIS:

1. Go to Facebook Business Settings:
   https://business.facebook.com/settings

2. Navigate to: Accounts → Pages
   
3. Click "Add" → "Add a Page" and add page ID: ${pageId}

4. Then go to: Accounts → Ad Accounts

5. Select your ad account and click "Add Assets" → "Pages"

6. Assign the page to your ad account

After completing these steps, try creating the campaign again.`);
        }
        
        // Handle billing option not available error - new ad account
        if (errorSubcode === 2446404 || errorMsg.includes('Billing option not available')) {
          throw new Error(`❌ BILLING OPTION NOT AVAILABLE

Your ad account is new to Facebook and has billing restrictions.

Facebook says: "${fbError?.error_user_msg || 'Ad accounts owned by businesses new to Facebook Products can choose this option to pay for ads after several weeks of following our policies.'}"

🔧 TO FIX THIS:

1. Add a payment method to your ad account:
   https://business.facebook.com/settings/payment-methods

2. Wait a few days/weeks for Facebook to lift restrictions

3. Or try creating ads directly in Facebook Ads Manager first
   to establish account history

The campaign was created successfully. Only ad set creation is blocked due to billing restrictions.`);
        }
        
        throw new Error(`Facebook API Error (${axiosError.response.status}): ${JSON.stringify(axiosError.response.data)}`);
      }
      
      throw error;
    }
  }

  async updateAdSet(params: UpdateAdSetParams): Promise<FacebookAdSet> {
    if (!this.isInitialized) {
      throw new Error('Facebook API not initialized. Please check your FB_ACCESS_TOKEN environment variable.');
    }

    try {
      // Simplified implementation for SDK compatibility
      logger.info('Ad Set updating temporarily disabled due to SDK version compatibility');
      throw new Error('Ad Set updating is currently disabled due to SDK compatibility issues');
    } catch (error) {
      logger.error('Error updating Facebook ad set:', error);
      throw error;
    }
  }

  private mapAdSetStatus(status: string): 'active' | 'paused' | 'deleted' {
    switch (status) {
      case 'ACTIVE': return 'active';
      case 'PAUSED': return 'paused';
      case 'DELETED': return 'deleted';
      default: return 'paused';
    }
  }

  private async getAdSetInsights(adSetId: string): Promise<any> {
    try {
      const adSet = new AdSet(adSetId);
      const insights = await adSet.getInsights([
        'spend',
        'impressions',
        'clicks',
        'ctr',
        'cpm',
        'cpc',
        'conversions',
        'cost_per_conversion'
      ], {
        date_preset: 'last_7d'
      });

      if (!insights || insights.length === 0) {
        return this.getEmptyInsights();
      }

      const insight = insights[0];
      return this.mapInsights(insight);
    } catch (error) {
      logger.error('Error fetching ad set insights:', error);
      return this.getEmptyInsights();
    }
  }

  // Ad Management Methods - Simplified for SDK compatibility
  async getAds(params: GetAdsParams): Promise<FacebookAd[]> {
    if (!this.isInitialized) {
      throw new Error('Facebook API not initialized. Please check your FB_ACCESS_TOKEN environment variable.');
    }

    try {
      // Simplified implementation for SDK compatibility
      logger.info('Ads retrieval temporarily simplified due to SDK version compatibility');
      return [];
    } catch (error) {
      logger.error('Error fetching Facebook ads:', error);
      throw error;
    }
  }

  // Upload image to Facebook Ad Images library and get image_hash
  async uploadAdImage(accountId: string, imageUrl: string): Promise<string | null> {
    try {
      const accessToken = process.env.FB_ACCESS_TOKEN;
      const cleanAccountId = accountId.replace('act_', '');
      
      logger.info(`🖼️ Uploading image to Facebook: ${imageUrl}`);
      
      // Fetch the image locally first
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'ngrok-skip-browser-warning': 'true'
        }
      });
      
      const imageBuffer = Buffer.from(imageResponse.data);
      const base64Image = imageBuffer.toString('base64');
      logger.info(`✅ Image fetched! Size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
      
      // Upload using bytes parameter (base64 encoded)
      const response = await axios.post(
        `https://graph.facebook.com/v23.0/act_${cleanAccountId}/adimages`,
        {
          bytes: base64Image,
        },
        {
          params: {
            access_token: accessToken
          },
          timeout: 60000,
        }
      );
      
      // Response format: { images: { bytes: { hash: "...", url: "..." } } }
      if (response.data?.images?.bytes?.hash) {
        const imageHash = response.data.images.bytes.hash;
        logger.info(`✅ Image uploaded! Hash: ${imageHash}`);
        return imageHash;
      } else {
        logger.warn(`⚠️ Image upload response format unexpected:`, response.data);
        return null;
      }
    } catch (error: any) {
      logger.error(`❌ Failed to upload image:`, error.response?.data || error.message);
      return null;
    }
  }

  // Upload video to Facebook Ad Videos library
  async uploadAdVideo(accountId: string, videoUrl: string): Promise<string | null> {
    try {
      const accessToken = process.env.FB_ACCESS_TOKEN;
      const cleanAccountId = accountId.replace('act_', '');
      
      logger.info(`🎥 Uploading video to Facebook: ${videoUrl}`);
      
      // First, try to fetch the video from the URL ourselves
      // This works around ngrok/localhost issues where Facebook can't access the URL
      try {
        logger.info(`🔄 Fetching video file from: ${videoUrl}`);
        
        const videoResponse = await axios.get(videoUrl, {
          responseType: 'arraybuffer',
          timeout: 60000, // 1 minute to download
          headers: {
            'ngrok-skip-browser-warning': 'true' // Skip ngrok warning page
          }
        });
        
        const videoBuffer = Buffer.from(videoResponse.data);
        logger.info(`✅ Video fetched successfully! Size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);
        
        // Upload using multipart form data with the actual file
        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('access_token', accessToken);
        formData.append('name', `Video_${Date.now()}`);
        formData.append('source', videoBuffer, {
          filename: 'video.mp4',
          contentType: 'video/mp4'
        });
        
        logger.info(`📤 Uploading video to Facebook...`);
        const response = await axios.post(
          `https://graph.facebook.com/v23.0/act_${cleanAccountId}/advideos`,
          formData,
          {
            headers: formData.getHeaders(),
            timeout: 180000, // 3 minutes timeout for upload
            maxContentLength: Infinity,
            maxBodyLength: Infinity
          }
        );
        
        if (response.data && response.data.id) {
          logger.info(`✅ Video uploaded successfully! Video ID: ${response.data.id}`);
          return response.data.id;
        } else {
          logger.warn(`⚠️ Video upload response did not contain ID:`, response.data);
          return null;
        }
      } catch (fetchError: any) {
        logger.warn(`⚠️ Could not fetch video locally: ${fetchError.message}`);
        logger.info(`🔄 Trying direct URL upload to Facebook...`);
        
        // Fallback: Try letting Facebook fetch the URL directly
        const response = await axios.post(
          `https://graph.facebook.com/v23.0/act_${cleanAccountId}/advideos`,
          {
            file_url: videoUrl,
            name: `Video_${Date.now()}`,
          },
          {
            params: {
              access_token: accessToken
            },
            timeout: 120000,
          }
        );
        
        if (response.data && response.data.id) {
          logger.info(`✅ Video uploaded successfully! Video ID: ${response.data.id}`);
          return response.data.id;
        }
        return null;
      }
    } catch (error: any) {
      logger.error(`❌ Failed to upload video:`, error.response?.data || error.message);
      return null;
    }
  }

  async createAd(params: CreateAdParams): Promise<FacebookAd> {
    if (!this.isInitialized) {
      throw new Error('Facebook API not initialized. Please check your FB_ACCESS_TOKEN environment variable.');
    }

    try {
      const accessToken = process.env.FB_ACCESS_TOKEN;
      const accountId = params.accountId.replace('act_', '');
      
      const adData: any = {
        name: params.name,
        adset_id: params.adSetId,
        status: params.status || 'PAUSED',
      };

      // Add creative if specified - format for Facebook API
      if (params.creative && params.creative.linkUrl) {
        // Automatically detect and use available Facebook Page
        let pageId = process.env.FB_PAGE_ID; // Fallback to environment variable
        
        if (!pageId) {
          logger.info('🔍 FB_PAGE_ID not set, attempting to auto-detect Facebook Pages...');
          const pages = await this.getPages({ limit: 10 });
          
          if (pages.length > 0) {
            // Prefer pages with ADVERTISE permission, fallback to any available page
            const advertisingPage = pages.find(page => page.tasks.includes('ADVERTISE'));
            const selectedPage = advertisingPage || pages[0];
            pageId = selectedPage.id;
            
            logger.info(`🎯 Auto-selected Page: "${selectedPage.name}" (${pageId}) - Tasks: [${selectedPage.tasks.join(', ')}]`);
          } else {
            logger.warn('⚠️ No Facebook Pages found via auto-detection.');
            logger.warn('💡 This could be due to missing "pages_show_list" permission on the access token.');
            logger.warn('💡 Consider setting FB_PAGE_ID environment variable as a fallback.');
            logger.error('❌ Cannot create ads without a Facebook Page ID.');
            throw new Error('No Facebook Pages accessible and FB_PAGE_ID not set. Please either:\n' +
                          '1. Set FB_PAGE_ID environment variable with a valid page ID\n' + 
                          '2. Ensure your access token has "pages_show_list" permission\n' + 
                          '3. Associate at least one Facebook Page with your account');
          }
        } else {
          logger.info(`📋 Using configured Page ID from environment: ${pageId}`);
        }
        
        // Facebook requires either an existing creative_id OR inline creative specification
        // Since we may not have permissions to create ad creatives, we'll use inline creative
        // DO NOT use placeholder images - if no image provided, create ad without picture
        let imageUrl = params.creative.imageUrl; // No default - optional
        let videoUrl = params.creative.videoUrl;
        
        // Convert relative URLs to absolute URLs for Facebook API  
        const baseUrl = process.env.FRONTEND_URL || process.env.NGROK_URL || '';
        if (imageUrl && imageUrl.startsWith('/')) {
          imageUrl = `${baseUrl}${imageUrl}`;
          logger.info(`🔄 Converted relative imageUrl to absolute: ${imageUrl}`);
        }
        if (videoUrl && videoUrl.startsWith('/')) {
          videoUrl = `${baseUrl}${videoUrl}`;
          logger.info(`🔄 Converted relative videoUrl to absolute: ${videoUrl}`);
        }
        
        // Build the creative structure with media support
        // Note: URL parameters (url_tags) are set at the AD level, not in the creative
        const linkData: any = {
          link: params.creative.linkUrl,
          message: params.creative.body || 'Check this out!',
          name: params.creative.title || params.name,
          description: params.creative.body || 'Visit our link for more information',
          call_to_action: {
            type: 'LEARN_MORE'
          }
        };
        
        // Add image or video to the creative
        const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv', '.wmv'];
        const isVideoFile = videoUrl && videoExtensions.some(ext => videoUrl.toLowerCase().endsWith(ext));
        
        let uploadedVideoId: string | null = null;
        
        if (isVideoFile && videoUrl) {
          logger.info(`🎥 Video file detected: ${videoUrl}`);
          logger.info(`🎥 Attempting to upload video to Facebook Ad Videos library...`);
          
          // Try to upload the video to Facebook's ad videos
          uploadedVideoId = await this.uploadAdVideo(params.accountId, videoUrl);
          
          if (uploadedVideoId) {
            logger.info(`✅ Video uploaded! Creating video ad with video_id: ${uploadedVideoId}`);
          } else {
            logger.warn(`⚠️ Video upload failed - Facebook cannot fetch from ngrok URL`);
            logger.info(`💡 TIP: For video ads, use a publicly accessible URL (not ngrok/localhost)`);
            // Fall back to using user's image if provided
            if (imageUrl) {
              linkData.picture = imageUrl;
              logger.info(`🖼️ Using user's image as fallback: ${imageUrl}`);
            } else {
              logger.info(`📋 Creating link ad without image - Facebook will scrape destination URL`);
            }
          }
        } else if (imageUrl) {
          logger.info(`🖼️ Adding image to ad creative: ${imageUrl}`);
          linkData.picture = imageUrl;
        } else {
          logger.info(`📋 No image provided - creating link ad without picture`);
        }
        
        // Create the creative based on whether we have a video or not
        if (uploadedVideoId) {
          // Video ad creative requires a thumbnail image
          let thumbnailHash: string | null = null;
          
          // Try to upload a thumbnail image
          if (imageUrl) {
            logger.info(`🖼️ Uploading thumbnail image for video ad: ${imageUrl}`);
            thumbnailHash = await this.uploadAdImage(params.accountId, imageUrl);
          }
          
          // Build video_data with required fields
          const videoData: any = {
            video_id: uploadedVideoId,
            title: params.creative.title || params.name,
            message: params.creative.body || 'Check this out!',
            call_to_action: {
              type: 'LEARN_MORE',
              value: {
                link: params.creative.linkUrl
              }
            }
          };
          
          // Add thumbnail - either image_hash (if we uploaded) or fetch from video
          if (thumbnailHash) {
            videoData.image_hash = thumbnailHash;
            logger.info(`✅ Added thumbnail image_hash: ${thumbnailHash}`);
          } else {
            // Facebook REQUIRES a thumbnail for video ads
            // Try to get a thumbnail from the uploaded video
            try {
              const accessToken = process.env.FB_ACCESS_TOKEN;
              const thumbResponse = await axios.get(
                `https://graph.facebook.com/v23.0/${uploadedVideoId}/thumbnails`,
                { params: { access_token: accessToken } }
              );
              
              if (thumbResponse.data?.data?.[0]?.uri) {
                videoData.image_url = thumbResponse.data.data[0].uri;
                logger.info(`✅ Using video thumbnail: ${videoData.image_url}`);
              } else {
                // Fallback: Use the video URL itself as image_url - Facebook will extract a frame
                // This is a hack but sometimes works
                logger.warn(`⚠️ No thumbnails available yet, video may still be processing`);
                // Use a CDN-hosted default thumbnail that Facebook CAN download
                videoData.image_url = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=1200&h=628&fit=crop';
                logger.info(`🖼️ Using default thumbnail from Unsplash`);
              }
            } catch (thumbError) {
              logger.warn(`⚠️ Failed to fetch video thumbnails: ${thumbError}`);
              // Fallback to a publicly accessible image
              videoData.image_url = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=1200&h=628&fit=crop';
              logger.info(`🖼️ Using default thumbnail from Unsplash`);
            }
          }
          
          // Build creative object with url_tags if URL parameters are provided
          const creativeSpec: any = {
            object_story_spec: {
              page_id: pageId,
              video_data: videoData
            }
          };
          
          // Add url_tags to creative level (required for "URL parameters" field in Ads Manager)
          if (params.creative.urlParameters) {
            creativeSpec.url_tags = params.creative.urlParameters;
            logger.info(`🔗 Added URL parameters to VIDEO creative: ${params.creative.urlParameters}`);
          }
          
          adData.creative = JSON.stringify(creativeSpec);
          logger.info(`✅ Created VIDEO ad creative with video_id: ${uploadedVideoId}`);
        } else {
          // Link ad creative structure (image or no media)
          // Build creative object with url_tags if URL parameters are provided
          const creativeSpec: any = {
            object_story_spec: {
              page_id: pageId,
              link_data: linkData
            }
          };
          
          // Add url_tags to creative level (required for "URL parameters" field in Ads Manager)
          if (params.creative.urlParameters) {
            creativeSpec.url_tags = params.creative.urlParameters;
            logger.info(`🔗 Added URL parameters to LINK creative: ${params.creative.urlParameters}`);
          }
          
          adData.creative = JSON.stringify(creativeSpec);
          logger.info(`✅ Created LINK ad creative`);
        }
        
        logger.info(`✅ Using Page ID ${pageId} for ad creative`);
      } else if (params.creative) {
        // For other creative types, you might need different structures
        adData.creative = JSON.stringify(params.creative);
      } else {
        logger.warn('⚠️ No creative provided for ad creation. This may cause the ad creation to fail.');
      }

      // Add URL parameters/tracking tags at the AD level (not in creative)
      // This populates the "URL parameters" field in Facebook Ads Manager
      if (params.creative?.urlParameters) {
        adData.url_tags = params.creative.urlParameters;
        logger.info(`🔗 Added URL parameters to ad: ${params.creative.urlParameters}`);
      }

      logger.info(`🔄 Sending ad creation request to Facebook API:`);
      logger.info(`📋 Ad data being sent:`, JSON.stringify(adData, null, 2));
      
      // Convert adData to URLSearchParams for proper form-urlencoded format
      // Facebook Graph API works better with form-urlencoded data
      const formData = new URLSearchParams();
      formData.append('access_token', accessToken || '');
      for (const [key, value] of Object.entries(adData)) {
        if (value !== undefined && value !== null) {
          formData.append(key, String(value));
        }
      }
      
      logger.info(`📋 Form data keys: ${Array.from(formData.keys()).join(', ')}`);
      
      const response = await axios.post(
        `https://graph.facebook.com/v23.0/act_${accountId}/ads`,
        formData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 30000,
          validateStatus: function (status: number) {
            return status >= 200 && status < 300;
          }
        }
      );
      
      const ad = response.data;
      logger.info(`📋 Facebook API Response:`, JSON.stringify(response.data, null, 2));
      
      if (!ad.id) {
        throw new Error('Facebook API did not return an ad ID. Check your parameters and permissions.');
      }

      logger.info(`✅ Successfully created ad ${ad.id} for ad set ${params.adSetId}`);

      return {
        id: ad.id,
        accountId: params.accountId,
        campaignId: '', // Will be derived from ad set
        adSetId: params.adSetId,
        name: params.name,
        status: this.mapAdStatus(params.status || 'PAUSED'),
        creative: params.creative || {},
        performance: {
          spend: 0,
          impressions: 0,
          clicks: 0,
          ctr: 0,
          cpm: 0,
          cpc: 0,
          conversions: 0,
          costPerConversion: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      logger.error('❌ Error creating Facebook ad:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        adName: params.name,
        adSetId: params.adSetId,
        accountId: params.accountId
      });
      
      // Enhanced error handling for common Facebook API issues
      if (error instanceof Error) {
        if (error.message.includes('creative')) {
          throw new Error(`Creative error: ${error.message}. Please check your ad creative parameters and ensure FB_PAGE_ID is set.`);
        }
        if (error.message.includes('permission')) {
          throw new Error(`Permission error: ${error.message}. Please check your Facebook app permissions and access token.`);
        }
      }
      
      // Handle axios errors specifically
      if ((error as any).response) {
        const axiosError = error as any;
        const fbError = axiosError.response.data?.error;
        const errorSubcode = fbError?.error_subcode;
        
        logger.error(`🚫 Facebook API HTTP Error:`, {
          status: axiosError.response.status,
          statusText: axiosError.response.statusText,
          data: axiosError.response.data
        });
        
        // Handle specific Facebook API error subcodes
        if (errorSubcode === 1885183) {
          throw new Error(`❌ FACEBOOK APP IN DEVELOPMENT MODE

Your Facebook App "TestAPp" (1109290737986624) is in DEVELOPMENT mode and cannot create live ads.

🔧 SOLUTIONS:

1. Switch App to LIVE Mode (Recommended):
   • Go to https://developers.facebook.com/apps
   • Find your app "TestAPp" (1109290737986624)
   • Navigate to Settings → Basic
   • Toggle "App Mode" from Development to Live
   • Note: May require Facebook app review

2. Alternative: Test with campaigns/adsets only
   • Your system successfully creates campaigns and adsets
   • Skip ad creation for development/testing
   
The campaign and adset were created successfully. Only ad creation is blocked.`);
        }
        
        throw new Error(`Facebook API Error (${axiosError.response.status}): ${JSON.stringify(axiosError.response.data)}`);
      }
      
      throw error;
    }
  }

  async updateAd(params: UpdateAdParams): Promise<FacebookAd> {
    if (!this.isInitialized) {
      throw new Error('Facebook API not initialized. Please check your FB_ACCESS_TOKEN environment variable.');
    }

    try {
      // Simplified implementation for SDK compatibility
      logger.info('Ad updating temporarily disabled due to SDK version compatibility');
      throw new Error('Ad updating is currently disabled due to SDK compatibility issues');
    } catch (error) {
      logger.error('Error updating Facebook ad:', error);
      throw error;
    }
  }

  private mapAdStatus(status: string): 'active' | 'paused' | 'deleted' {
    switch (status) {
      case 'ACTIVE': return 'active';
      case 'PAUSED': return 'paused';
      case 'DELETED': return 'deleted';
      default: return 'paused';
    }
  }

  private async getAdInsights(adId: string): Promise<any> {
    try {
      const ad = new Ad(adId);
      const insights = await ad.getInsights([
        'spend',
        'impressions',
        'clicks',
        'ctr',
        'cpm',
        'cpc',
        'conversions',
        'cost_per_conversion'
      ], {
        date_preset: 'last_7d'
      });

      if (!insights || insights.length === 0) {
        return this.getEmptyInsights();
      }

      const insight = insights[0];
      return this.mapInsights(insight);
    } catch (error) {
      logger.error('Error fetching ad insights:', error);
      return this.getEmptyInsights();
    }
  }

  /**
   * Duplicate a campaign using Facebook's native /copies endpoint
   */
  async duplicateCampaign(
    campaignId: string,
    options: {
      deepCopy?: boolean;
      renameStrategy?: 'DEEP_RENAME' | 'ONLY_TOP_LEVEL_RENAME' | 'NO_RENAME';
      renamePrefix?: string;
      renameSuffix?: string;
      statusOption?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE';
    } = {}
  ): Promise<{ copiedCampaignId: string }> {
    const {
      deepCopy = true,
      renameStrategy = 'ONLY_TOP_LEVEL_RENAME',
      renamePrefix,
      renameSuffix = ' (Copy)',
      statusOption = 'PAUSED'
    } = options;

    const accessToken = this.getAccessToken();
    const params: Record<string, any> = {
      access_token: accessToken,
      deep_copy: deepCopy,
      rename_strategy: renameStrategy,
      status_option: statusOption
    };

    if (renamePrefix) params.rename_prefix = renamePrefix;
    if (renameSuffix) params.rename_suffix = renameSuffix;

    logger.info(`📋 Duplicating campaign ${campaignId} with options:`, options);

    const response = await axios.post(
      `https://graph.facebook.com/v23.0/${campaignId}/copies`,
      params
    );

    logger.info(`✅ Duplicated campaign ${campaignId} -> ${response.data.copied_campaign_id}`);

    return {
      copiedCampaignId: response.data.copied_campaign_id
    };
  }

  /**
   * Duplicate an ad set using Facebook's native /copies endpoint
   */
  async duplicateAdSet(
    adSetId: string,
    options: {
      campaignId?: string; // Target campaign (if moving to different campaign)
      deepCopy?: boolean;
      renameStrategy?: 'DEEP_RENAME' | 'ONLY_TOP_LEVEL_RENAME' | 'NO_RENAME';
      renamePrefix?: string;
      renameSuffix?: string;
      statusOption?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE';
    } = {}
  ): Promise<{ copiedAdSetId: string }> {
    const {
      campaignId,
      deepCopy = true,
      renameStrategy = 'ONLY_TOP_LEVEL_RENAME',
      renamePrefix,
      renameSuffix = ' (Copy)',
      statusOption = 'PAUSED'
    } = options;

    const accessToken = this.getAccessToken();
    const params: Record<string, any> = {
      access_token: accessToken,
      deep_copy: deepCopy,
      rename_strategy: renameStrategy,
      status_option: statusOption
    };

    if (campaignId) params.campaign_id = campaignId;
    if (renamePrefix) params.rename_prefix = renamePrefix;
    if (renameSuffix) params.rename_suffix = renameSuffix;

    logger.info(`📋 Duplicating ad set ${adSetId} with options:`, options);

    const response = await axios.post(
      `https://graph.facebook.com/v23.0/${adSetId}/copies`,
      params
    );

    logger.info(`✅ Duplicated ad set ${adSetId} -> ${response.data.copied_adset_id}`);

    return {
      copiedAdSetId: response.data.copied_adset_id
    };
  }

  /**
   * Duplicate an ad using Facebook's native /copies endpoint
   */
  async duplicateAd(
    adId: string,
    options: {
      adSetId?: string; // Target ad set (if moving to different ad set)
      renameStrategy?: 'NO_RENAME' | 'ONLY_TOP_LEVEL_RENAME';
      renamePrefix?: string;
      renameSuffix?: string;
      statusOption?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE';
    } = {}
  ): Promise<{ copiedAdId: string }> {
    const {
      adSetId,
      renameStrategy = 'ONLY_TOP_LEVEL_RENAME',
      renamePrefix,
      renameSuffix = ' (Copy)',
      statusOption = 'PAUSED'
    } = options;

    const accessToken = this.getAccessToken();
    const params: Record<string, any> = {
      access_token: accessToken,
      rename_strategy: renameStrategy,
      status_option: statusOption
    };

    if (adSetId) params.adset_id = adSetId;
    if (renamePrefix) params.rename_prefix = renamePrefix;
    if (renameSuffix) params.rename_suffix = renameSuffix;

    logger.info(`📋 Duplicating ad ${adId} with options:`, options);

    const response = await axios.post(
      `https://graph.facebook.com/v23.0/${adId}/copies`,
      params
    );

    logger.info(`✅ Duplicated ad ${adId} -> ${response.data.copied_ad_id}`);

    return {
      copiedAdId: response.data.copied_ad_id
    };
  }
}
