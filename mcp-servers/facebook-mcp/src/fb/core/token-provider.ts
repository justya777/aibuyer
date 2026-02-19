import type { RequestContext } from './types.js';

export interface TokenProvider {
  getToken(ctx: RequestContext): Promise<string>;
}

export class EnvTokenProvider implements TokenProvider {
  private readonly globalToken: string;

  constructor(globalToken: string) {
    this.globalToken = globalToken;
  }

  // ctx is intentionally accepted for API compatibility and logging context.
  // Token resolution is global due Meta system user limits.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getToken(ctx: RequestContext): Promise<string> {
    if (!this.globalToken) {
      throw new Error('Global Meta system user token is not configured.');
    }
    return this.globalToken;
  }
}
