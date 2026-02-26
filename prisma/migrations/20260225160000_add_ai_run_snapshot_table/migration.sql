-- CreateTable
CREATE TABLE "AiRunSnapshot" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "sanitizedPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRunSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiRunSnapshot_runId_entityType_entityId_key" ON "AiRunSnapshot"("runId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AiRunSnapshot_runId_idx" ON "AiRunSnapshot"("runId");

-- CreateIndex
CREATE INDEX "AiRunSnapshot_entityType_entityId_idx" ON "AiRunSnapshot"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "AiRunSnapshot" ADD CONSTRAINT "AiRunSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
