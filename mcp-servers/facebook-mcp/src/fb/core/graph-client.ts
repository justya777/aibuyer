import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import type { GraphRetryConfig } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { normalizeAdAccountId, normalizePageId, TenantRegistry } from './tenant-registry.js';
import {
  TenantIsolationError,
} from './types.js';
import type {
  GraphRateLimitUsage,
  GraphRequest,
  GraphResponse,
  RequestContext,
} from './types.js';
import type { TokenProvider } from './token-provider.js';

export interface HttpClient {
  request<T = unknown, R = AxiosResponse<T>, D = unknown>(config: AxiosRequestConfig<D>): Promise<R>;
}

export class GraphApiError extends Error {
  readonly status?: number;
  readonly data?: unknown;
  readonly isRetryable: boolean;
  readonly attempt: number;

  constructor(
    message: string,
    options: { status?: number; data?: unknown; isRetryable: boolean; attempt: number }
  ) {
    super(message);
    this.name = 'GraphApiError';
    this.status = options.status;
    this.data = options.data;
    this.isRetryable = options.isRetryable;
    this.attempt = options.attempt;
  }
}

interface GraphClientOptions {
  apiVersion: string;
  retry: GraphRetryConfig;
  tenantRegistry?: TenantRegistry;
  httpClient?: HttpClient;
  sleepFn?: (ms: number) => Promise<void>;
  baseUrl?: string;
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

function parseJsonHeader(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export function parseRateLimitUsage(
  headers: Record<string, string | string[] | undefined>
): GraphRateLimitUsage {
  const appUsage = parseJsonHeader((headers['x-app-usage'] as string) || undefined);
  const adAccountUsage = parseJsonHeader(
    (headers['x-ad-account-usage'] as string) || undefined
  );
  const businessUseCaseUsage = parseJsonHeader(
    (headers['x-business-use-case-usage'] as string) || undefined
  );

  return {
    appUsage,
    adAccountUsage,
    businessUseCaseUsage,
  };
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function describeGraphError(status: number, data: unknown): string {
  if (!data || typeof data !== 'object') {
    return `Graph request failed with status ${status}`;
  }
  const root = data as Record<string, unknown>;
  const error = (root.error || {}) as Record<string, unknown>;
  const message = typeof error.message === 'string' ? error.message : undefined;
  const code = typeof error.code === 'number' ? error.code : undefined;
  const subcode = typeof error.error_subcode === 'number' ? error.error_subcode : undefined;
  const errorData = (error.error_data || {}) as Record<string, unknown>;
  const blameFieldSpecs = Array.isArray(errorData.blame_field_specs)
    ? errorData.blame_field_specs
    : undefined;
  const errorUserTitle =
    typeof error.error_user_title === 'string' ? error.error_user_title : undefined;
  const errorUserMsg = typeof error.error_user_msg === 'string' ? error.error_user_msg : undefined;
  const parts = [`Graph request failed with status ${status}`];
  if (code != null) parts.push(`code=${code}`);
  if (subcode != null) parts.push(`subcode=${subcode}`);
  if (message) parts.push(`message=${message}`);
  if (blameFieldSpecs && blameFieldSpecs.length > 0) {
    parts.push(`blame_field_specs=${JSON.stringify(blameFieldSpecs)}`);
  }
  if (errorUserTitle) parts.push(`user_title=${errorUserTitle}`);
  if (errorUserMsg) parts.push(`user_msg=${errorUserMsg}`);
  return parts.join(' | ');
}

export class GraphClient {
  private readonly tokenProvider: TokenProvider;
  private readonly apiVersion: string;
  private readonly retry: GraphRetryConfig;
  private readonly tenantRegistry?: TenantRegistry;
  private readonly httpClient: HttpClient;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly baseUrl: string;

  constructor(tokenProvider: TokenProvider, options: GraphClientOptions) {
    this.tokenProvider = tokenProvider;
    this.apiVersion = options.apiVersion;
    this.retry = options.retry;
    this.tenantRegistry = options.tenantRegistry;
    this.httpClient = options.httpClient || axios.create();
    this.sleepFn = options.sleepFn || ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.baseUrl = options.baseUrl || 'https://graph.facebook.com';
  }

  async request<T = unknown>(ctx: RequestContext, request: GraphRequest): Promise<GraphResponse<T>> {
    await this.enforceTenantIsolation(ctx, request);
    const url = `${this.baseUrl}/${this.apiVersion}/${normalizePath(request.path)}`;
    const maxAttempts = this.retry.maxRetries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const token = await this.tokenProvider.getToken(ctx);
      const params = {
        ...(request.query || {}),
        access_token: token,
      };

      try {
        const response = await this.httpClient.request<T>({
          method: request.method,
          url,
          params,
          data: request.body,
          headers: request.headers,
          timeout: 30_000,
          validateStatus: () => true,
        });

        const rawHeaders = (response.headers || {}) as Record<string, string | string[] | undefined>;
        const rateLimitUsage = parseRateLimitUsage(rawHeaders);
        if (rateLimitUsage.appUsage || rateLimitUsage.adAccountUsage || rateLimitUsage.businessUseCaseUsage) {
          logger.info('Graph API rate limit usage', {
            tenantId: ctx.tenantId,
            adAccountId: ctx.adAccountId,
            path: request.path,
            status: response.status,
            usage: rateLimitUsage,
          });
        }

        if (response.status >= 200 && response.status < 300) {
          return {
            data: response.data,
            status: response.status,
            headers: this.normalizeResponseHeaders(rawHeaders),
          };
        }

        const retryable = isRetryableStatus(response.status);
        if (retryable && attempt < maxAttempts) {
          await this.backoff(attempt);
          continue;
        }

        throw new GraphApiError(describeGraphError(response.status, response.data), {
          status: response.status,
          data: response.data,
          isRetryable: retryable,
          attempt,
        });
      } catch (error) {
        if (error instanceof GraphApiError) {
          throw error;
        }

        const axiosLike = error as { response?: { status?: number; data?: unknown }; message?: string };
        const status = axiosLike.response?.status;
        const retryable = status ? isRetryableStatus(status) : true;

        if (retryable && attempt < maxAttempts) {
          await this.backoff(attempt);
          continue;
        }

        throw new GraphApiError(
          `Graph request failed: ${axiosLike.message || 'Unknown error'}`,
          {
            status,
            data: axiosLike.response?.data,
            isRetryable: retryable,
            attempt,
          }
        );
      }
    }

    throw new GraphApiError('Graph request retry budget exhausted', {
      isRetryable: true,
      attempt: this.retry.maxRetries + 1,
    });
  }

  private async backoff(attempt: number): Promise<void> {
    const exponentialDelay = this.retry.baseDelayMs * 2 ** (attempt - 1);
    const jitter = this.retry.jitterMs > 0 ? Math.floor(Math.random() * this.retry.jitterMs) : 0;
    const sleepTime = Math.min(exponentialDelay + jitter, this.retry.maxDelayMs);
    await this.sleepFn(sleepTime);
  }

  private normalizeResponseHeaders(
    headers: Record<string, string | string[] | undefined>
  ): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (Array.isArray(value)) {
        normalized[key] = value.join(', ');
      } else if (typeof value === 'string') {
        normalized[key] = value;
      }
    }
    return normalized;
  }

