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
});

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const context = await resolveTenantContext(request);
    const body = await request.json();
    const { command, accountId, businessId } = AICommandSchema.parse(body);
    const requestCookie = request.headers.get('cookie') || undefined;
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
    });

    return NextResponse.json({
      success: true,
      executionId: session.id,
      runId: run.id,
      message: 'Execution started',
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
