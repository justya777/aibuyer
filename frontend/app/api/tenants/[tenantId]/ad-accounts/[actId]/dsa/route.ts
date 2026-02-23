import { DsaSource } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

const UpdateDsaSchema = z.object({
  dsaBeneficiary: z.string().min(1),
  dsaPayor: z.string().min(1),
});

function normalizeAdAccountId(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

function handleError(error: unknown): NextResponse {
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
    { success: false, error: error instanceof Error ? error.message : 'Failed to update DSA settings.' },
    { status: 500 }
  );
}

async function assertTenantAdmin(userId: string, tenantId: string, isPlatformAdmin: boolean): Promise<void> {
  if (isPlatformAdmin) return;
  const membership = await db.tenantMember.findUnique({
    where: {
      userId_tenantId: {
        userId,
        tenantId,
      },
    },
    select: { role: true },
  });
  if (!membership || membership.role !== 'ADMIN') {
    throw new TenantAccessError('Only tenant admins can update DSA settings.');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; actId: string }> }
) {
  try {
    const resolved = await params;
    const tenantId = resolved.tenantId;
    const adAccountId = normalizeAdAccountId(resolved.actId);
    const context = await resolveTenantContext(request, { allowAdminCrossTenant: true });
    if (!context.isPlatformAdmin && context.tenantId !== tenantId) {
      throw new TenantAccessError('Tenant access denied.');
    }
    await assertTenantAdmin(context.userId, tenantId, context.isPlatformAdmin);

    const payload = UpdateDsaSchema.parse(await request.json());

    const asset = await db.tenantAdAccount.findUnique({
      where: {
        tenantId_adAccountId: {
          tenantId,
          adAccountId,
        },
      },
      select: { id: true },
    });
    if (!asset) {
      return NextResponse.json(
        { success: false, error: `Ad account ${adAccountId} is not mapped to tenant ${tenantId}.` },
        { status: 404 }
      );
    }

    const updated = await db.adAccountSettings.upsert({
      where: {
        tenantId_adAccountId: {
          tenantId,
          adAccountId,
        },
      },
      update: {
        dsaBeneficiary: payload.dsaBeneficiary.trim(),
        dsaPayor: payload.dsaPayor.trim(),
        dsaSource: DsaSource.MANUAL,
        dsaUpdatedAt: new Date(),
      },
      create: {
        tenantId,
        adAccountId,
        dsaBeneficiary: payload.dsaBeneficiary.trim(),
        dsaPayor: payload.dsaPayor.trim(),
        dsaSource: DsaSource.MANUAL,
        dsaUpdatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      settings: {
        adAccountId: updated.adAccountId,
        dsaBeneficiary: updated.dsaBeneficiary,
        dsaPayor: updated.dsaPayor,
        dsaSource: updated.dsaSource,
        dsaUpdatedAt: updated.dsaUpdatedAt,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
