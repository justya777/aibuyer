import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AuthRequiredError,
  TenantAccessError,
  resolveTenantContext,
} from '@/lib/tenant-context';
import { createAiRun } from '@/lib/ai-execution/run-store';
import { createExecutionSession } from '@/lib/ai-execution/session-store';

const AICommandSchema = z.object({
  command: z.string(),
  accountId: z.string(),
  businessId: z.string().min(1).optional(),
  resumeFromRunId: z.string().optional(),
});

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const context = await resolveTenantContext(request);
    const body = await request.json();
    const { command, accountId, businessId, resumeFromRunId } = AICommandSchema.parse(body);
    const requestCookie = request.headers.get('cookie') || undefined;

    let previousCreatedIds: Record<string, string> | undefined;
    if (resumeFromRunId) {
      const { getAiRunById } = await import('@/lib/ai-execution/run-store');
      const prevRun = await getAiRunById(resumeFromRunId);
      if (prevRun?.createdIdsJson && typeof prevRun.createdIdsJson === 'object') {
        previousCreatedIds = prevRun.createdIdsJson as Record<string, string>;
      }
    }

    const run = await createAiRun({
      userId: context.userId,
      tenantId: context.tenantId,
      businessId,
      adAccountId: accountId,
      commandText: command,
    });

    const session = createExecutionSession({
      runId: run.id,
      userId: context.userId,
      tenantId: context.tenantId,
      command,
      accountId,
      businessId,
      requestCookie,
      previousCreatedIds,
    });

    return NextResponse.json({
      success: true,
      executionId: session.id,
      runId: run.id,
      message: resumeFromRunId ? 'Execution resumed from failed step' : 'Execution started',
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
