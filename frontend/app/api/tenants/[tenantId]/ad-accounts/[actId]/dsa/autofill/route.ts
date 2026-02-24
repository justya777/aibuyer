import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MCPClient } from '@/lib/mcp-client';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';
import type { DsaSource } from '@prisma/client';

function normalizeAdAccountId(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

function normalizeSettingsPayload(
  adAccountId: string,
  settings: {
    dsaBeneficiary?: string | null;
    dsaPayor?: string | null;
    dsaSource?: DsaSource | null;
    dsaUpdatedAt?: Date | null;
  } | null
) {
  const dsaBeneficiary = settings?.dsaBeneficiary || null;
  const dsaPayor = settings?.dsaPayor || null;
  return {
    adAccountId,
    dsaBeneficiary,
    dsaPayor,
    dsaSource: settings?.dsaSource || null,
    dsaUpdatedAt: settings?.dsaUpdatedAt || null,
    configured: Boolean(dsaBeneficiary && dsaPayor),
  };
}

function handleError(error: unknown): NextResponse {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 401 });
  }
  if (error instanceof TenantAccessError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }
  return NextResponse.json(
    { success: false, error: error instanceof Error ? error.message : 'Failed to autofill DSA settings.' },
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

async function ensureTenantAdAccount(tenantId: string, adAccountId: string): Promise<{ businessId: string | null }> {
  const asset = await db.tenantAdAccount.findUnique({
    where: {
      tenantId_adAccountId: {
        tenantId,
        adAccountId,
      },
    },
    select: {
      businessId: true,
    },
  });
  if (!asset) {
    throw new Error(`Ad account ${adAccountId} is not mapped to tenant ${tenantId}.`);
  }
  return {
    businessId: asset.businessId || null,
  };
}

export async function POST(
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

    const asset = await ensureTenantAdAccount(tenantId, adAccountId);

    const mcpClient = new MCPClient({
      tenantId,
      userId: context.userId,
      isPlatformAdmin: context.isPlatformAdmin,
    });
    const result = await mcpClient.callTool('autofill_dsa_for_ad_account', {
      adAccountId,
      businessId: asset.businessId || undefined,
    });

    const settings = await db.adAccountSettings.findUnique({
      where: {
        tenantId_adAccountId: {
          tenantId,
          adAccountId,
        },
      },
      select: {
        dsaBeneficiary: true,
        dsaPayor: true,
        dsaSource: true,
        dsaUpdatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      result,
      settings: normalizeSettingsPayload(adAccountId, settings),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('is not mapped to tenant')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    return handleError(error);
  }
}
