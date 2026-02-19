import { AuditResult, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

interface AuditInput {
  tenantId: string;
  userId?: string;
  action: string;
  assetId?: string;
  summary: string;
  result: AuditResult;
  metadata?: Record<string, unknown>;
}

export class AuditLogService {
  async log(input: AuditInput): Promise<void> {
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        action: input.action,
        assetId: input.assetId,
        summary: input.summary,
        result: input.result,
        metadata: (input.metadata || undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
