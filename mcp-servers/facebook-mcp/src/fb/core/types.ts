export interface RequestContext {
  tenantId: string;
  adAccountId?: string;
}

export type GraphHttpMethod = 'GET' | 'POST' | 'DELETE';

export interface GraphRequest {
  method: GraphHttpMethod;
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface GraphResponse<T = unknown> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export interface GraphRateLimitUsage {
  appUsage?: Record<string, unknown>;
  adAccountUsage?: Record<string, unknown>;
  businessUseCaseUsage?: Record<string, unknown>;
}

export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

export class PolicyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyViolationError';
  }
}

export interface PolicyEvaluation {
  warnings: string[];
}
