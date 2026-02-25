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
  finishedAt?: string | Date;
  createdIdsJson?: Record<string, unknown> | null;
  summaryJson?: Record<string, unknown> | null;
  retries?: number;
}) {
  return db.aiRun.update({
    where: { id: input.runId },
    data: {
      status: input.success ? AiRunStatus.SUCCESS : AiRunStatus.ERROR,
      finishedAt: toDate(input.finishedAt) || new Date(),
      createdIdsJson: input.createdIdsJson
        ? (input.createdIdsJson as Prisma.InputJsonValue)
        : undefined,
      summaryJson: input.summaryJson
        ? (input.summaryJson as Prisma.InputJsonValue)
        : undefined,
      retries: typeof input.retries === 'number' ? input.retries : undefined,
    },
  });
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

function toDate(value?: string | Date): Date | null {
  if (!value) return null;
  const parsed = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
