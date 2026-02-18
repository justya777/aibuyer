declare module 'facebook-nodejs-business-sdk' {
  export class FacebookAdsApi {
    static init(accessToken: string, appId?: string, appSecret?: string, sandbox?: boolean, debug?: boolean, version?: string): void;
    static setAccessToken(accessToken: string): void;
    static version: string;
  }

  export class User {
    constructor(id: string);
    getAdAccounts(fields: string[], params?: any): Promise<any[]>;
  }

  export class AdAccount {
    constructor(id: string);
    getCampaigns(fields: string[], params?: any): Promise<any[]>;
    createCampaign(fields: string[], params: any): Promise<any>;
    getInsights(fields: string[], params?: any): Promise<any[]>;
  }

  export class Campaign {
    constructor(id: string);
    update(fields: string[], params: any): Promise<void>;
    read(fields: string[]): Promise<any>;
    getInsights(fields: string[], params?: any): Promise<any[]>;
  }

  export class AdSet {
    constructor(id: string);
    getInsights(fields: string[], params?: any): Promise<any[]>;
  }

  export class Ad {
    constructor(id: string);
    getInsights(fields: string[], params?: any): Promise<any[]>;
  }
}
