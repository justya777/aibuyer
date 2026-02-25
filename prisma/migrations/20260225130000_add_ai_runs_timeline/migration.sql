-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'ERROR');

-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "adAccountId" TEXT NOT NULL,
    "commandText" TEXT NOT NULL,
    "status" "AiRunStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdIdsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRunEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "stepId" TEXT,
    "label" TEXT,
    "summary" TEXT,
    "status" TEXT,
    "userTitle" TEXT,
    "userMessage" TEXT,
    "rationale" TEXT,
    "debugJson" JSONB,
    "createdIdsJson" JSONB,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRun_tenantId_adAccountId_startedAt_idx" ON "AiRun"("tenantId", "adAccountId", "startedAt");

-- CreateIndex
CREATE INDEX "AiRun_tenantId_businessId_startedAt_idx" ON "AiRun"("tenantId", "businessId", "startedAt");

-- CreateIndex
CREATE INDEX "AiRun_userId_startedAt_idx" ON "AiRun"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "AiRunEvent_runId_ts_idx" ON "AiRunEvent"("runId", "ts");

-- CreateIndex
CREATE INDEX "AiRunEvent_type_ts_idx" ON "AiRunEvent"("type", "ts");

-- AddForeignKey
ALTER TABLE "AiRunEvent" ADD CONSTRAINT "AiRunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
