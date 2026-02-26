import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MCPClient } from '@/lib/mcp-client';
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

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

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

    const cached = await db.tenantPixel.findMany({
      where: { tenantId, adAccountId },
      orderBy: { lastSeenAt: 'desc' },
    });

    const newestSeen = cached[0]?.lastSeenAt;
    const isStale = !newestSeen || Date.now() - newestSeen.getTime() > STALE_THRESHOLD_MS;

    if (!isStale && cached.length > 0) {
      return NextResponse.json({
        pixels: cached.map(mapPixelRow),
        source: 'cache',
      });
    }

    let mcpClient: MCPClient | null = null;
    try {
      mcpClient = new MCPClient(context);
      const result = await mcpClient.callTool('get_ad_account_pixels', { accountId: adAccountId });
      const fetched = Array.isArray(result) ? result : [];

      for (const pixel of fetched) {
        await db.tenantPixel.upsert({
          where: { tenantId_pixelId: { tenantId, pixelId: String(pixel.id) } },
          create: {
            tenantId,
            adAccountId,
            businessId: params.businessId,
            pixelId: String(pixel.id),
            name: pixel.name || null,
            ownerBmId: pixel.ownerBusinessId || null,
            verified: !pixel.isUnavailable,
            permissionOk: !pixel.isUnavailable,
            lastSeenAt: new Date(),
          },
          update: {
            name: pixel.name || undefined,
            ownerBmId: pixel.ownerBusinessId || undefined,
            verified: !pixel.isUnavailable,
            permissionOk: !pixel.isUnavailable,
            lastSeenAt: new Date(),
          },
        });
      }

      const refreshed = await db.tenantPixel.findMany({
        where: { tenantId, adAccountId },
        orderBy: { lastSeenAt: 'desc' },
      });

      return NextResponse.json({
        pixels: refreshed.map(mapPixelRow),
        source: 'meta',
      });
    } catch (err) {
      if (cached.length > 0) {
        return NextResponse.json({
          pixels: cached.map(mapPixelRow),
          source: 'cache_fallback',
          warning: 'Could not refresh from Meta',
        });
      }
      return NextResponse.json({
        pixels: [],
        source: 'error',
        warning: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      mcpClient?.destroy();
    }
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

function mapPixelRow(row: {
  pixelId: string;
  name: string | null;
  ownerBmId: string | null;
  verified: boolean;
  permissionOk: boolean;
  lastSeenAt: Date;
  adAccountId: string | null;
}) {
  return {
    pixelId: row.pixelId,
    name: row.name,
    ownerBmId: row.ownerBmId,
    verified: row.verified,
    permissionOk: row.permissionOk,
    lastSeenAt: row.lastSeenAt.toISOString(),
    adAccountId: row.adAccountId,
  };
}
