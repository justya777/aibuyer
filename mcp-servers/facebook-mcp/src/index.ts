#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { FacebookService } from './services/FacebookService.js';
import { logger } from './utils/logger.js';

// Load environment variables
dotenv.config();

// Tool schemas
const GetAccountsSchema = z.object({
  limit: z.number().optional().default(50),
  fields: z.array(z.string()).optional(),
});

const GetPagesSchema = z.object({
  limit: z.number().optional().default(50),
  fields: z.array(z.string()).optional(),
});

const GetCampaignsSchema = z.object({
  accountId: z.string(),
  limit: z.number().optional().default(50),
  status: z.array(z.string()).optional(),
});

const CreateCampaignSchema = z.object({
  accountId: z.string(),
  name: z.string(),
  objective: z.string(),
  status: z.string().optional().default('PAUSED'),
  dailyBudget: z.number().optional(),
  lifetimeBudget: z.number().optional(),
  targeting: z.object({
    geoLocations: z.object({
      countries: z.array(z.string()).optional(),
      regions: z.array(z.string()).optional(),
      cities: z.array(z.string()).optional(),
    }).optional(),
    ageMin: z.number().optional(),
    ageMax: z.number().optional(),
    genders: z.array(z.number()).optional(),
    interests: z.array(z.string()).optional(),
    behaviors: z.array(z.string()).optional(),
  }).optional(),
});

const UpdateCampaignSchema = z.object({
  campaignId: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
  dailyBudget: z.number().optional(),
  lifetimeBudget: z.number().optional(),
});

const GetInsightsSchema = z.object({
  accountId: z.string().optional(),
  campaignId: z.string().optional(),
  adSetId: z.string().optional(),
  adId: z.string().optional(),
  level: z.enum(['account', 'campaign', 'adset', 'ad']),
  fields: z.array(z.string()).optional(),
  datePreset: z.string().optional().default('last_30d'),
});

// Diagnostic schema for getting promotable pages
const GetPromotablePagesSchema = z.object({
  accountId: z.string().describe('The ad account ID (e.g., act_123456789)'),
});

// Ad Set schemas
const GetAdSetsSchema = z.object({
  campaignId: z.string(),
  limit: z.number().optional().default(50),
  status: z.array(z.string()).optional(),
});

const CreateAdSetSchema = z.object({
  accountId: z.string(),
  campaignId: z.string(),
  name: z.string(),
  optimizationGoal: z.string(),
  billingEvent: z.string(),
  status: z.string().optional().default('PAUSED'),
  dailyBudget: z.number().nullable().optional(),
  lifetimeBudget: z.number().nullable().optional(),
  bidAmount: z.number().optional(),
  targeting: z.object({
    geoLocations: z.object({
      countries: z.array(z.string()).optional(),
      regions: z.array(z.string()).optional(),
      cities: z.array(z.string()).optional(),
    }).optional(),
    ageMin: z.number().optional(),
    ageMax: z.number().optional(),
    genders: z.array(z.number()).optional(),
    interests: z.array(z.string()).optional(),
    behaviors: z.array(z.string()).optional(),
    customAudiences: z.array(z.string()).optional(),
    locales: z.array(z.union([z.string(), z.number()])).optional(), // Language targeting - accepts language codes (e.g., "ro", "en") or Facebook locale IDs
  }).optional(),
});

const UpdateAdSetSchema = z.object({
  adSetId: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
  optimizationGoal: z.string().optional(),
  billingEvent: z.string().optional(),
  dailyBudget: z.number().optional(),
  lifetimeBudget: z.number().optional(),
});

// Ad schemas
const GetAdsSchema = z.object({
  adSetId: z.string().optional(),
  campaignId: z.string().optional(),
  limit: z.number().optional().default(50),
  status: z.array(z.string()).optional(),
});

const CreateAdSchema = z.object({
  accountId: z.string(),
  adSetId: z.string(),
  name: z.string(),
  status: z.string().optional().default('PAUSED'),
  creative: z.object({
    title: z.string().optional(),
    body: z.string().optional(),
    imageUrl: z.string().optional(),
    videoUrl: z.string().optional(),
    linkUrl: z.string().optional(),
    callToAction: z.string().optional(),
    displayLink: z.string().optional(),
    urlParameters: z.string().optional(), // URL tracking parameters (e.g., utm_campaign={{campaign.name}})
  }),
});

