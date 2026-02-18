# Facebook MCP Server

A Model Context Protocol (MCP) server for Facebook Marketing API integration, enabling AI agents to manage Facebook advertising accounts, campaigns, and retrieve performance insights.

## Features

- **Account Management**: Retrieve Facebook ad accounts with metrics
- **Campaign Operations**: Create, update, and manage advertising campaigns
- **Performance Insights**: Get detailed metrics and analytics data
- **Real-time Data**: Fetch live data from Facebook Marketing API
- **Mock Mode**: Development mode with mock data when API credentials are not available

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
# Facebook App Configuration
FB_APP_ID=your_facebook_app_id
FB_APP_SECRET=your_facebook_app_secret
FB_ACCESS_TOKEN=your_facebook_access_token

# Server Configuration
NODE_ENV=development
LOG_LEVEL=info
PORT=3001
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
├── index.ts              # Main MCP server entry point
├── services/
│   └── FacebookService.ts # Facebook API integration
├── types/
│   └── facebook.ts       # Type definitions
└── utils/
    └── logger.ts         # Logging utility
```

### Testing
```bash
npm test
```

### Linting
```bash
npm run lint
```
