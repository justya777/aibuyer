# Facebook MCP Server

A Model Context Protocol (MCP) server for Facebook Marketing API integration with multi-tenant System User token routing, policy controls, tenant isolation, and centralized Graph API request handling.

## Features

- **Multi-tenant token routing**: `TokenProvider.getToken(ctx)` resolves tenant-scoped System User tokens
- **Tenant isolation**: tenant-to-ad-account access checks for reads and mutations
- **Central Graph client**: retries/backoff and rate-limit header parsing (`X-App-Usage`, `X-Ad-Account-Usage`, `X-Business-Use-Case-Usage`)
- **Policy engine**: explicit budget requirement, mutation-rate caps, risky-operation warnings
- **Insights cache**: in-memory cache for repeated insights queries

## Installation

```bash
cd mcp-servers/facebook-mcp
npm install
```

## Configuration

1. Create a Facebook App and get your credentials:
   - Go to [Facebook Developers](https://developers.facebook.com/)
   - Create a new app
   - Add Marketing API permissions
   - Get your App ID, App Secret, and Access Token

2. Create a `.env` file:
```bash
# Server Configuration
NODE_ENV=development
LOG_LEVEL=info
PORT=3001

# Graph API
GRAPH_API_VERSION=v23.0
GRAPH_MAX_RETRIES=3
GRAPH_BASE_DELAY_MS=300
GRAPH_MAX_DELAY_MS=3000
GRAPH_RETRY_JITTER_MS=100
INSIGHTS_CACHE_TTL_MS=60000

# Multi-tenant token map (dev mode)
# tenantId -> token
TENANT_SU_TOKEN_MAP={"tenant-a":"EAAB...","tenant-b":"EAAB..."}

# Multi-tenant access map
# tenantId -> { allowedAdAccountIds, systemUserTokenRef }
TENANT_ACCESS_MAP={
  "tenant-a":{"allowedAdAccountIds":["act_123"],"systemUserTokenRef":"tenant-a"},
  "tenant-b":{"allowedAdAccountIds":["act_456"],"systemUserTokenRef":"tenant-b"}
}

# Policy defaults (allow_with_warning | block)
POLICY_ENFORCEMENT_MODE=allow_with_warning
POLICY_MAX_BUDGET_INCREASE_PERCENT=50
POLICY_MAX_MUTATIONS_PER_TENANT_PER_HOUR=120
POLICY_BROAD_TARGETING_AGE_SPAN_THRESHOLD=35

# Optional ad/DSA fields
FB_PAGE_ID=your_page_id
FB_DSA_BENEFICIARY=your_company_name
FB_DSA_PAYOR=your_company_name
```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

## Available Tools

### get_accounts
Retrieve Facebook advertising accounts with performance metrics.

**Parameters:**
- `limit` (optional): Maximum number of accounts to retrieve (default: 50)
- `fields` (optional): Specific fields to retrieve

**Example:**
```json
{
  "limit": 10,
  "fields": ["name", "currency", "timezone_name"]
}
```

### get_campaigns
Retrieve campaigns for a specific Facebook ad account.

**Parameters:**
- `accountId` (required): Facebook ad account ID
- `limit` (optional): Maximum number of campaigns to retrieve (default: 50)
- `status` (optional): Filter campaigns by status array

**Example:**
```json
{
  "accountId": "act_123456789",
  "limit": 20,
  "status": ["ACTIVE", "PAUSED"]
}
```

### create_campaign
Create a new Facebook advertising campaign.

**Parameters:**
- `accountId` (required): Facebook ad account ID
- `name` (required): Campaign name
- `objective` (required): Campaign objective (TRAFFIC, CONVERSIONS, REACH, etc.)
- `status` (optional): Campaign status (default: PAUSED)
- `dailyBudget` (optional): Daily budget in cents
- `lifetimeBudget` (optional): Lifetime budget in cents
- `targeting` (optional): Targeting parameters

**Example:**
```json
{
  "accountId": "act_123456789",
  "name": "Holiday Sales Campaign 2024",
  "objective": "TRAFFIC",
  "dailyBudget": 5000,
  "targeting": {
    "geoLocations": {
      "countries": ["US", "CA"]
    },
    "ageMin": 25,
    "ageMax": 45
  }
}
```

### update_campaign
Update an existing Facebook advertising campaign.

**Parameters:**
- `campaignId` (required): Campaign ID to update
- `name` (optional): New campaign name
- `status` (optional): New campaign status
- `dailyBudget` (optional): New daily budget in cents
- `lifetimeBudget` (optional): New lifetime budget in cents

**Example:**
```json
{
  "campaignId": "123456789",
  "status": "ACTIVE",
  "dailyBudget": 7500
}
```

### get_insights
Get performance insights and metrics for accounts, campaigns, ad sets, or ads.

**Parameters:**
- `level` (required): Level of insights ("account", "campaign", "adset", "ad")
- `accountId` (optional): Account ID for account-level insights
- `campaignId` (optional): Campaign ID for campaign-level insights
- `adSetId` (optional): Ad Set ID for ad set-level insights
- `adId` (optional): Ad ID for ad-level insights
- `fields` (optional): Specific insight fields to retrieve
- `datePreset` (optional): Date preset (default: "last_30d")

**Example:**
```json
{
  "level": "campaign",
  "campaignId": "123456789",
  "fields": ["spend", "impressions", "clicks", "ctr", "cpm"],
  "datePreset": "last_7d"
}
```

## Error Handling

The server includes comprehensive error handling and logging. All errors are logged with appropriate context. Proper Facebook API credentials are required for the server to function.

## Logging

Logs are written to:
- `logs/combined.log` - All log messages
- `logs/error.log` - Error messages only
- Console (in development mode)

## Integration with Frontend

The MCP server communicates with the frontend application through the Model Context Protocol, enabling AI agents to:

1. Retrieve account and campaign data
2. Execute campaign management commands
3. Provide real-time performance insights
4. Log all actions with reasoning

## Development

### Project Structure
```
src/
├── config/
│   └── env.ts                     # Single-load env parsing
├── fb/
│   ├── core/
│   │   ├── graph-client.ts        # Central Graph API request pipeline
│   │   ├── policy-engine.ts       # Mutation policy checks
│   │   ├── tenant-registry.ts     # Tenant/account isolation mapping
│   │   ├── token-provider.ts      # Tenant token abstraction
│   │   └── types.ts
│   ├── accounts.ts
│   ├── campaigns.ts
│   ├── adsets.ts
│   ├── ads.ts
│   ├── insights.ts
│   ├── targeting.ts
│   └── FacebookServiceFacade.ts   # Backward-compatible facade
├── mcp/
│   ├── tools.ts                   # Tool schemas/definitions
│   └── handlers.ts                # Tool handlers/dispatch
├── services/
│   └── FacebookService.ts         # Compatibility shim
├── __tests__/
│   ├── token-provider.test.ts
│   ├── graph-client.test.ts
│   ├── policy-engine.test.ts
│   └── security-no-token-leak.test.ts
├── types/
│   └── facebook.ts
└── utils/
    └── logger.ts                  # Logging + redaction
```

### Testing
```bash
npm test
```

### Linting
```bash
npm run lint
```
