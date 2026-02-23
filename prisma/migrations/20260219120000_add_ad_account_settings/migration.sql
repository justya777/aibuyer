-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "TenantMemberRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'ERROR', 'BLOCKED');

-- CreateEnum
CREATE TYPE "DsaSource" AS ENUM ('MANUAL', 'RECOMMENDATION');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "oauthProvider" TEXT,
    "oauthProviderAccountId" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "activeTenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "TenantMemberRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "assetId" TEXT,
    "summary" TEXT NOT NULL,
    "result" "AuditResult" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAccountSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "dsaBeneficiary" TEXT,
    "dsaPayor" TEXT,
    "dsaSource" "DsaSource" NOT NULL DEFAULT 'MANUAL',
    "dsaUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdAccountSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_activeTenantId_idx" ON "User"("activeTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_oauthProvider_oauthProviderAccountId_key" ON "User"("oauthProvider", "oauthProviderAccountId");

-- CreateIndex
CREATE INDEX "TenantMember_tenantId_idx" ON "TenantMember"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMember_userId_tenantId_key" ON "TenantMember"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "TenantAsset_adAccountId_idx" ON "TenantAsset"("adAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantAsset_tenantId_adAccountId_key" ON "TenantAsset"("tenantId", "adAccountId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_timestamp_idx" ON "AuditLog"("tenantId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_userId_timestamp_idx" ON "AuditLog"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_action_timestamp_idx" ON "AuditLog"("action", "timestamp");

-- CreateIndex
CREATE INDEX "AdAccountSettings_adAccountId_idx" ON "AdAccountSettings"("adAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccountSettings_tenantId_adAccountId_key" ON "AdAccountSettings"("tenantId", "adAccountId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activeTenantId_fkey" FOREIGN KEY ("activeTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMember" ADD CONSTRAINT "TenantMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMember" ADD CONSTRAINT "TenantMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAsset" ADD CONSTRAINT "TenantAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAccountSettings" ADD CONSTRAINT "AdAccountSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