  private async enforceTenantIsolation(ctx: RequestContext, request: GraphRequest): Promise<void> {
    if (!this.tenantRegistry) return;

    await this.tenantRegistry.assertTenantAccessible(
      ctx.tenantId,
      ctx.userId,
      Boolean(ctx.isPlatformAdmin)
    );

    const accountIds = new Set<string>();
    const pageIds = new Set<string>();
    const campaignIds = new Set<string>();
    const adSetIds = new Set<string>();
    const adIds = new Set<string>();

    if (ctx.adAccountId) accountIds.add(normalizeAdAccountId(ctx.adAccountId));
    if (ctx.pageId) pageIds.add(normalizePageId(ctx.pageId));
    if (ctx.campaignId) campaignIds.add(ctx.campaignId);
    if (ctx.adSetId) adSetIds.add(ctx.adSetId);
    if (ctx.adId) adIds.add(ctx.adId);

    const pathHead = normalizePath(request.path).split('/')[0];
    if (pathHead.startsWith('act_')) {
      accountIds.add(normalizeAdAccountId(pathHead));
    }

    this.collectIdsFromUnknown(request.query, accountIds, pageIds, campaignIds, adSetIds, adIds);
    this.collectIdsFromUnknown(request.body, accountIds, pageIds, campaignIds, adSetIds, adIds);

    for (const campaignId of campaignIds) {
      const accountId = await this.resolveAccountIdForResource(ctx, campaignId);
      accountIds.add(accountId);
    }
    for (const adSetId of adSetIds) {
      const accountId = await this.resolveAccountIdForResource(ctx, adSetId);
      accountIds.add(accountId);
    }
    for (const adId of adIds) {
      const accountId = await this.resolveAccountIdForResource(ctx, adId);
      accountIds.add(accountId);
    }

    for (const accountId of accountIds) {
      await this.tenantRegistry.assertAdAccountAllowed(
        ctx.tenantId,
        accountId,
        ctx.userId,
        Boolean(ctx.isPlatformAdmin)
      );
    }
    for (const pageId of pageIds) {
      await this.tenantRegistry.assertPageAllowed(
        ctx.tenantId,
        pageId,
        ctx.userId,
        Boolean(ctx.isPlatformAdmin)
      );
    }
  }

