import { AiRunStatus, Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export interface CreateAiRunInput {
  userId: string;
  tenantId: string;
  businessId?: string;
  adAccountId: string;
  commandText: string;
}

export interface AppendAiRunEventInput {
  runId: string;
  type: string;
  stepId?: string;
  label?: string;
  summary?: string;
  status?: string;
  userTitle?: string;
  userMessage?: string;
  rationale?: string;
  debugJson?: Record<string, unknown> | null;
  createdIdsJson?: Record<string, unknown> | null;
  requestPayload?: Record<string, unknown> | null;
  sanitizedPayload?: Record<string, unknown> | null;
  attempt?: number;
  durationMs?: number;
  errorCode?: string;
  errorSubcode?: string;
  fbtraceId?: string;
  ts?: string | Date;
}

export async function createAiRun(input: CreateAiRunInput) {
  return db.aiRun.create({
    data: {
      userId: input.userId,
      tenantId: input.tenantId,
      businessId: input.businessId,
      adAccountId: input.adAccountId,
      commandText: input.commandText,
      status: AiRunStatus.PENDING,
    },
  });
}

export async function markAiRunRunning(runId: string) {
  return db.aiRun.update({
    where: { id: runId },
    data: { status: AiRunStatus.RUNNING },
  });
}

export async function markAiRunFinished(input: {
  runId: string;
  success: boolean;
  finalStatus?: 'success' | 'partial' | 'error';
  finishedAt?: string | Date;
  createdIdsJson?: Record<string, unknown> | null;
  summaryJson?: Record<string, unknown> | null;
  snapshotJson?: Record<string, unknown> | null;
  retries?: number;
}) {
  let status: AiRunStatus;
  if (input.finalStatus === 'partial') {
    status = AiRunStatus.PARTIAL;
  } else if (input.finalStatus === 'success' || input.success) {
    status = AiRunStatus.SUCCESS;
  } else {
    status = AiRunStatus.ERROR;
  }

  return db.aiRun.update({
    where: { id: input.runId },
    data: {
      status,
      finishedAt: toDate(input.finishedAt) || new Date(),
      createdIdsJson: input.createdIdsJson
        ? (input.createdIdsJson as Prisma.InputJsonValue)
        : undefined,
      summaryJson: input.summaryJson
        ? (input.summaryJson as Prisma.InputJsonValue)
        : undefined,
      snapshotJson: input.snapshotJson
        ? (input.snapshotJson as Prisma.InputJsonValue)
        : undefined,
      retries: typeof input.retries === 'number' ? input.retries : undefined,
    },
  });
}

export async function getLatestRunSnapshot(adAccountId: string, campaignId: string) {
  const run = await db.aiRun.findFirst({
    where: {
      adAccountId,
      status: AiRunStatus.SUCCESS,
      snapshotJson: { not: Prisma.DbNull },
    },
    orderBy: { finishedAt: 'desc' },
    select: { snapshotJson: true, finishedAt: true },
  });
  if (!run?.snapshotJson) return null;
  const snapshot = run.snapshotJson as Record<string, unknown>;
  if (snapshot.campaignId !== campaignId) return null;
  return { snapshot, finishedAt: run.finishedAt };
}

export async function appendAiRunEvent(input: AppendAiRunEventInput) {
  return db.aiRunEvent.create({
    data: {
      runId: input.runId,
      type: input.type,
      stepId: input.stepId,
      label: input.label,
      summary: input.summary,
      status: input.status,
      userTitle: input.userTitle,
      userMessage: input.userMessage,
      rationale: input.rationale,
      debugJson: input.debugJson
        ? (input.debugJson as Prisma.InputJsonValue)
        : undefined,
      createdIdsJson: input.createdIdsJson
        ? (input.createdIdsJson as Prisma.InputJsonValue)
        : undefined,
      requestPayload: input.requestPayload
        ? (input.requestPayload as Prisma.InputJsonValue)
        : undefined,
      sanitizedPayload: input.sanitizedPayload
        ? (input.sanitizedPayload as Prisma.InputJsonValue)
        : undefined,
      attempt: input.attempt,
      durationMs: input.durationMs,
      errorCode: input.errorCode,
      errorSubcode: input.errorSubcode,
      fbtraceId: input.fbtraceId,
      ts: toDate(input.ts) || new Date(),
    },
  });
}

export async function getAiRunById(runId: string) {
  return db.aiRun.findUnique({
    where: { id: runId },
  });
}

export async function listRecentAiRuns(input: {
  tenantId: string;
  businessId?: string;
  adAccountId?: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(50, input.limit || 20));
  return db.aiRun.findMany({
    where: {
      tenantId: input.tenantId,
      ...(input.businessId ? { businessId: input.businessId } : {}),
      ...(input.adAccountId ? { adAccountId: input.adAccountId } : {}),
    },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
}

export async function listAiRunEvents(runId: string, limit = 400) {
  const bounded = Math.max(1, Math.min(1000, limit));
  return db.aiRunEvent.findMany({
    where: { runId },
    orderBy: { ts: 'asc' },
    take: bounded,
  });
}

export async function persistEntitySnapshots(
  runId: string,
  snapshots: Array<{ entityType: string; entityId: string; sanitizedPayload: Record<string, unknown> }>
) {
  if (snapshots.length === 0) return;
  await db.aiRunSnapshot.createMany({
    data: snapshots.map((s) => ({
      runId,
      entityType: s.entityType,
      entityId: s.entityId,
      sanitizedPayload: s.sanitizedPayload as Prisma.InputJsonValue,
    })),
    skipDuplicates: true,
  });
}

export async function getEntitySnapshot(entityType: string, entityId: string) {
  return db.aiRunSnapshot.findFirst({
    where: { entityType, entityId },
    orderBy: { createdAt: 'desc' },
    select: { sanitizedPayload: true, createdAt: true, runId: true },
  });
}

function toDate(value?: string | Date): Date | null {
  if (!value) return null;
  const parsed = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
