import { NextRequest, NextResponse } from 'next/server';
import {
  AuthRequiredError,
  TenantAccessError,
  resolveTenantContext,
} from '@/lib/tenant-context';
import { listRecentAiRuns } from '@/lib/ai-execution/run-store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const context = await resolveTenantContext(request);
    const { searchParams } = new URL(request.url);
    const adAccountId = searchParams.get('adAccountId') || undefined;
    const businessId = searchParams.get('businessId') || undefined;
    const limit = Number(searchParams.get('limit') || '20');

    const runs = await listRecentAiRuns({
      tenantId: context.tenantId,
      businessId,
      adAccountId,
      limit,
    });

    return NextResponse.json({
      success: true,
      runs: runs.map((run: any) => ({
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
        summaryJson: run.summaryJson || null,
        retries: run.retries ?? 0,
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
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
