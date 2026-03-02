import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { encryptToken } from '@/lib/security/token-encryption';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

const GRAPH_API_BASE = 'https://graph.facebook.com';

const ConnectSchema = z.object({
  businessId: z.string().min(1).regex(/^\d+$/, 'Business ID must be a numeric Meta Business Portfolio ID (e.g. 1661867741685961).'),
  systemUserId: z.string().optional(),
  accessToken: z.string().min(10),
});

async function assertTenantAdmin(userId: string, tenantId: string, isPlatformAdmin: boolean): Promise<void> {
  if (isPlatformAdmin) return;
  const membership = await db.tenantMember.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true },
  });
  if (!membership || membership.role !== 'ADMIN') {
    throw new TenantAccessError('Only tenant admins can manage Meta connections.');
  }
}

async function validateMetaToken(accessToken: string): Promise<{ id: string; name?: string }> {
  const res = await fetch(`${GRAPH_API_BASE}/me?access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message || 'Invalid Meta access token.';
    throw new TokenValidationError(msg);
  }
  return res.json();
}

class TokenValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenValidationError';
  }
}

function handleError(error: unknown): NextResponse {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { success: false, error: 'Invalid payload.', details: error.flatten() },
      { status: 400 }
    );
  }
  if (error instanceof TokenValidationError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 401 });
  }
  if (error instanceof TenantAccessError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }
  return NextResponse.json(
    { success: false, error: 'Failed to connect Meta account.' },
    { status: 500 }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const context = await resolveTenantContext(request, { allowAdminCrossTenant: true });
    if (!context.isPlatformAdmin && context.tenantId !== tenantId) {
      throw new TenantAccessError('Tenant access denied.');
    }
    await assertTenantAdmin(context.userId, tenantId, context.isPlatformAdmin);

    const payload = ConnectSchema.parse(await request.json());
    const { businessId, systemUserId, accessToken } = payload;

    await validateMetaToken(accessToken);

    const tokenLast4 = accessToken.slice(-4);
    const tokenEncrypted = encryptToken(accessToken);

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { businessId: true },
    });

    await db.$transaction([
      db.metaCredential.upsert({
        where: { tenantId_businessId: { tenantId, businessId } },
        update: {
          systemUserId: systemUserId || null,
          tokenEncrypted,
          tokenLast4,
          revokedAt: null,
          lastValidatedAt: new Date(),
          createdByUserId: context.userId,
        },
        create: {
          tenantId,
          businessId,
          systemUserId: systemUserId || null,
          tokenEncrypted,
          tokenLast4,
          lastValidatedAt: new Date(),
          createdByUserId: context.userId,
        },
      }),
      db.businessPortfolio.upsert({
        where: { tenantId_businessId: { tenantId, businessId } },
        update: { isActive: true, deletedAt: null, deletedBy: null },
        create: { tenantId, businessId, isActive: true },
      }),
      ...(tenant && !tenant.businessId
        ? [db.tenant.update({ where: { id: tenantId }, data: { businessId } })]
        : []),
    ]);

    return NextResponse.json({
      success: true,
      tenantId,
      businessId,
      tokenLast4,
    });
  } catch (error) {
    return handleError(error);
  }
}
