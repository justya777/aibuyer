import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { MCPClient } from '@/lib/mcp-client';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

const AutofillRequestSchema = z.object({
  pageId: z.string().trim().min(1).optional(),
});

function normalizeAdAccountId(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

function parseStructuredError(error: unknown): { code?: string; message?: string } {
  const message = error instanceof Error ? error.message : '';
  if (!message) {
    return {};
  }

  try {
    const parsed = JSON.parse(message) as { code?: string; message?: string };
    if (parsed && typeof parsed === 'object') {
      return {
        code: typeof parsed.code === 'string' ? parsed.code : undefined,
        message: typeof parsed.message === 'string' ? parsed.message : undefined,
      };
    }
  } catch {
    // Fall through to string matching.
  }

  if (message.includes('PERMISSION_DENIED')) {
    return {
      code: 'PERMISSION_DENIED',
      message,
    };
  }
  return {};
}

async function parseOptionalBody(request: NextRequest): Promise<{ pageId?: string }> {
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return {};
  }
  const parsed = AutofillRequestSchema.parse(JSON.parse(rawBody));
  return { pageId: parsed.pageId };
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
    { success: false, error: error instanceof Error ? error.message : 'Failed to autofill DSA settings.' },
    { status: 500 }
  );
}

async function assertTenantAdmin(userId: string, tenantId: string, isPlatformAdmin: boolean): Promise<void> {
  if (isPlatformAdmin) return;
  const membership = await db.tenantMember.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true },
  });
  if (!membership || membership.role !== 'ADMIN') {
    throw new TenantAccessError('Only tenant admins can update DSA settings.');
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; businessId: string; actId: string }> }
) {
  try {
    const { tenantId, businessId, actId } = await params;
    const adAccountId = normalizeAdAccountId(actId);
    const context = await resolveTenantContext(request, { allowAdminCrossTenant: true });
    if (!context.isPlatformAdmin && context.tenantId !== tenantId) {
      throw new TenantAccessError('Tenant access denied.');
    }
    await assertTenantAdmin(context.userId, tenantId, context.isPlatformAdmin);

    const body = await parseOptionalBody(request);
    const [business, adAccount, settings] = await Promise.all([
      db.businessPortfolio.findUnique({
        where: { tenantId_businessId: { tenantId, businessId } },
        select: { businessId: true },
      }),
      db.tenantAdAccount.findUnique({
        where: { tenantId_adAccountId: { tenantId, adAccountId } },
        select: { businessId: true },
      }),
      db.adAccountSettings.findUnique({
        where: { tenantId_adAccountId: { tenantId, adAccountId } },
        select: { defaultPageId: true },
      }),
    ]);

    if (!business) {
      return NextResponse.json(
        { success: false, error: `Business ${businessId} is not mapped to tenant ${tenantId}.` },
        { status: 404 }
      );
    }
    if (!adAccount) {
      return NextResponse.json(
        { success: false, error: `Ad account ${adAccountId} is not mapped to tenant ${tenantId}.` },
        { status: 404 }
      );
    }
    if (adAccount.businessId !== businessId) {
      return NextResponse.json(
        { success: false, error: `Ad account ${adAccountId} is not mapped to business ${businessId}.` },
        { status: 404 }
      );
    }

    const resolvedPageId = body.pageId || settings?.defaultPageId || undefined;
    const mcpClient = new MCPClient({
      tenantId,
      userId: context.userId,
      isPlatformAdmin: context.isPlatformAdmin,
    });
    const suggestion = await mcpClient.callTool('get_dsa_autofill_suggestions', {
      businessId,
      adAccountId,
      pageId: resolvedPageId,
    });

    return NextResponse.json({
      success: true,
      beneficiary: suggestion.beneficiary,
      payer: suggestion.payer,
      meta: suggestion.meta || {},
    });
  } catch (error) {
    const structuredError = parseStructuredError(error);
    if (structuredError.code === 'PERMISSION_DENIED') {
      return NextResponse.json(
        {
          success: false,
          code: 'PERMISSION_DENIED',
          error: structuredError.message || 'Permission denied while fetching Meta autofill data.',
        },
        { status: 403 }
      );
    }
    return handleError(error);
  }
}