  private collectIdsFromUnknown(
    value: unknown,
    accountIds: Set<string>,
    pageIds: Set<string>,
    campaignIds: Set<string>,
    adSetIds: Set<string>,
    adIds: Set<string>
  ): void {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const entry of value) {
        this.collectIdsFromUnknown(entry, accountIds, pageIds, campaignIds, adSetIds, adIds);
      }
      return;
    }
    if (typeof value !== 'object') return;

    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase();
      const asString = typeof raw === 'string' ? raw : undefined;

      if (
        normalizedKey === 'account_id' ||
        normalizedKey === 'accountid' ||
        normalizedKey === 'ad_account_id' ||
        normalizedKey === 'adaccountid'
      ) {
        if (asString) accountIds.add(normalizeAdAccountId(asString));
      }

      if (normalizedKey === 'campaign_id' || normalizedKey === 'campaignid') {
        if (asString) campaignIds.add(asString);
      }

      if (
        normalizedKey === 'adset_id' ||
        normalizedKey === 'adsetid' ||
        normalizedKey === 'ad_set_id' ||
        normalizedKey === 'adset'
      ) {
        if (asString) adSetIds.add(asString);
      }

      if (normalizedKey === 'ad_id' || normalizedKey === 'adid') {
        if (asString) adIds.add(asString);
      }

      if (
        normalizedKey === 'pageid' ||
        normalizedKey === 'page_id' ||
        normalizedKey === 'defaultpageid' ||
        normalizedKey === 'default_page_id'
      ) {
        if (asString) pageIds.add(normalizePageId(asString));
      }

      if (raw && typeof raw === 'object') {
        this.collectIdsFromUnknown(raw, accountIds, pageIds, campaignIds, adSetIds, adIds);
      }
    }
  }

  private async resolveAccountIdForResource(ctx: RequestContext, resourceId: string): Promise<string> {
    const token = await this.tokenProvider.getToken(ctx);
    const url = `${this.baseUrl}/${this.apiVersion}/${normalizePath(resourceId)}`;
    const response = await this.httpClient.request<Record<string, unknown>>({
      method: 'GET',
      url,
      params: { fields: 'account_id', access_token: token },
      timeout: 30_000,
      validateStatus: () => true,
    });

    const accountId = response.data?.account_id ? String(response.data.account_id) : '';
    if (!accountId) {
      throw new TenantIsolationError(`Could not resolve account_id for resource ${resourceId}`);
    }

    return normalizeAdAccountId(accountId);
  }
}
