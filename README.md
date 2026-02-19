# Meta Multi-Tenant SaaS Manager

Production-ready multi-tenant architecture for Meta (Facebook) Marketing API management.

## Core Capabilities

- Multi-tenant users with signup/login using NextAuth (JWT sessions)
- DB-backed tenancy and asset mapping via Prisma (`User`, `Tenant`, `TenantMember`, `TenantAsset`, `AuditLog`)
- Single global Meta System User token (`META_SYSTEM_USER_TOKEN`) for all Graph API calls
- Strict tenant isolation in both MCP/service checks and Graph client guardrail
- Policy engine for risky operations + mutation rate/budget controls
- Audit logging for all mutating operations
- Admin endpoints/UI for cross-tenant visibility (tenants, members, assets, audit logs)

## Updated Structure

```text
.
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── frontend/
│   ├── app/
│   │   ├── admin/page.tsx
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── auth/signup/route.ts
│   │       ├── tenants/route.ts
│   │       ├── tenants/active/route.ts
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
   - `META_SYSTEM_USER_TOKEN`
   - policy and graph retry envs as needed

## Install

```bash
npm install
```

## Migrate Database

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init_multi_tenant
```

## Seed Database

```bash
npm run prisma:seed
```

Seed creates:
- one platform admin user
- one sample tenant
- one sample `TenantAsset` with an `act_` ad account id

Optional seed overrides:
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`
- `SEED_SAMPLE_TENANT_NAME`
- `SEED_SAMPLE_AD_ACCOUNT_ID`

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