const UpdateAdSchema = z.object({
  adId: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
  creative: z.object({
    title: z.string().optional(),
    body: z.string().optional(),
    imageUrl: z.string().optional(),
    videoUrl: z.string().optional(),
    linkUrl: z.string().optional(),
    callToAction: z.string().optional(),
    displayLink: z.string().optional(),
  }).optional(),
});

// Available tools
const tools: Tool[] = [
  {
    name: 'get_accounts',
    description: 'Retrieve Facebook advertising accounts with metrics',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of accounts to retrieve',
          default: 50,
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific fields to retrieve for each account',
        },
      },
    },
  },
  {
    name: 'get_pages',
    description: 'Retrieve Facebook Pages accessible in your account',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of pages to retrieve',
          default: 50,
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific fields to retrieve for each page',
        },
      },
    },
  },
  {
    name: 'get_promotable_pages',
    description: 'Get Facebook Pages that can be used for ads in a specific ad account. Use this to find valid Page IDs for lead generation campaigns.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'The ad account ID (e.g., act_123456789)',
        },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'get_campaigns',
    description: 'Retrieve campaigns for a specific Facebook ad account',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'Facebook ad account ID',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of campaigns to retrieve',
          default: 50,
        },
        status: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter campaigns by status (ACTIVE, PAUSED, DELETED)',
        },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'create_campaign',
    description: 'Create a new Facebook advertising campaign',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'Facebook ad account ID',
        },
        name: {
          type: 'string',
          description: 'Campaign name',
        },
        objective: {
          type: 'string',
          description: 'Campaign objective (TRAFFIC, CONVERSIONS, REACH, etc.)',
        },
        status: {
          type: 'string',
          description: 'Campaign status (ACTIVE, PAUSED)',
          default: 'PAUSED',
        },
        dailyBudget: {
          type: 'number',
          description: 'Daily budget in account currency (cents)',
        },
        lifetimeBudget: {
          type: 'number',
          description: 'Lifetime budget in account currency (cents)',
        },
        targeting: {
          type: 'object',
          description: 'Targeting parameters',
          properties: {
            geoLocations: {
              type: 'object',
              properties: {
                countries: { type: 'array', items: { type: 'string' } },
                regions: { type: 'array', items: { type: 'string' } },
                cities: { type: 'array', items: { type: 'string' } },
              },
            },
            ageMin: { type: 'number' },
            ageMax: { type: 'number' },
            genders: { type: 'array', items: { type: 'number' } },
            interests: { type: 'array', items: { type: 'string' } },
            behaviors: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: ['accountId', 'name', 'objective'],
    },
  },
  {
    name: 'update_campaign',
    description: 'Update an existing Facebook advertising campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'string',
          description: 'Campaign ID to update',
        },
        name: {
          type: 'string',
          description: 'New campaign name',
        },
        status: {
          type: 'string',
          description: 'New campaign status (ACTIVE, PAUSED)',
        },
        dailyBudget: {
          type: 'number',
          description: 'New daily budget in account currency (cents)',
        },
        lifetimeBudget: {
          type: 'number',
          description: 'New lifetime budget in account currency (cents)',
        },
      },
      required: ['campaignId'],
    },
  },
  {
    name: 'get_insights',
    description: 'Get performance insights and metrics for accounts, campaigns, ad sets, or ads',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Account ID for account-level insights' },
        campaignId: { type: 'string', description: 'Campaign ID for campaign-level insights' },
        adSetId: { type: 'string', description: 'Ad Set ID for ad set-level insights' },
        adId: { type: 'string', description: 'Ad ID for ad-level insights' },
        level: {
          type: 'string',
          enum: ['account', 'campaign', 'adset', 'ad'],
          description: 'Level of insights to retrieve',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific insight fields to retrieve',
        },
        datePreset: {
          type: 'string',
          description: 'Date preset (last_30d, last_7d, today, etc.)',
          default: 'last_30d',
        },
      },
      required: ['level'],
    },
  },
  // Ad Set tools
  {
    name: 'get_adsets',
    description: 'Retrieve ad sets for a specific Facebook campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'string',
          description: 'Facebook campaign ID',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of ad sets to retrieve',
          default: 50,
        },
        status: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter ad sets by status (ACTIVE, PAUSED, DELETED)',
        },
      },
      required: ['campaignId'],
    },
  },
  {
    name: 'create_adset',
    description: 'Create a new Facebook ad set within a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'Facebook ad account ID',
        },
        campaignId: {
          type: 'string',
          description: 'Facebook campaign ID',
        },
        name: {
          type: 'string',
          description: 'Ad set name',
        },
        optimizationGoal: {
          type: 'string',
          description: 'Optimization goal (LINK_CLICKS, CONVERSIONS, IMPRESSIONS, etc.)',
        },
        billingEvent: {
          type: 'string',
          description: 'Billing event (LINK_CLICKS, IMPRESSIONS, etc.)',
        },
        status: {
          type: 'string',
          description: 'Ad set status (ACTIVE, PAUSED)',
          default: 'PAUSED',
        },
        dailyBudget: {
          type: 'number',
          description: 'Daily budget in account currency (cents)',
        },
        lifetimeBudget: {
          type: 'number',
          description: 'Lifetime budget in account currency (cents)',
        },
        bidAmount: {
          type: 'number',
          description: 'Bid amount in account currency (cents) - required for certain optimization goals',
        },
        targeting: {
          type: 'object',
          description: 'Targeting parameters',
          properties: {
            geoLocations: {
              type: 'object',
              properties: {
                countries: { type: 'array', items: { type: 'string' } },
                regions: { type: 'array', items: { type: 'string' } },
                cities: { type: 'array', items: { type: 'string' } },
              },
            },
            ageMin: { type: 'number' },
            ageMax: { type: 'number' },
            genders: { type: 'array', items: { type: 'number' } },
            interests: { type: 'array', items: { type: 'string' } },
            behaviors: { type: 'array', items: { type: 'string' } },
            customAudiences: { type: 'array', items: { type: 'string' } },
            locales: { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'number' }] }, description: 'Language targeting - accepts language codes (e.g., "ro" for Romanian, "en" for English) or Facebook locale IDs' },
          },
        },
      },
      required: ['accountId', 'campaignId', 'name', 'optimizationGoal', 'billingEvent'],
    },
  },
  {
    name: 'update_adset',
    description: 'Update an existing Facebook ad set',
    inputSchema: {
      type: 'object',
      properties: {
        adSetId: {
          type: 'string',
          description: 'Ad set ID to update',
        },
        name: {
          type: 'string',
          description: 'New ad set name',
        },
        status: {
          type: 'string',
          description: 'New ad set status (ACTIVE, PAUSED)',
        },
        optimizationGoal: {
          type: 'string',
          description: 'New optimization goal',
        },
        billingEvent: {
          type: 'string',
          description: 'New billing event',
        },
        dailyBudget: {
          type: 'number',
          description: 'New daily budget in account currency (cents)',
        },
        lifetimeBudget: {
          type: 'number',
          description: 'New lifetime budget in account currency (cents)',
        },
      },
      required: ['adSetId'],
    },
  },
  // Ad tools
  {
    name: 'get_ads',
    description: 'Retrieve ads for a specific Facebook ad set or campaign',
    inputSchema: {
      type: 'object',
      properties: {
        adSetId: {
          type: 'string',
          description: 'Facebook ad set ID (optional)',
        },
        campaignId: {
          type: 'string',
          description: 'Facebook campaign ID (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of ads to retrieve',
          default: 50,
        },
        status: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter ads by status (ACTIVE, PAUSED, DELETED)',
        },
      },
    },
  },
  {
    name: 'create_ad',
    description: 'Create a new Facebook ad with creative (including links)',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'Facebook ad account ID',
        },
        adSetId: {
          type: 'string',
          description: 'Facebook ad set ID',
        },
        name: {
          type: 'string',
          description: 'Ad name',
        },
        status: {
          type: 'string',
          description: 'Ad status (ACTIVE, PAUSED)',
          default: 'PAUSED',
        },
        creative: {
          type: 'object',
          description: 'Ad creative content',
          properties: {
            title: { type: 'string', description: 'Ad title/headline' },
            body: { type: 'string', description: 'Ad body text' },
            imageUrl: { type: 'string', description: 'Image URL for the ad' },
            videoUrl: { type: 'string', description: 'Video URL for the ad' },
            linkUrl: { type: 'string', description: 'Link URL to send users to' },
            callToAction: { type: 'string', description: 'Call to action button type' },
            displayLink: { type: 'string', description: 'Display link text' },
            urlParameters: { type: 'string', description: 'URL tracking parameters (e.g., utm_campaign={{campaign.name}}&pixel=test)' },
          },
          required: ['linkUrl'],
        },
      },
      required: ['accountId', 'adSetId', 'name', 'creative'],
    },
  },
  {
    name: 'update_ad',
    description: 'Update an existing Facebook ad',
    inputSchema: {
      type: 'object',
      properties: {
        adId: {
          type: 'string',
          description: 'Ad ID to update',
        },
        name: {
          type: 'string',
          description: 'New ad name',
        },
        status: {
          type: 'string',
          description: 'New ad status (ACTIVE, PAUSED)',
        },
        creative: {
          type: 'object',
          description: 'Updated ad creative content',
          properties: {
            title: { type: 'string', description: 'Ad title/headline' },
            body: { type: 'string', description: 'Ad body text' },
            imageUrl: { type: 'string', description: 'Image URL for the ad' },
            videoUrl: { type: 'string', description: 'Video URL for the ad' },
            linkUrl: { type: 'string', description: 'Link URL to send users to' },
            callToAction: { type: 'string', description: 'Call to action button type' },
            displayLink: { type: 'string', description: 'Display link text' },
          },
        },
      },
      required: ['adId'],
    },
  },
  // Duplicate tools (using Facebook's native /copies endpoint)
  {
    name: 'duplicate_campaign',
    description: 'Duplicate a Facebook campaign using the native API (copies all ad sets and ads)',
    inputSchema: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'string',
          description: 'Campaign ID to duplicate',
        },
        deepCopy: {
          type: 'boolean',
          description: 'Copy all child objects (ad sets, ads)',
          default: true,
        },
        renameStrategy: {
          type: 'string',
          enum: ['DEEP_RENAME', 'ONLY_TOP_LEVEL_RENAME', 'NO_RENAME'],
          description: 'How to rename duplicated objects',
          default: 'ONLY_TOP_LEVEL_RENAME',
        },
        renameSuffix: {
          type: 'string',
          description: 'Suffix to add to duplicated names',
          default: ' (Copy)',
        },
        renamePrefix: {
          type: 'string',
          description: 'Prefix to add to duplicated names',
        },
        statusOption: {
          type: 'string',
          enum: ['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE'],
          description: 'Status for duplicated objects',
          default: 'PAUSED',
        },
      },
      required: ['campaignId'],
    },
  },
  {
    name: 'duplicate_adset',
    description: 'Duplicate a Facebook ad set using the native API (copies all ads)',
    inputSchema: {
      type: 'object',
      properties: {
        adSetId: {
          type: 'string',
          description: 'Ad set ID to duplicate',
        },
        campaignId: {
          type: 'string',
          description: 'Target campaign ID (if moving to different campaign)',
        },
        deepCopy: {
          type: 'boolean',
          description: 'Copy all child objects (ads)',
          default: true,
        },
        renameStrategy: {
          type: 'string',
          enum: ['DEEP_RENAME', 'ONLY_TOP_LEVEL_RENAME', 'NO_RENAME'],
          description: 'How to rename duplicated objects',
          default: 'ONLY_TOP_LEVEL_RENAME',
        },
        renameSuffix: {
          type: 'string',
          description: 'Suffix to add to duplicated names',
          default: ' (Copy)',
        },
        renamePrefix: {
          type: 'string',
          description: 'Prefix to add to duplicated names',
        },
        statusOption: {
          type: 'string',
          enum: ['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE'],
          description: 'Status for duplicated objects',
          default: 'PAUSED',
        },
      },
      required: ['adSetId'],
    },
  },
  {
    name: 'duplicate_ad',
    description: 'Duplicate a Facebook ad using the native API',
    inputSchema: {
      type: 'object',
      properties: {
        adId: {
          type: 'string',
          description: 'Ad ID to duplicate',
        },
        adSetId: {
          type: 'string',
          description: 'Target ad set ID (if moving to different ad set)',
        },
        renameStrategy: {
          type: 'string',
          enum: ['NO_RENAME', 'ONLY_TOP_LEVEL_RENAME'],
          description: 'How to rename duplicated ad',
          default: 'ONLY_TOP_LEVEL_RENAME',
        },
        renameSuffix: {
          type: 'string',
          description: 'Suffix to add to duplicated name',
          default: ' (Copy)',
        },
        renamePrefix: {
          type: 'string',
          description: 'Prefix to add to duplicated name',
        },
        statusOption: {
          type: 'string',
          enum: ['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE'],
          description: 'Status for duplicated ad',
          default: 'PAUSED',
        },
      },
      required: ['adId'],
    },
  },
];

