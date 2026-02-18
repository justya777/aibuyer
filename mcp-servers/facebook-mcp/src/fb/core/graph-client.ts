import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import type { GraphRetryConfig } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
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

export class GraphClient {
  private readonly tokenProvider: TokenProvider;
  private readonly apiVersion: string;
  private readonly retry: GraphRetryConfig;
  private readonly httpClient: HttpClient;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly baseUrl: string;

  constructor(tokenProvider: TokenProvider, options: GraphClientOptions) {
    this.tokenProvider = tokenProvider;
    this.apiVersion = options.apiVersion;
    this.retry = options.retry;
    this.httpClient = options.httpClient || axios.create();
    this.sleepFn = options.sleepFn || ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.baseUrl = options.baseUrl || 'https://graph.facebook.com';
  }

  async request<T = unknown>(ctx: RequestContext, request: GraphRequest): Promise<GraphResponse<T>> {
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

        throw new GraphApiError(`Graph request failed with status ${response.status}`, {
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
}
