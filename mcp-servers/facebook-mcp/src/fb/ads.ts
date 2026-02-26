import type {
  CreateAdParams,
  DuplicateAdOptions,
  FacebookAd,
  GetAdsParams,
  UpdateAdParams,
} from '../types/facebook.js';
import { GraphClient } from './core/graph-client.js';
import { PageResolver } from './core/page-resolution.js';
import { graphQuery } from './core/query-builder.js';
import { normalizeAdAccountId } from './core/tenant-registry.js';
import type { RequestContext } from './core/types.js';
import { attachDsaPayloadForEuTargeting, DsaService } from './dsa.js';

function mapAdStatus(status: string): 'active' | 'paused' | 'deleted' {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE':
      return 'active';
    case 'DELETED':
      return 'deleted';
    default:
      return 'paused';
  }
}

function mapAd(record: Record<string, unknown>): FacebookAd {
  const creative = (record.creative || {}) as Record<string, unknown>;
  const storySpec =
    creative.object_story_spec && typeof creative.object_story_spec === 'object'
      ? (creative.object_story_spec as Record<string, unknown>)
      : {};
  const linkData =
    storySpec.link_data && typeof storySpec.link_data === 'object'
      ? (storySpec.link_data as Record<string, unknown>)
      : {};

  return {
    id: String(record.id || ''),
    accountId: normalizeAdAccountId(String(record.account_id || '')),
    campaignId: String(record.campaign_id || ''),
    adSetId: String(record.adset_id || ''),
    name: String(record.name || ''),
    status: mapAdStatus(String(record.status || 'PAUSED')),
    creative: {
      pageId: typeof storySpec.page_id === 'string' ? storySpec.page_id : undefined,
      title:
        typeof creative.title === 'string'
          ? creative.title
          : typeof linkData.name === 'string'
            ? linkData.name
            : undefined,
      body:
        typeof creative.body === 'string'
          ? creative.body
          : typeof linkData.message === 'string'
            ? linkData.message
            : undefined,
      imageUrl:
        typeof creative.image_url === 'string'
          ? creative.image_url
          : typeof linkData.picture === 'string'
            ? linkData.picture
            : undefined,
      videoUrl:
        typeof creative.video_id === 'string'
          ? creative.video_id
          : typeof creative.video_url === 'string'
            ? creative.video_url
            : undefined,
      linkUrl:
        typeof creative.link_url === 'string'
          ? creative.link_url
          : typeof linkData.link === 'string'
            ? linkData.link
            : undefined,
      displayLink: typeof linkData.caption === 'string' ? linkData.caption : undefined,
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
    createdAt: record.created_time ? new Date(String(record.created_time)) : new Date(),
    updatedAt: record.updated_time ? new Date(String(record.updated_time)) : new Date(),
  };
}

export class AdsApi {
  private readonly graphClient: GraphClient;
  private readonly pageResolver: PageResolver;
  private readonly dsaService: DsaService;

  constructor(
    graphClient: GraphClient,
    pageResolver: PageResolver = new PageResolver(),
    dsaService?: DsaService
  ) {
    this.graphClient = graphClient;
    this.pageResolver = pageResolver;
    this.dsaService = dsaService || new DsaService(graphClient);
  }

  async getAds(ctx: RequestContext, params: GetAdsParams): Promise<FacebookAd[]> {
    if (!params.adSetId && !params.campaignId) {
      return [];
    }

    const parentId = params.adSetId || params.campaignId;
    const query = graphQuery()
      .withLimit(params.limit || 50)
      .withFields(['id', 'name', 'status', 'account_id', 'campaign_id', 'adset_id', 'created_time', 'updated_time', 'creative{id,title,body,image_url,video_id,link_url,object_story_spec}'])
      .withEffectiveStatus(params.status)
      .build();

    const response = await this.graphClient.request<{ data?: Array<Record<string, unknown>> }>(ctx, {
      method: 'GET',
      path: `${parentId}/ads`,
      query,
    });

    return (response.data.data || []).map((ad) => mapAd(ad));
  }

  async getAdAccountId(ctx: RequestContext, adId: string): Promise<string> {
    const response = await this.graphClient.request<Record<string, unknown>>(ctx, {
      method: 'GET',
      path: adId,
      query: { fields: 'account_id,adset_id' },
    });
    if (response.data.account_id) {
      return normalizeAdAccountId(String(response.data.account_id));
    }

    const adSetId = String(response.data.adset_id || '');
    if (!adSetId) {
      throw new Error(`Could not resolve account_id for ad ${adId}`);
    }

    const adSetResponse = await this.graphClient.request<Record<string, unknown>>(ctx, {
      method: 'GET',
      path: adSetId,
      query: { fields: 'account_id' },
    });
    if (!adSetResponse.data.account_id) {
      throw new Error(`Could not resolve account_id for ad ${adId}`);
    }
    return normalizeAdAccountId(String(adSetResponse.data.account_id));
  }

  async createAd(ctx: RequestContext, params: CreateAdParams): Promise<FacebookAd> {
    const accountId = normalizeAdAccountId(params.accountId);
    const payload: Record<string, unknown> = {
      name: params.name,
      adset_id: params.adSetId,
      status: params.status || 'PAUSED',
    };

    if (params.creative) {
      const creativePageId = await this.resolveCreativePageId(ctx, params);
      payload.creative = this.buildCreative(params, creativePageId);
      if (params.creative.urlParameters) {
        payload.url_tags = params.creative.urlParameters;
      }
    }
    await this.attachDsaComplianceIfNeeded(ctx, accountId, params.adSetId, payload);

    const response = await this.graphClient.request<{ id?: string }>(ctx, {
      method: 'POST',
      path: `${accountId}/ads`,
      body: payload,
    });
    if (!response.data.id) {
      throw new Error('Facebook API did not return ad id');
    }
    return this.readAdById(ctx, response.data.id);
  }

  async updateAd(ctx: RequestContext, params: UpdateAdParams): Promise<FacebookAd> {
    const payload: Record<string, unknown> = {};
    if (params.name != null) payload.name = params.name;
    if (params.status != null) payload.status = params.status;
    if (params.creative) {
      if (params.creative.linkUrl) {
        const adAccountId = ctx.adAccountId;
        if (!adAccountId) {
          throw new Error('adAccountId is required in context when updating link creatives.');
        }
        const creativePageId = await this.resolveCreativePageId(
          ctx,
          {
            ...params,
            accountId: adAccountId,
            adSetId: '',
          } as CreateAdParams
        );
        payload.creative = this.buildCreative(
          {
            ...params,
            accountId: adAccountId,
            adSetId: '',
          } as CreateAdParams,
          creativePageId
        );
      } else {
        payload.creative = params.creative;
      }
    }

    await this.graphClient.request(ctx, {
      method: 'POST',
      path: params.adId,
      body: payload,
    });
    return this.readAdById(ctx, params.adId);
  }

  async duplicateAd(
    ctx: RequestContext,
    adId: string,
    options: Omit<DuplicateAdOptions, 'tenantId'>
  ): Promise<{ copiedAdId: string }> {
    const payload: Record<string, unknown> = {
      rename_strategy: options.renameStrategy || 'ONLY_TOP_LEVEL_RENAME',
      status_option: options.statusOption || 'PAUSED',
    };
    if (options.adSetId) payload.adset_id = options.adSetId;
    if (options.renamePrefix) payload.rename_prefix = options.renamePrefix;
    if (options.renameSuffix) payload.rename_suffix = options.renameSuffix;

    const response = await this.graphClient.request<{ copied_ad_id?: string }>(ctx, {
      method: 'POST',
      path: `${adId}/copies`,
      body: payload,
    });
    if (!response.data.copied_ad_id) {
      throw new Error('Facebook API did not return copied_ad_id');
    }
    return { copiedAdId: response.data.copied_ad_id };
  }

  private async resolveCreativePageId(
    ctx: RequestContext,
    params: CreateAdParams
  ): Promise<string | undefined> {
    if (!params.creative?.linkUrl) {
      return undefined;
    }
    return this.pageResolver.resolvePageId(ctx, params.accountId, params.creative.pageId);
  }

  private buildCreative(params: CreateAdParams, pageIdOverride?: string): Record<string, unknown> {
    const creative = params.creative;
    if (!creative.linkUrl) {
      return creative;
    }

    const pageId = pageIdOverride || creative.pageId;
    if (!pageId) {
      throw new Error('Select a default Page for this ad account');
    }

    return {
      object_story_spec: {
        page_id: pageId,
        link_data: {
          link: creative.linkUrl,
          message: creative.body || 'Check this out!',
          name: creative.title || params.name,
          description: creative.body || '',
          call_to_action: {
            type: creative.callToAction || 'LEARN_MORE',
          },
          picture: creative.imageUrl,
        },
      },
      url_tags: creative.urlParameters,
    };
  }

  private async readAdById(ctx: RequestContext, adId: string): Promise<FacebookAd> {
    const response = await this.graphClient.request<Record<string, unknown>>(ctx, {
      method: 'GET',
      path: adId,
      query: {
        fields:
          'id,name,status,account_id,campaign_id,adset_id,created_time,updated_time,creative{id,title,body,image_url,video_id,link_url,object_story_spec}',
      },
    });
    return mapAd(response.data);
  }

  private async attachDsaComplianceIfNeeded(
    ctx: RequestContext,
    accountId: string,
    adSetId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!adSetId) {
      return;
    }

    const adSetResponse = await this.graphClient.request<Record<string, unknown>>(ctx, {
      method: 'GET',
      path: adSetId,
      query: {
        fields: 'targeting',
      },
    });
    await attachDsaPayloadForEuTargeting(
      this.dsaService,
      ctx,
      accountId,
      adSetResponse.data.targeting,
      payload
    );
  }
}
