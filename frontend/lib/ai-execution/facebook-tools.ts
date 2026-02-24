export const facebookTools = [
  {
    type: 'function' as const,
    function: {
      name: 'get_campaigns',
      description:
        'Get Facebook campaigns for an account with performance insights (CTR, spend, impressions, clicks, etc.). Returns campaign data including status and metrics.',
      parameters: {
        type: 'object',
        properties: {
          accountId: {
            type: 'string',
            description: 'The Facebook Ad Account ID (format: act_XXXXXXXXXX)',
          },
          status: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter campaigns by status: ACTIVE, PAUSED, DELETED',
          },
        },
        required: ['accountId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_campaign',
      description:
        'Update an existing Facebook campaign. Can change status (ACTIVE/PAUSED), name, budget, etc.',
      parameters: {
        type: 'object',
        properties: {
          campaignId: {
            type: 'string',
            description: 'The campaign ID to update',
          },
          status: {
            type: 'string',
            description: 'New status: ACTIVE or PAUSED',
          },
          name: {
            type: 'string',
            description: 'New campaign name',
          },
          dailyBudget: {
            type: 'number',
            description: 'New daily budget in cents',
          },
        },
        required: ['campaignId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_campaign',
      description: 'Create a new Facebook advertising campaign',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Facebook Ad Account ID' },
          name: { type: 'string', description: 'Campaign name' },
          objective: { type: 'string', description: 'Campaign objective (e.g., OUTCOME_LEADS)' },
          dailyBudget: { type: 'number', description: 'Daily budget in cents' },
          status: { type: 'string', description: 'Campaign status (ACTIVE, PAUSED)' },
        },
        required: ['accountId', 'name', 'objective', 'dailyBudget', 'status'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_adset',
      description: 'Create a new ad set within a campaign',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Facebook Ad Account ID' },
          campaignId: { type: 'string', description: 'Campaign ID to create ad set in' },
          name: { type: 'string', description: 'Ad set name' },
          optimizationGoal: { type: 'string', description: 'Optimization goal (e.g., LEAD_GENERATION)' },
          billingEvent: { type: 'string', description: 'Billing event (IMPRESSIONS)' },
          promotedObject: {
            type: 'object',
            description: 'Optional promoted object fields for adset requirements',
            properties: {
              pageId: { type: 'string', description: 'Facebook Page ID when required by objective' },
            },
          },
          bidAmount: { type: 'number', description: 'Bid amount in cents' },
          status: { type: 'string', description: 'Ad set status' },
          targeting: {
            type: 'object',
            description: 'Targeting parameters including location, demographics, interests, and language.',
            properties: {
              geoLocations: {
                type: 'object',
                properties: {
                  countries: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                      'Country codes for targeting (e.g., ["RO"] for Romania, ["US"] for USA)',
                  },
                },
              },
              ageMin: { type: 'number' },
              ageMax: { type: 'number' },
              genders: { type: 'array', items: { type: 'number' }, description: '1 for male, 2 for female' },
              interests: { type: 'array', items: { type: 'string' } },
              locales: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Language codes for targeting (2-letter ISO codes). IMPORTANT: Use string codes like "ro" for Romanian, NOT numeric IDs. Common codes: ro=Romanian, en=English, es=Spanish, fr=French, de=German, it=Italian, pt=Portuguese, ru=Russian, pl=Polish. Example: For Romanian language use locales: ["ro"]',
              },
            },
          },
        },
        required: ['accountId', 'campaignId', 'name', 'optimizationGoal', 'billingEvent', 'status'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_ad',
      description: 'Create a new Facebook ad with creative content',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Facebook Ad Account ID' },
          adSetId: { type: 'string', description: 'Ad Set ID to attach the ad to' },
          name: { type: 'string', description: 'Ad name' },
          status: { type: 'string', description: 'Ad status (ACTIVE, PAUSED)' },
          creative: {
            type: 'object',
            description: 'Ad creative content',
            properties: {
              pageId: {
                type: 'string',
                description: 'Optional explicit Facebook Page ID (tenant-allowed only)',
              },
              title: { type: 'string', description: 'Ad headline/title' },
              body: { type: 'string', description: 'Ad body text' },
              linkUrl: {
                type: 'string',
                description:
                  'Landing page URL (base URL without query parameters). If user provides full URL with tracking params, this will be auto-extracted.',
              },
              urlParameters: {
                type: 'string',
                description:
                  'URL tracking parameters (e.g., utm_campaign={{campaign.name}}&pixel=test). Auto-extracted from linkUrl if provided with query string.',
              },
              callToAction: { type: 'string', description: 'Call to action button (LEARN_MORE, SIGN_UP, etc.)' },
              imageUrl: { type: 'string', description: 'Image URL (optional)' },
              videoUrl: { type: 'string', description: 'Video URL (optional)' },
              displayLink: { type: 'string', description: 'Display link text (optional)' },
            },
            required: ['linkUrl'],
          },
        },
        required: ['accountId', 'adSetId', 'name', 'status', 'creative'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'duplicate_campaign',
      description:
        'Duplicate an existing Facebook campaign with all its ad sets and ads using Facebook native API. PREFERRED method for duplicating campaigns - much faster and more reliable than manually recreating.',
      parameters: {
        type: 'object',
        properties: {
          campaignId: { type: 'string', description: 'Campaign ID to duplicate' },
          deepCopy: { type: 'boolean', description: 'Copy all child objects (ad sets, ads). Default: true' },
          renameStrategy: {
            type: 'string',
            enum: ['DEEP_RENAME', 'ONLY_TOP_LEVEL_RENAME', 'NO_RENAME'],
            description: 'How to rename duplicated objects. Default: ONLY_TOP_LEVEL_RENAME',
          },
          renameSuffix: { type: 'string', description: 'Suffix to add to duplicated names. Default: " (Copy)"' },
          renamePrefix: { type: 'string', description: 'Prefix to add to duplicated names' },
          statusOption: {
            type: 'string',
            enum: ['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE'],
            description: 'Status for duplicated objects. Default: PAUSED',
          },
        },
        required: ['campaignId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'duplicate_adset',
      description:
        'Duplicate an existing Facebook ad set with all its ads using Facebook native API. Can optionally move to a different campaign.',
      parameters: {
        type: 'object',
        properties: {
          adSetId: { type: 'string', description: 'Ad set ID to duplicate' },
          campaignId: { type: 'string', description: 'Target campaign ID (optional - if moving to different campaign)' },
          deepCopy: { type: 'boolean', description: 'Copy all child objects (ads). Default: true' },
          renameStrategy: { type: 'string', enum: ['DEEP_RENAME', 'ONLY_TOP_LEVEL_RENAME', 'NO_RENAME'], description: 'How to rename duplicated objects' },
          renameSuffix: { type: 'string', description: 'Suffix to add to duplicated names' },
          renamePrefix: { type: 'string', description: 'Prefix to add to duplicated names' },
          statusOption: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE'], description: 'Status for duplicated objects' },
        },
        required: ['adSetId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'duplicate_ad',
      description:
        'Duplicate an existing Facebook ad using Facebook native API. Can optionally move to a different ad set.',
      parameters: {
        type: 'object',
        properties: {
          adId: { type: 'string', description: 'Ad ID to duplicate' },
          adSetId: { type: 'string', description: 'Target ad set ID (optional - if moving to different ad set)' },
          renameStrategy: { type: 'string', enum: ['NO_RENAME', 'ONLY_TOP_LEVEL_RENAME'], description: 'How to rename duplicated ad' },
          renameSuffix: { type: 'string', description: 'Suffix to add to duplicated name' },
          renamePrefix: { type: 'string', description: 'Prefix to add to duplicated name' },
          statusOption: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE'], description: 'Status for duplicated ad' },
        },
        required: ['adId'],
      },
    },
  },
];
