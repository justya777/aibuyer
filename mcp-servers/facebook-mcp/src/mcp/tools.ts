import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const tenantIdRequired = z.string();
const actorFields = {
  userId: z.string().optional(),
  isPlatformAdmin: z.boolean().optional(),
};

export const GetAccountsSchema = z.object({
  tenantId: tenantIdRequired,
  ...actorFields,
  limit: z.number().optional().default(50),
  fields: z.array(z.string()).optional(),
});

export const GetPagesSchema = z.object({
  tenantId: tenantIdRequired,
  ...actorFields,
  limit: z.number().optional().default(50),
  fields: z.array(z.string()).optional(),
});

export const GetPromotablePagesSchema = z.object({
  tenantId: tenantIdRequired,
  ...actorFields,
  accountId: z.string(),
});

export const GetCampaignsSchema = z.object({
  tenantId: tenantIdRequired,
  ...actorFields,
  accountId: z.string(),
  limit: z.number().optional().default(50),
  status: z.array(z.string()).optional(),
});

export const CreateCampaignSchema = z.object({
  tenantId: tenantIdRequired,
  ...actorFields,
  accountId: z.string(),
  name: z.string(),
  objective: z.string(),
  status: z.string().optional().default('PAUSED'),
  dailyBudget: z.number().optional(),
  lifetimeBudget: z.number().optional(),
  targeting: z
    .object({
      geoLocations: z
        .object({
          countries: z.array(z.string()).optional(),
          regions: z.array(z.string()).optional(),
          cities: z.array(z.string()).optional(),
        })
        .optional(),
      ageMin: z.number().optional(),
      ageMax: z.number().optional(),
      genders: z.array(z.number()).optional(),
      interests: z.array(z.string()).optional(),
      behaviors: z.array(z.string()).optional(),
    })
    .optional(),
});

export const UpdateCampaignSchema = z.object({
  tenantId: tenantIdRequired,
  ...actorFields,
  campaignId: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
  dailyBudget: z.number().optional(),
  lifetimeBudget: z.number().optional(),
});

export const GetInsightsSchema = z.object({
  tenantId: tenantIdRequired,
  ...actorFields,
  accountId: z.string().optional(),
  campaignId: z.string().optional(),
  adSetId: z.string().optional(),
  adId: z.string().optional(),
  level: z.enum(['account', 'campaign', 'adset', 'ad']),
  fields: z.array(z.string()).optional(),
  datePreset: z.string().optional().default('last_30d'),
});

export const GetAdSetsSchema = z.object({
  tenantId: tenantIdRequired,
  ...actorFields,
  campaignId: z.string(),
  limit: z.number().optional().default(50),
  status: z.array(z.string()).optional(),
});

export const CreateAdSetSchema = z.object({
  tenantId: tenantIdRequired,
  ...actorFields,
  accountId: z.string(),
  campaignId: z.string(),
  name: z.string(),
  optimizationGoal: z.string(),
  billingEvent: z.string(),
  status: z.string().optional().default('PAUSED'),
  dailyBudget: z.number().nullable().optional(),
  lifetimeBudget: z.number().nullable().optional(),
  bidAmount: z.number().optional(),
  targeting: z
    .object({
      geoLocations: z
        .object({
          countries: z.array(z.string()).optional(),
          regions: z.array(z.string()).optional(),
          cities: z.array(z.string()).optional(),
        })
        .optional(),
      ageMin: z.number().optional(),
      ageMax: z.number().optional(),
      genders: z.array(z.number()).optional(),
      interests: z.array(z.string()).optional(),
      behaviors: z.array(z.string()).optional(),
      customAudiences: z.array(z.string()).optional(),
      locales: z.array(z.union([z.string(), z.number()])).optional(),
    })
    .optional(),
});

export const UpdateAdSetSchema = z.object({
  tenantId: tenantIdRequired,
  ...actorFields,
  adSetId: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
  optimizationGoal: z.string().optional(),
  billingEvent: z.string().optional(),
  dailyBudget: z.number().optional(),
  lifetimeBudget: z.number().optional(),
});

export const GetAdsSchema = z.object({
  tenantId: tenantIdRequired,
  ...actorFields,
  adSetId: z.string().optional(),
  campaignId: z.string().optional(),
  limit: z.number().optional().default(50),
  status: z.array(z.string()).optional(),
});

export const CreateAdSchema = z.object({
  tenantId: tenantIdRequired,
  ...actorFields,
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
    urlParameters: z.string().optional(),
  }),
});

export const UpdateAdSchema = z.object({
  tenantId: tenantIdRequired,
  ...actorFields,
  adId: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
  creative: z
    .object({
      title: z.string().optional(),
      body: z.string().optional(),
      imageUrl: z.string().optional(),
      videoUrl: z.string().optional(),
      linkUrl: z.string().optional(),
      callToAction: z.string().optional(),
      displayLink: z.string().optional(),
      urlParameters: z.string().optional(),
    })
    .optional(),
});

