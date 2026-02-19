import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

const AddTenantAssetSchema = z.object({
  adAccountId: z.string().min(3),
});

function normalizeAdAccountId(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

export async function GET(request: NextRequest) {
  try {
    const context = await resolveTenantContext(request);
    const assets = await db.tenantAsset.findMany({
      where: { tenantId: context.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      tenantId: context.tenantId,
      assets: assets.map((asset) => ({
        id: asset.id,
        adAccountId: asset.adAccountId,
        createdAt: asset.createdAt,
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
      { success: false, error: error instanceof Error ? error.message : 'Failed to load tenant assets.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await resolveTenantContext(request);
    const body = await request.json();
    const parsed = AddTenantAssetSchema.parse(body);
    const normalizedAdAccountId = normalizeAdAccountId(parsed.adAccountId);

    // Tenant admin (or platform admin) required to assign assets.
    if (!context.isPlatformAdmin) {
      const membership = await db.tenantMember.findUnique({
        where: {
          userId_tenantId: {
            userId: context.userId,
            tenantId: context.tenantId,
          },
        },
        select: { role: true },
      });

      if (!membership || membership.role !== 'ADMIN') {
        return NextResponse.json(
          { success: false, error: 'Only tenant admins can add ad accounts.' },
          { status: 403 }
        );
      }
    }

    const created = await db.tenantAsset.upsert({
      where: {
        tenantId_adAccountId: {
          tenantId: context.tenantId,
          adAccountId: normalizedAdAccountId,
        },
      },
      update: {},
      create: {
        tenantId: context.tenantId,
        adAccountId: normalizedAdAccountId,
      },
    });

    return NextResponse.json({
      success: true,
      asset: {
        id: created.id,
        adAccountId: created.adAccountId,
        createdAt: created.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid payload.', details: error.flatten() },
        { status: 400 }
      );
    }
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to add tenant asset.' },
      { status: 500 }
    );
  }
}
