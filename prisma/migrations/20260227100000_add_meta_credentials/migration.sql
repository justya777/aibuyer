-- AlterTable
ALTER TABLE "manager"."BusinessPortfolio" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "manager"."MetaCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "systemUserId" TEXT,
    "tokenEncrypted" TEXT NOT NULL,
    "tokenLast4" TEXT NOT NULL,
    "scopesJson" TEXT,
    "createdByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaCredential_tenantId_businessId_key" ON "manager"."MetaCredential"("tenantId", "businessId");

-- AddForeignKey
ALTER TABLE "manager"."MetaCredential" ADD CONSTRAINT "MetaCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "manager"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
