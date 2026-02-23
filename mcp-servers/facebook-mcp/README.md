# Facebook MCP Server (Multi-Tenant)

MCP server for Meta Marketing API with strict tenant isolation, BM-anchored asset sync, token provider abstraction, policy enforcement, and audit logging.

## Security Model

- Token provider model: `TokenProvider.getToken(ctx)` resolves by tenant map first, then global fallback
- Token env sources: `TENANT_SU_TOKEN_MAP`, `GLOBAL_SYSTEM_USER_TOKEN` (compat aliases supported)
- Tenant/account/page authorization is DB-backed (`TenantAdAccount`, `TenantPage`, `TenantMember`)
- Isolation guardrails:
  - early in service/handler flow
  - final in `GraphClient` before outgoing Meta calls
- DSA compliance is tenant-scoped per ad account and resolved from DB first, then Meta recommendations
- Default Page is tenant-scoped per ad account (`AdAccountSettings.defaultPageId`) with fallback-aware confirmation
- Sensitive values (`access_token`, `authorization`, `token`, `secret`) are redacted in logs
- Mutation operations are audit logged in `AuditLog`

## Required Environment Variables

```bash
PORT=3001
LOG_LEVEL=info
GLOBAL_SYSTEM_USER_TOKEN=EAAB...
TENANT_SU_TOKEN_MAP={"tenant-id":"EAAB..."}
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

No tenant-specific DSA values are read from environment.

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
- `get_accounts` returns only ad accounts assigned to the tenant in DB (`TenantAdAccount`)
- Cross-tenant access attempts are rejected before mutation/read execution
- Added tenant asset tools:
  - `sync_tenant_assets`
  - `list_tenant_pages`
  - `set_default_page_for_ad_account`
- Added DSA helper tools:
  - `preflight_create_campaign_bundle` to block partial flows before campaign create
  - `autofill_dsa_for_ad_account` to fetch and persist recommendation-based DSA values

## DSA Flow

- `AdSetsApi.createAdSet` checks EU targeting and calls `ensureDsaForAdAccount`.
- Page resolution for ad/adset creation:
  1. explicit page id from request (if provided)
  2. `AdAccountSettings.defaultPageId`
  3. if one confirmed tenant page exists, use it
  4. otherwise fail with `DEFAULT_PAGE_REQUIRED`
- `ensureDsaForAdAccount` behavior:
  1. use existing `AdAccountSettings` for `(tenantId, adAccountId)` when complete
  2. otherwise call `GET /act_<ID>/dsa_recommendations` through `GraphClient`
  3. upsert recommendation-backed settings
  4. throw `DsaComplianceError` (`DSA_REQUIRED`) if values are still unavailable
- `create_campaign` supports optional `adSetTargeting` for preflight validation to prevent partial campaign/adset creation.
- `/act_<id>/promote_pages` is treated as informational only, never as a hard create gate.

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
│   ├── dsa.ts
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