export const DuplicateCampaignSchema = z.object({
  tenantId: tenantIdRequired,
  ...actorFields,
  campaignId: z.string(),
  deepCopy: z.boolean().optional().default(true),
  renameStrategy: z
    .enum(['DEEP_RENAME', 'ONLY_TOP_LEVEL_RENAME', 'NO_RENAME'])
    .optional()
    .default('ONLY_TOP_LEVEL_RENAME'),
  renameSuffix: z.string().optional().default(' (Copy)'),
  renamePrefix: z.string().optional(),
  statusOption: z
    .enum(['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE'])
    .optional()
    .default('PAUSED'),
});

export const DuplicateAdSetSchema = z.object({
  tenantId: tenantIdRequired,
  ...actorFields,
  adSetId: z.string(),
  campaignId: z.string().optional(),
  deepCopy: z.boolean().optional().default(true),
  renameStrategy: z
    .enum(['DEEP_RENAME', 'ONLY_TOP_LEVEL_RENAME', 'NO_RENAME'])
    .optional()
    .default('ONLY_TOP_LEVEL_RENAME'),
  renameSuffix: z.string().optional().default(' (Copy)'),
  renamePrefix: z.string().optional(),
  statusOption: z
    .enum(['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE'])
    .optional()
    .default('PAUSED'),
});

export const DuplicateAdSchema = z.object({
  tenantId: tenantIdRequired,
  ...actorFields,
  adId: z.string(),
  adSetId: z.string().optional(),
  renameStrategy: z
    .enum(['NO_RENAME', 'ONLY_TOP_LEVEL_RENAME'])
    .optional()
    .default('ONLY_TOP_LEVEL_RENAME'),
  renameSuffix: z.string().optional().default(' (Copy)'),
  renamePrefix: z.string().optional(),
  statusOption: z
    .enum(['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE'])
    .optional()
    .default('PAUSED'),
});

