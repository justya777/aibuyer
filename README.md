# Meta Multi-Tenant SaaS Manager

Production-ready multi-tenant architecture for Meta (Facebook) Marketing API management.

## Core Capabilities

- Multi-tenant users with signup/login using NextAuth (JWT sessions)
- DB-backed tenancy and asset mapping via Prisma (`User`, `Tenant`, `TenantMember`, `TenantAdAccount`, `TenantPage`, `AuditLog`)
- Tenant-scoped default Page + DSA settings per ad account (`AdAccountSettings`)
- Token provider supports `TENANT_SU_TOKEN_MAP` (per-tenant) and `GLOBAL_SYSTEM_USER_TOKEN` fallback
- Strict tenant isolation in both MCP/service checks and Graph client guardrail
- Business Manager anchored asset sync (`Tenant.businessId` -> owned pages/ad accounts)
- EU-targeting DSA autofill from Meta recommendations with manual tenant overrides
- Policy engine for risky operations + mutation rate/budget controls
- Audit logging for all mutating operations
- Admin endpoints/UI for cross-tenant visibility (tenants, members, assets, audit logs)

## Updated Structure

```text
.
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── frontend/
│   ├── app/
│   │   ├── admin/page.tsx
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── tenants/[tenantId]/ad-accounts/dsa/page.tsx
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── auth/signup/route.ts
│   │       ├── tenants/route.ts
│   │       ├── tenants/active/route.ts
│   │       ├── tenants/[tenantId]/ad-accounts/route.ts
│   │       ├── tenants/[tenantId]/ad-accounts/[actId]/dsa/route.ts
│   │       ├── tenants/[tenantId]/ad-accounts/[actId]/dsa/autofill/route.ts
│   │       ├── tenants/[tenantId]/ad-accounts/[actId]/default-page/route.ts
│   │       ├── tenants/[tenantId]/pages/route.ts
│   │       ├── tenants/[tenantId]/sync-assets/route.ts
│   │       └── admin/
│   │           ├── tenants/route.ts
│   │           └── audit-logs/route.ts
│   ├── lib/
│   │   ├── auth.ts
│   │   ├── db.ts
│   │   ├── mcp-client.ts
│   │   └── tenant-context.ts
│   └── middleware.ts
└── mcp-servers/facebook-mcp/src/
    ├── db/prisma.ts
    ├── fb/
    │   ├── graphClient.ts
    │   ├── tokenProvider.ts
    │   ├── tenantRegistry.ts
    │   ├── policyEngine.ts
    │   ├── dsa.ts
    │   └── core/
    │       ├── graph-client.ts
    │       ├── token-provider.ts
    │       ├── tenant-registry.ts
    │       └── policy-engine.ts
    └── services/audit-log-service.ts
```

## Environment Setup

1. Copy `.env.example` to `.env`.
2. Configure at minimum:
   - `DATABASE_URL`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL`
   - one of:
     - `GLOBAL_SYSTEM_USER_TOKEN`
     - `TENANT_SU_TOKEN_MAP`
   - policy and graph retry envs as needed

## Install

```bash
npm install
```

## Migrate Database

```bash
npm run prisma:generate
npm run prisma:migrate -- --name add_ad_account_settings
```

If your Postgres role cannot create a shadow DB (`P3014`), use:

```bash
npx prisma db push
```

## Seed Database

```bash
npm run prisma:seed
```

Seed creates:
- one platform admin user
- one sample tenant
- one sample `TenantAdAccount` with an `act_` ad account id
- one sample `AdAccountSettings` row for the sample ad account

Optional seed overrides:
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`
- `SEED_SAMPLE_TENANT_NAME`
- `SEED_SAMPLE_BUSINESS_ID`
- `SEED_SAMPLE_AD_ACCOUNT_ID`
- `SEED_SAMPLE_PAGE_ID`

## Run Frontend

```bash
npm run dev:frontend
```

Frontend runs at `http://localhost:3000`.

## Run MCP Server

```bash
npm run dev:mcp
```

MCP HTTP endpoint: `http://localhost:3001/mcp`.

## Run Both

```bash
npm run dev
```

## Tests

```bash
cd mcp-servers/facebook-mcp
npm test
```

Includes unit coverage for:
- tenant isolation blocking
- Graph client retry/backoff
- token redaction in logs
- policy enforcement
- tenant-only account filtering
- DSA EU-targeting detection
- DSA ensure flow (DB -> recommendation -> DSA_REQUIRED)
- preflight blocking to avoid partial campaign bundles

## Tenant Onboarding (BM-Anchored)

1. Create/select tenant in app.
2. Set `Tenant.businessId` (Business Manager / Business Portfolio ID) for the tenant.
3. In Meta Business Manager, share required partner/system-user access for:
   - owned ad accounts
   - owned pages
4. Run asset sync:
   - `POST /api/tenants/:tenantId/sync-assets`
5. Open tenant settings UI (`/tenants/:tenantId/ad-accounts/dsa`) and set default page:
   - if one confirmed page exists, defaults auto-fill for accounts missing defaults
   - if multiple pages exist, select from dropdown per ad account
6. Run campaign/adset/ad create flows.

Notes:
- `/act_<id>/promote_pages` is informational only; it does not gate ad/adset creation.
- Fallback pages from `/me/accounts` are marked unverified. Selecting one as default confirms it.
- Access tokens are never returned in API responses and are redacted from logs.

## DSA Workflow

- DSA settings are tenant-scoped and stored in `AdAccountSettings` (not in `.env`).
- EU-targeted ad set creation injects `dsa_beneficiary` and `dsa_payor` automatically after resolving settings.
- Resolution order:
  1. existing DB values for `(tenantId, adAccountId)`
  2. Meta `/<act_id>/dsa_recommendations` autofill
  3. fail with `DSA_REQUIRED` and actionable `nextSteps`
- Tenant endpoints:
  - `GET /api/tenants/:tenantId/ad-accounts`
  - `POST /api/tenants/:tenantId/ad-accounts/:actId/dsa/autofill`
  - `PUT /api/tenants/:tenantId/ad-accounts/:actId/dsa`
