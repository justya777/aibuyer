# Facebook MCP Server (Multi-Tenant)

MCP server for Meta Marketing API with strict tenant isolation, DB-backed tenancy, global system-user token usage, policy enforcement, and audit logging.

## Security Model

- Single token model: `TokenProvider.getToken(ctx)` always returns global `META_SYSTEM_USER_TOKEN`
- No per-tenant env token maps
- Tenant/account authorization is DB-backed (`TenantAsset`, `TenantMember`)
- Isolation guardrails:
  - early in service/handler flow
  - final in `GraphClient` before outgoing Meta calls
- Sensitive values (`access_token`, `authorization`, `token`, `secret`) are redacted in logs
- Mutation operations are audit logged in `AuditLog`

## Required Environment Variables

```bash
PORT=3001
LOG_LEVEL=info
META_SYSTEM_USER_TOKEN=EAAB...
GRAPH_API_VERSION=v23.0
GRAPH_MAX_RETRIES=3
GRAPH_BASE_DELAY_MS=300
GRAPH_MAX_DELAY_MS=3000
GRAPH_RETRY_JITTER_MS=100
POLICY_ENFORCEMENT_MODE=allow_with_warning
POLICY_MAX_BUDGET_INCREASE_PERCENT=50
POLICY_MAX_MUTATIONS_PER_TENANT_PER_HOUR=120
POLICY_BROAD_TARGETING_AGE_SPAN_THRESHOLD=35
```

## Run

```bash
cd mcp-servers/facebook-mcp
npm run dev
```

## Build

```bash
npm run build
```

## Tests

```bash
npm test
```

## Tool Contract Notes

- Existing MCP tool names are preserved (`get_accounts`, `create_campaign`, etc.)
- `tenantId` is required for tool calls
- `get_accounts` returns only ad accounts assigned to the tenant in DB
- Cross-tenant access attempts are rejected before mutation/read execution

## Source Layout

```text
src/
├── config/env.ts
├── db/prisma.ts
├── fb/
│   ├── graphClient.ts
│   ├── tokenProvider.ts
│   ├── tenantRegistry.ts
│   ├── policyEngine.ts
│   └── core/
├── mcp/
│   ├── tools.ts
│   └── handlers.ts
├── services/
│   ├── FacebookService.ts
│   └── audit-log-service.ts
├── __tests__/
└── utils/logger.ts
```
