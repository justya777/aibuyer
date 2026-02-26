-- Add PARTIAL to AiRunStatus enum
ALTER TYPE "AiRunStatus" ADD VALUE 'PARTIAL';

-- BusinessPortfolio soft-delete columns
ALTER TABLE "BusinessPortfolio" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "BusinessPortfolio" ADD COLUMN "deletedBy" TEXT;
CREATE INDEX "BusinessPortfolio_tenantId_deletedAt_idx" ON "BusinessPortfolio"("tenantId", "deletedAt");

-- AdAccountSettings: add default pixel
ALTER TABLE "AdAccountSettings" ADD COLUMN "defaultPixelId" TEXT;

-- AiRunEvent: add structured step metadata
ALTER TABLE "AiRunEvent" ADD COLUMN "requestPayload" JSONB;
ALTER TABLE "AiRunEvent" ADD COLUMN "sanitizedPayload" JSONB;
ALTER TABLE "AiRunEvent" ADD COLUMN "attempt" INTEGER;
ALTER TABLE "AiRunEvent" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "AiRunEvent" ADD COLUMN "errorCode" TEXT;
ALTER TABLE "AiRunEvent" ADD COLUMN "errorSubcode" TEXT;
ALTER TABLE "AiRunEvent" ADD COLUMN "fbtraceId" TEXT;

-- TenantPixel table
CREATE TABLE "TenantPixel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "adAccountId" TEXT,
    "pixelId" TEXT NOT NULL,
    "name" TEXT,
    "ownerBmId" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "permissionOk" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantPixel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantPixel_tenantId_pixelId_key" ON "TenantPixel"("tenantId", "pixelId");
CREATE INDEX "TenantPixel_tenantId_adAccountId_idx" ON "TenantPixel"("tenantId", "adAccountId");
CREATE INDEX "TenantPixel_pixelId_idx" ON "TenantPixel"("pixelId");

ALTER TABLE "TenantPixel" ADD CONSTRAINT "TenantPixel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
