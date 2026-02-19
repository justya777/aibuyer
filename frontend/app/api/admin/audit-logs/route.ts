import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AuthRequiredError, requirePlatformAdmin } from '@/lib/tenant-context';

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin();

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || undefined;
    const limitRaw = Number.parseInt(searchParams.get('limit') || '200', 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 500)) : 200;

    const logs = await db.auditLog.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: {
        user: {
          select: { id: true, email: true },
        },
        tenant: {
          select: { id: true, name: true },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      logs: logs.map((entry) => ({
        id: entry.id,
        tenantId: entry.tenantId,
        tenantName: entry.tenant.name,
        userId: entry.userId,
        userEmail: entry.user?.email || null,
        action: entry.action,
        assetId: entry.assetId,
        summary: entry.summary,
        result: entry.result,
        metadata: entry.metadata,
        timestamp: entry.timestamp,
      })),
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch audit logs.' },
      { status: 500 }
    );
  }
}
