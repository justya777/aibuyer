-- CreateEnum
CREATE TYPE "TenantPageSource" AS ENUM ('BUSINESS_OWNED', 'FALLBACK_UNVERIFIED', 'FALLBACK_CONFIRMED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "businessId" TEXT;

-- AlterTable
ALTER TABLE "AdAccountSettings" ADD COLUMN "defaultPageId" TEXT;

-- CreateTable
CREATE TABLE "TenantAdAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT,
    "currency" TEXT,
    "timezoneName" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantAdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantPage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "name" TEXT,
    "tasksJson" JSONB,
    "source" "TenantPageSource" NOT NULL DEFAULT 'BUSINESS_OWNED',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_businessId_key" ON "Tenant"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantAdAccount_tenantId_adAccountId_key" ON "TenantAdAccount"("tenantId", "adAccountId");

-- CreateIndex
CREATE INDEX "TenantAdAccount_adAccountId_idx" ON "TenantAdAccount"("adAccountId");

-- CreateIndex
CREATE INDEX "TenantAdAccount_tenantId_lastSyncedAt_idx" ON "TenantAdAccount"("tenantId", "lastSyncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TenantPage_tenantId_pageId_key" ON "TenantPage"("tenantId", "pageId");

-- CreateIndex
CREATE INDEX "TenantPage_pageId_idx" ON "TenantPage"("pageId");

-- CreateIndex
CREATE INDEX "TenantPage_tenantId_lastSeenAt_idx" ON "TenantPage"("tenantId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "TenantPage_tenantId_source_idx" ON "TenantPage"("tenantId", "source");

-- CreateIndex
CREATE INDEX "AdAccountSettings_tenantId_defaultPageId_idx" ON "AdAccountSettings"("tenantId", "defaultPageId");

-- AddForeignKey
ALTER TABLE "TenantAdAccount" ADD CONSTRAINT "TenantAdAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPage" ADD CONSTRAINT "TenantPage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing explicit tenant-account mappings into TenantAdAccount.
INSERT INTO "TenantAdAccount" ("id", "tenantId", "adAccountId", "lastSyncedAt", "createdAt", "updatedAt")
SELECT "id", "tenantId", "adAccountId", CURRENT_TIMESTAMP, "createdAt", CURRENT_TIMESTAMP
FROM "TenantAsset"
ON CONFLICT ("tenantId", "adAccountId") DO NOTHING;
