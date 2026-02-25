import { NextRequest, NextResponse } from 'next/server';
import {
  AuthRequiredError,
  TenantAccessError,
  resolveTenantContext,
} from '@/lib/tenant-context';
import { getAiRunById, listAiRunEvents } from '@/lib/ai-execution/run-store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const context = await resolveTenantContext(request);
    const { runId } = await params;
    const run = await getAiRunById(runId);
    if (!run) {
      return NextResponse.json({ success: false, error: 'Run not found.' }, { status: 404 });
    }
    if (run.tenantId !== context.tenantId) {
      throw new TenantAccessError('Run access denied for this tenant.');
    }

    const events = await listAiRunEvents(runId);
    return NextResponse.json({
      success: true,
      run: {
        id: run.id,
        userId: run.userId,
        tenantId: run.tenantId,
        businessId: run.businessId,
        adAccountId: run.adAccountId,
        commandText: run.commandText,
        status: run.status,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() || null,
        createdIdsJson: run.createdIdsJson || null,
        summaryJson: (run as any).summaryJson || null,
        retries: (run as any).retries ?? 0,
      },
      events: events.map((event: any) => ({
        id: event.id,
        runId: event.runId,
        type: event.type,
        stepId: event.stepId,
        label: event.label,
        summary: event.summary,
        status: event.status,
        userTitle: event.userTitle,
        userMessage: event.userMessage,
        rationale: event.rationale,
        debugJson: event.debugJson || null,
        createdIdsJson: event.createdIdsJson || null,
        ts: event.ts.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
