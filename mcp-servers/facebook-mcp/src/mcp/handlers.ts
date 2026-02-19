import type { z } from 'zod';
import { FacebookService } from '../services/FacebookService.js';
import { logger } from '../utils/logger.js';
import {
  type ToolName,
  tools,
  toolSchemas,
  CreateAdSchema,
  CreateAdSetSchema,
  CreateCampaignSchema,
  DuplicateAdSchema,
  DuplicateAdSetSchema,
  DuplicateCampaignSchema,
  GetAccountsSchema,
  GetAdSetsSchema,
  GetAdsSchema,
  GetCampaignsSchema,
  GetInsightsSchema,
  GetPagesSchema,
  GetPromotablePagesSchema,
  UpdateAdSchema,
  UpdateAdSetSchema,
  UpdateCampaignSchema,
} from './tools.js';

function parseArgs<T extends z.ZodTypeAny>(schema: T, args: unknown): z.infer<T> {
  return schema.parse(args || {});
}

export class FacebookToolHandlers {
  private readonly facebookService: FacebookService;

  constructor(facebookService?: FacebookService) {
    this.facebookService = facebookService || new FacebookService();
  }

  getTools() {
    return tools;
  }

  async handleToolCall(toolName: string, args: unknown): Promise<unknown> {
    if (!(toolName in toolSchemas)) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    logger.info('Processing MCP tool call', { toolName });

    const name = toolName as ToolName;
    switch (name) {
      case 'get_accounts': {
        const parsed = parseArgs(GetAccountsSchema, args);
        return this.facebookService.getAccounts(parsed);
      }
      case 'get_pages': {
        const parsed = parseArgs(GetPagesSchema, args);
        return this.facebookService.getPages(parsed);
      }
      case 'get_promotable_pages': {
        const parsed = parseArgs(GetPromotablePagesSchema, args);
        return this.facebookService.getPromotablePages(
          parsed.accountId,
          parsed.tenantId,
          parsed.userId,
          parsed.isPlatformAdmin
        );
      }
      case 'get_campaigns': {
        const parsed = parseArgs(GetCampaignsSchema, args);
        return this.facebookService.getCampaigns(parsed);
      }
      case 'create_campaign': {
        const parsed = parseArgs(CreateCampaignSchema, args);
        return this.facebookService.createCampaign(parsed);
      }
      case 'update_campaign': {
        const parsed = parseArgs(UpdateCampaignSchema, args);
        return this.facebookService.updateCampaign(parsed);
      }
      case 'get_insights': {
        const parsed = parseArgs(GetInsightsSchema, args);
        return this.facebookService.getInsights(parsed);
      }
      case 'get_adsets': {
        const parsed = parseArgs(GetAdSetsSchema, args);
        return this.facebookService.getAdSets(parsed);
      }
      case 'create_adset': {
        const parsed = parseArgs(CreateAdSetSchema, args);
        return this.facebookService.createAdSet(parsed);
      }
      case 'update_adset': {
        const parsed = parseArgs(UpdateAdSetSchema, args);
        return this.facebookService.updateAdSet(parsed);
      }
      case 'get_ads': {
        const parsed = parseArgs(GetAdsSchema, args);
        return this.facebookService.getAds(parsed);
      }
      case 'create_ad': {
        const parsed = parseArgs(CreateAdSchema, args);
        return this.facebookService.createAd(parsed);
      }
      case 'update_ad': {
        const parsed = parseArgs(UpdateAdSchema, args);
        return this.facebookService.updateAd(parsed);
      }
      case 'duplicate_campaign': {
        const parsed = parseArgs(DuplicateCampaignSchema, args);
        return this.facebookService.duplicateCampaign(parsed.campaignId, parsed);
      }
      case 'duplicate_adset': {
        const parsed = parseArgs(DuplicateAdSetSchema, args);
        return this.facebookService.duplicateAdSet(parsed.adSetId, parsed);
      }
      case 'duplicate_ad': {
        const parsed = parseArgs(DuplicateAdSchema, args);
        return this.facebookService.duplicateAd(parsed.adId, parsed);
      }
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}
