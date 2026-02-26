import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  AuthRequiredError,
  TenantAccessError,
  resolveTenantContext,
} from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function normalizeAdAccountId(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { tenantId: string; businessId: string; actId: string } }
) {
  try {
    const context = await resolveTenantContext(request);
    const { tenantId, actId } = params;
    if (context.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Tenant mismatch' }, { status: 403 });
    }
    const adAccountId = normalizeAdAccountId(actId);

    const pixels = await db.tenantPixel.findMany({
      where: { tenantId, adAccountId },
      orderBy: { lastSeenAt: 'desc' },
    });

    const settings = await db.adAccountSettings.findUnique({
      where: { tenantId_adAccountId: { tenantId, adAccountId } },
      select: { defaultPixelId: true },
    });

    const defaultPixel = settings?.defaultPixelId
      ? pixels.find((p) => p.pixelId === settings.defaultPixelId) ?? null
      : null;

    const hasAnyPixel = pixels.length > 0;
    const hasReadablePixel = pixels.some((p) => p.permissionOk);
    const hasDefaultPixel = !!defaultPixel;

    let status: 'connected' | 'unknown' | 'no_access' | 'none';
    if (hasDefaultPixel) {
      status = 'connected';
    } else if (hasReadablePixel) {
      status = 'connected';
    } else if (hasAnyPixel) {
      status = 'no_access';
    } else {
      status = 'none';
    }

    return NextResponse.json({
      status,
      pixelCount: pixels.length,
      defaultPixelId: settings?.defaultPixelId ?? null,
      defaultPixelName: defaultPixel?.name ?? null,
      hasReadablePixel,
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
