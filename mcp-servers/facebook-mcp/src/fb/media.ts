import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { GraphClient } from './core/graph-client.js';
import { normalizeAdAccountId } from './core/tenant-registry.js';
import type { RequestContext } from './core/types.js';
import { logger } from '../utils/logger.js';

export interface UploadAdImageParams {
  tenantId: string;
  userId?: string;
  isPlatformAdmin?: boolean;
  accountId: string;
  filePath: string;
}

export interface UploadAdImageResult {
  imageHash: string;
  imageUrl: string;
  width: number;
  height: number;
}

export interface UploadAdVideoParams {
  tenantId: string;
  userId?: string;
  isPlatformAdmin?: boolean;
  accountId: string;
  filePath: string;
  title?: string;
}

export interface UploadAdVideoResult {
  videoId: string;
}

const UPLOADS_ROOT = path.resolve(process.cwd(), '../../uploads');

function resolveUploadPath(filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  const resolved = path.resolve(UPLOADS_ROOT, filePath);
  const normalizedResolved = path.normalize(resolved);
  const normalizedRoot = path.normalize(UPLOADS_ROOT);
  if (!normalizedResolved.startsWith(normalizedRoot)) {
    throw new Error('File path escapes the uploads directory');
  }
  return resolved;
}

export class MediaApi {
  private readonly graphClient: GraphClient;

  constructor(graphClient: GraphClient) {
    this.graphClient = graphClient;
  }

  async uploadAdImage(ctx: RequestContext, params: UploadAdImageParams): Promise<UploadAdImageResult> {
    const accountId = normalizeAdAccountId(params.accountId);
    const absPath = resolveUploadPath(params.filePath);

    if (!fs.existsSync(absPath)) {
      throw new Error(`File not found: ${params.filePath}`);
    }

    const form = new FormData();
    form.append('filename', fs.createReadStream(absPath));

    logger.info('Uploading ad image to Facebook', {
      tenantId: ctx.tenantId,
      accountId,
      filePath: params.filePath,
    });

    const response = await this.graphClient.request<{
      images?: Record<string, { hash: string; url: string; width: number; height: number }>;
    }>(ctx, {
      method: 'POST',
      path: `${accountId}/adimages`,
      body: form,
      headers: form.getHeaders(),
    });

    const images = response.data.images;
    if (!images) {
      throw new Error('Facebook API did not return image data');
    }

    const firstKey = Object.keys(images)[0];
    const imageData = images[firstKey];
    if (!imageData?.hash) {
      throw new Error('Facebook API did not return image hash');
    }

    logger.info('Ad image uploaded successfully', {
      tenantId: ctx.tenantId,
      accountId,
      imageHash: imageData.hash,
    });

    return {
      imageHash: imageData.hash,
      imageUrl: imageData.url,
      width: imageData.width,
      height: imageData.height,
    };
  }

  async uploadAdVideo(ctx: RequestContext, params: UploadAdVideoParams): Promise<UploadAdVideoResult> {
    const accountId = normalizeAdAccountId(params.accountId);
    const absPath = resolveUploadPath(params.filePath);

    if (!fs.existsSync(absPath)) {
      throw new Error(`File not found: ${params.filePath}`);
    }

    const form = new FormData();
    form.append('source', fs.createReadStream(absPath));
    if (params.title) {
      form.append('title', params.title);
    }

    logger.info('Uploading ad video to Facebook', {
      tenantId: ctx.tenantId,
      accountId,
      filePath: params.filePath,
    });

    const response = await this.graphClient.request<{ id?: string }>(ctx, {
      method: 'POST',
      path: `${accountId}/advideos`,
      body: form,
      headers: form.getHeaders(),
    });

    if (!response.data.id) {
      throw new Error('Facebook API did not return video id');
    }

    logger.info('Ad video uploaded successfully', {
      tenantId: ctx.tenantId,
      accountId,
      videoId: response.data.id,
    });

    return { videoId: response.data.id };
  }
}