export const tools: Tool[] = [
  {
    name: 'get_accounts',
    description: 'Retrieve Facebook advertising accounts with metrics',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'Tenant ID for multi-tenant routing' },
        limit: { type: 'number', default: 50 },
        fields: { type: 'array', items: { type: 'string' } },
      },
      required: ['tenantId'],
    },
  },
  {
    name: 'get_pages',
    description: 'Retrieve Facebook Pages accessible in your account',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'Tenant ID for multi-tenant routing' },
        limit: { type: 'number', default: 50 },
        fields: { type: 'array', items: { type: 'string' } },
      },
      required: ['tenantId'],
    },
  },
  {
    name: 'get_promotable_pages',
    description: 'Get pages that can be promoted for an ad account',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'Tenant ID for authorization and isolation checks' },
        accountId: { type: 'string', description: 'Ad account ID (e.g., act_123)' },
      },
      required: ['tenantId', 'accountId'],
    },
  },
  {
    name: 'get_campaigns',
    description: 'Retrieve campaigns for a specific Facebook ad account',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'Tenant ID for authorization and isolation checks' },
        accountId: { type: 'string' },
        limit: { type: 'number', default: 50 },
        status: { type: 'array', items: { type: 'string' } },
      },
      required: ['tenantId', 'accountId'],
    },
  },
  {
    name: 'create_campaign',
    description: 'Create a new Facebook campaign',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string' },
        accountId: { type: 'string' },
        name: { type: 'string' },
        objective: { type: 'string' },
        status: { type: 'string', default: 'PAUSED' },
        dailyBudget: { type: 'number' },
        lifetimeBudget: { type: 'number' },
        targeting: { type: 'object' },
      },
      required: ['tenantId', 'accountId', 'name', 'objective'],
    },
  },
  {
    name: 'update_campaign',
    description: 'Update an existing Facebook campaign',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string' },
        campaignId: { type: 'string' },
        name: { type: 'string' },
        status: { type: 'string' },
        dailyBudget: { type: 'number' },
        lifetimeBudget: { type: 'number' },
      },
      required: ['tenantId', 'campaignId'],
    },
  },
  {
    name: 'get_insights',
    description: 'Get performance insights for accounts, campaigns, ad sets, or ads',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'Tenant ID for authorization and isolation checks' },
        accountId: { type: 'string' },
        campaignId: { type: 'string' },
        adSetId: { type: 'string' },
        adId: { type: 'string' },
        level: { type: 'string', enum: ['account', 'campaign', 'adset', 'ad'] },
        fields: { type: 'array', items: { type: 'string' } },
        datePreset: { type: 'string', default: 'last_30d' },
      },
      required: ['tenantId', 'level'],
    },
  },
  {
    name: 'get_adsets',
    description: 'Retrieve ad sets for a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string' },
        campaignId: { type: 'string' },
        limit: { type: 'number', default: 50 },
        status: { type: 'array', items: { type: 'string' } },
      },
      required: ['tenantId', 'campaignId'],
    },
  },
  {
    name: 'create_adset',
    description: 'Create a new Facebook ad set',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string' },
        accountId: { type: 'string' },
        campaignId: { type: 'string' },
        name: { type: 'string' },
        optimizationGoal: { type: 'string' },
        billingEvent: { type: 'string' },
        status: { type: 'string', default: 'PAUSED' },
        dailyBudget: { type: 'number' },
        lifetimeBudget: { type: 'number' },
        bidAmount: { type: 'number' },
        targeting: { type: 'object' },
      },
      required: ['tenantId', 'accountId', 'campaignId', 'name', 'optimizationGoal', 'billingEvent'],
    },
  },
  {
    name: 'update_adset',
    description: 'Update an existing Facebook ad set',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string' },
        adSetId: { type: 'string' },
        name: { type: 'string' },
        status: { type: 'string' },
        optimizationGoal: { type: 'string' },
        billingEvent: { type: 'string' },
        dailyBudget: { type: 'number' },
        lifetimeBudget: { type: 'number' },
      },
      required: ['tenantId', 'adSetId'],
    },
  },
  {
    name: 'get_ads',
    description: 'Retrieve ads for an ad set or campaign',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string' },
        adSetId: { type: 'string' },
        campaignId: { type: 'string' },
        limit: { type: 'number', default: 50 },
        status: { type: 'array', items: { type: 'string' } },
      },
      required: ['tenantId'],
    },
  },
  {
    name: 'create_ad',
    description: 'Create a new Facebook ad',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string' },
        accountId: { type: 'string' },
        adSetId: { type: 'string' },
        name: { type: 'string' },
        status: { type: 'string', default: 'PAUSED' },
        creative: { type: 'object' },
      },
      required: ['tenantId', 'accountId', 'adSetId', 'name', 'creative'],
    },
  },
  {
    name: 'update_ad',
    description: 'Update an existing Facebook ad',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string' },
        adId: { type: 'string' },
        name: { type: 'string' },
        status: { type: 'string' },
        creative: { type: 'object' },
      },
      required: ['tenantId', 'adId'],
    },
  },
  {
    name: 'duplicate_campaign',
    description: 'Duplicate a campaign using Facebook native endpoint',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string' },
        campaignId: { type: 'string' },
        deepCopy: { type: 'boolean', default: true },
        renameStrategy: { type: 'string', enum: ['DEEP_RENAME', 'ONLY_TOP_LEVEL_RENAME', 'NO_RENAME'] },
        renameSuffix: { type: 'string', default: ' (Copy)' },
        renamePrefix: { type: 'string' },
        statusOption: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE'], default: 'PAUSED' },
      },
      required: ['tenantId', 'campaignId'],
    },
  },
  {
    name: 'duplicate_adset',
    description: 'Duplicate an ad set using Facebook native endpoint',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string' },
        adSetId: { type: 'string' },
        campaignId: { type: 'string' },
        deepCopy: { type: 'boolean', default: true },
        renameStrategy: { type: 'string', enum: ['DEEP_RENAME', 'ONLY_TOP_LEVEL_RENAME', 'NO_RENAME'] },
        renameSuffix: { type: 'string', default: ' (Copy)' },
        renamePrefix: { type: 'string' },
        statusOption: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE'], default: 'PAUSED' },
      },
      required: ['tenantId', 'adSetId'],
    },
  },
  {
    name: 'duplicate_ad',
    description: 'Duplicate an ad using Facebook native endpoint',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string' },
        adId: { type: 'string' },
        adSetId: { type: 'string' },
        renameStrategy: { type: 'string', enum: ['NO_RENAME', 'ONLY_TOP_LEVEL_RENAME'] },
        renameSuffix: { type: 'string', default: ' (Copy)' },
        renamePrefix: { type: 'string' },
        statusOption: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE'], default: 'PAUSED' },
      },
      required: ['tenantId', 'adId'],
    },
  },
];

export const toolSchemas = {
  get_accounts: GetAccountsSchema,
  get_pages: GetPagesSchema,
  get_promotable_pages: GetPromotablePagesSchema,
  get_campaigns: GetCampaignsSchema,
  create_campaign: CreateCampaignSchema,
  update_campaign: UpdateCampaignSchema,
  get_insights: GetInsightsSchema,
  get_adsets: GetAdSetsSchema,
  create_adset: CreateAdSetSchema,
  update_adset: UpdateAdSetSchema,
  get_ads: GetAdsSchema,
  create_ad: CreateAdSchema,
  update_ad: UpdateAdSchema,
  duplicate_campaign: DuplicateCampaignSchema,
  duplicate_adset: DuplicateAdSetSchema,
  duplicate_ad: DuplicateAdSchema,
};

export type ToolName = keyof typeof toolSchemas;