class FacebookMCPServer {
  private server: Server;
  private facebookService: FacebookService;
  private httpApp: express.Express;

  constructor() {
    this.server = new Server(
      {
        name: 'facebook-mcp-server',
        version: '1.0.0',
      }
    );

    this.facebookService = new FacebookService();
    this.httpApp = express();
    this.setupHttpServer();
    this.setupToolHandlers();
  }

  private setupHttpServer(): void {
    this.httpApp.use(cors());
    this.httpApp.use(express.json());

    // HTTP endpoint for MCP requests
    this.httpApp.post('/mcp', async (req, res) => {
      try {
        logger.info(`HTTP MCP: Received request: ${JSON.stringify(req.body)}`);
        
        const { method, params } = req.body;
        
        if (method === 'tools/list') {
          logger.info('HTTP MCP: Handling tools/list');
          res.json({ 
            id: req.body.id,
            jsonrpc: '2.0',
            result: { tools }
          });
          return;
        }
        
        if (method === 'tools/call') {
          logger.info(`HTTP MCP: Handling tools/call for ${params.name}`);
          const result = await this.handleToolCall(params.name, params.arguments);
          res.json({
            id: req.body.id,
            jsonrpc: '2.0',
            result: {
              content: [{ type: 'text', text: JSON.stringify(result) }]
            }
          });
          return;
        }
        
        res.status(400).json({
          id: req.body.id,
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Invalid Request' }
        });
      } catch (error) {
        logger.error('HTTP MCP Error:', error);
        res.status(500).json({
          id: req.body.id || null,
          jsonrpc: '2.0',
          error: { 
            code: -32603, 
            message: 'Internal error',
            data: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    });

    const port = process.env.PORT || 3001;
    this.httpApp.listen(port, () => {
      logger.info(`HTTP MCP server listening on port ${port}`);
    });
  }

  private async handleToolCall(toolName: string, args: any): Promise<any> {
    logger.info(`Tool Handler: Processing ${toolName} with args: ${JSON.stringify(args)}`);
    
    switch (toolName) {
      case 'get_accounts':
        logger.info(`Tool Handler: Calling getAccounts`);
        const getAccountsArgs = GetAccountsSchema.parse(args);
        const accounts = await this.facebookService.getAccounts(getAccountsArgs);
        logger.info(`Tool Handler: FacebookService returned ${accounts.length} accounts`);
        return accounts;

      case 'get_pages':
        logger.info(`Tool Handler: Calling getPages`);
        const getPagesArgs = GetPagesSchema.parse(args);
        const pages = await this.facebookService.getPages(getPagesArgs);
        logger.info(`Tool Handler: FacebookService returned ${pages.length} pages`);
        return pages;

      case 'get_promotable_pages':
        logger.info(`Tool Handler: Getting promotable pages for ad account`);
        const getPromotablePagesArgs = GetPromotablePagesSchema.parse(args);
        const promotablePages = await this.facebookService.getPromotablePages(getPromotablePagesArgs.accountId);
        logger.info(`Tool Handler: Found ${promotablePages.length} promotable pages`);
        return promotablePages;

      case 'get_campaigns':
        const getCampaignsArgs = GetCampaignsSchema.parse(args);
        const campaigns = await this.facebookService.getCampaigns(getCampaignsArgs);
        return campaigns;

      case 'create_campaign':
        const createCampaignArgs = CreateCampaignSchema.parse(args);
        const newCampaign = await this.facebookService.createCampaign(createCampaignArgs);
        return newCampaign;

      case 'update_campaign':
        const updateCampaignArgs = UpdateCampaignSchema.parse(args);
        const updatedCampaign = await this.facebookService.updateCampaign(updateCampaignArgs);
        return updatedCampaign;

      case 'get_insights':
        const getInsightsArgs = GetInsightsSchema.parse(args);
        const insights = await this.facebookService.getInsights(getInsightsArgs);
        return insights;

      // Ad Set handlers
      case 'get_adsets':
        const getAdSetsArgs = GetAdSetsSchema.parse(args);
        const adSets = await this.facebookService.getAdSets(getAdSetsArgs);
        return adSets;

      case 'create_adset':
        const createAdSetArgs = CreateAdSetSchema.parse(args);
        const newAdSet = await this.facebookService.createAdSet(createAdSetArgs);
        return newAdSet;

      case 'update_adset':
        const updateAdSetArgs = UpdateAdSetSchema.parse(args);
        const updatedAdSet = await this.facebookService.updateAdSet(updateAdSetArgs);
        return updatedAdSet;

      // Ad handlers
      case 'get_ads':
        const getAdsArgs = GetAdsSchema.parse(args);
        const ads = await this.facebookService.getAds(getAdsArgs);
        return ads;

      case 'create_ad':
        const createAdArgs = CreateAdSchema.parse(args);
        const newAd = await this.facebookService.createAd(createAdArgs);
        return newAd;

      case 'update_ad':
        const updateAdArgs = UpdateAdSchema.parse(args);
        const updatedAd = await this.facebookService.updateAd(updateAdArgs);
        return updatedAd;

      // Duplicate handlers
      case 'duplicate_campaign':
        const duplicatedCampaign = await this.facebookService.duplicateCampaign(
          args.campaignId,
          {
            deepCopy: args.deepCopy,
            renameStrategy: args.renameStrategy,
            renamePrefix: args.renamePrefix,
            renameSuffix: args.renameSuffix,
            statusOption: args.statusOption,
          }
        );
        return duplicatedCampaign;

      case 'duplicate_adset':
        const duplicatedAdSet = await this.facebookService.duplicateAdSet(
          args.adSetId,
          {
            campaignId: args.campaignId,
            deepCopy: args.deepCopy,
            renameStrategy: args.renameStrategy,
            renamePrefix: args.renamePrefix,
            renameSuffix: args.renameSuffix,
            statusOption: args.statusOption,
          }
        );
        return duplicatedAdSet;

      case 'duplicate_ad':
        const duplicatedAd = await this.facebookService.duplicateAd(
          args.adId,
          {
            adSetId: args.adSetId,
            renameStrategy: args.renameStrategy,
            renamePrefix: args.renamePrefix,
            renameSuffix: args.renameSuffix,
            statusOption: args.statusOption,
          }
        );
        return duplicatedAd;

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.info('MCP Server: Received list tools request');
      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      logger.info(`MCP Server: Received CallTool request: ${JSON.stringify(request)}`);
      const { name, arguments: args } = request.params;
      
      try {
        const result = await this.handleToolCall(name, args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error(`Error executing tool ${name}:`, error);
        throw error;
      }
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Facebook MCP Server started');
  }
}

// Start the server
const server = new FacebookMCPServer();
server.start().catch((error) => {
  logger.error('Failed to start Facebook MCP Server:', error);
  process.exit(1);
});
