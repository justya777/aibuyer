import { GraphClient } from './core/graph-client.js';
import { normalizeAdAccountId } from './core/tenant-registry.js';
import type { RequestContext } from './core/types.js';

export interface FacebookPixel {
  id: string;
  name: string;
  ownerBusinessId?: string;
  isUnavailable: boolean;
  dataUseSetting?: string;
  lastFiredTime?: string;
}

function mapPixel(record: Record<string, unknown>): FacebookPixel {
  const ownerBiz = record.owner_business as Record<string, unknown> | undefined;
  return {
    id: String(record.id || ''),
    name: String(record.name || ''),
    ownerBusinessId: ownerBiz ? String(ownerBiz.id || '') : undefined,
    isUnavailable: record.is_unavailable === true,
    dataUseSetting: typeof record.data_use_setting === 'string' ? record.data_use_setting : undefined,
    lastFiredTime: typeof record.last_fired_time === 'string' ? record.last_fired_time : undefined,
  };
}

export class PixelsApi {
  private readonly graphClient: GraphClient;

  constructor(graphClient: GraphClient) {
    this.graphClient = graphClient;
  }

  async getAdAccountPixels(ctx: RequestContext, accountId: string): Promise<FacebookPixel[]> {
    const normalizedActId = normalizeAdAccountId(accountId);
    try {
      const response = await this.graphClient.request<{ data?: Array<Record<string, unknown>> }>(
        ctx,
        {
          method: 'GET',
          path: `${normalizedActId}/adspixels`,
          query: {
            fields: 'id,name,owner_business,is_unavailable,data_use_setting,last_fired_time',
            limit: '25',
          },
        }
      );
      return (response.data.data || []).map(mapPixel);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('permission') || msg.includes('not authorized') || msg.includes('code=10')) {
        return [];
      }
      throw error;
    }
  }

  async getPixelById(ctx: RequestContext, pixelId: string): Promise<FacebookPixel | null> {
    try {
      const response = await this.graphClient.request<Record<string, unknown>>(ctx, {
        method: 'GET',
        path: pixelId,
        query: {
          fields: 'id,name,owner_business,is_unavailable,data_use_setting,last_fired_time',
        },
      });
      return mapPixel(response.data);
    } catch {
      return null;
    }
  }
}
