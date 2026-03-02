import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { encryptToken } from '@/lib/security/token-encryption';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

const GRAPH_API_BASE = 'https://graph.facebook.com';

const CreateBusinessSchema = z.object({
  businessId: z.string().min(1).regex(/^\d+$/, 'Business ID must be numeric.'),
  label: z.string().optional(),
  accessToken: z.string().min(10, 'Access token is required.'),
});

async function assertTenantAdmin(userId: string, tenantId: string, isPlatformAdmin: boolean): Promise<void> {
  if (isPlatformAdmin) return;
  const membership = await db.tenantMember.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true },
  });
  if (!membership || membership.role !== 'ADMIN') {
    throw new TenantAccessError('Only tenant admins can manage business portfolios.');
  }
}

class TokenValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenValidationError';
  }
}

async function validateMetaToken(accessToken: string): Promise<void> {
  const res = await fetch(`${GRAPH_API_BASE}/me?access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new TokenValidationError(body?.error?.message || 'Invalid Meta access token.');
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
    { success: false, error: error instanceof Error ? error.message : 'Failed to process businesses.' },
    { status: 500 }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const context = await resolveTenantContext(request, { allowAdminCrossTenant: true });
    if (!context.isPlatformAdmin && context.tenantId !== tenantId) {
      throw new TenantAccessError('Tenant access denied.');
    }

    const [businesses, tenant] = await Promise.all([
      db.businessPortfolio.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      db.tenant.findUnique({
        where: { id: tenantId },
        select: { businessId: true },
      }),
    ]);

    const mergedBusinesses = [...businesses];
    if (
      tenant?.businessId &&
      !mergedBusinesses.some((entry) => entry.businessId === tenant.businessId)
    ) {
      mergedBusinesses.push({
        id: `legacy-${tenant.businessId}`,
        tenantId,
        businessId: tenant.businessId,
        label: null,
        isActive: true,
        lastSyncAt: null,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      });
    }

    const credentials = await db.metaCredential.findMany({
      where: { tenantId, revokedAt: null },
      select: { businessId: true, tokenLast4: true, lastValidatedAt: true },
    });
    const credMap = new Map(credentials.map((c) => [c.businessId, c]));

    const summaries = await Promise.all(
      mergedBusinesses.map(async (business) => {
        const [adAccountsCount, pagesCount] = await Promise.all([
          db.tenantAdAccount.count({
            where: { tenantId, businessId: business.businessId },
          }),
          db.tenantPage.count({
            where: { tenantId, businessId: business.businessId },
          }),
        ]);

        const cred = credMap.get(business.businessId);
        return {
          tenantId,
          businessId: business.businessId,
          label: business.label,
          lastSyncAt: business.lastSyncAt,
          createdAt: business.createdAt,
          tokenLast4: cred?.tokenLast4 ?? null,
          tokenConnected: !!cred,
          counts: {
            adAccounts: adAccountsCount,
            pages: pagesCount,
          },
        };
      })
    );

    return NextResponse.json({
      success: true,
      tenantId,
      businesses: summaries,
    });
  } catch (error) {
    return handleError(error);
  }
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

    const payload = CreateBusinessSchema.parse(await request.json());
    const businessId = payload.businessId.trim();
    const label = payload.label?.trim() || null;
    const { accessToken } = payload;

    await validateMetaToken(accessToken);

    const tokenLast4 = accessToken.slice(-4);
    const tokenEncrypted = encryptToken(accessToken);

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { businessId: true },
    });

    const [business] = await db.$transaction([
      db.businessPortfolio.upsert({
        where: { tenantId_businessId: { tenantId, businessId } },
        update: { label, isActive: true, deletedAt: null, deletedBy: null },
        create: { tenantId, businessId, label, isActive: true },
      }),
      db.metaCredential.upsert({
        where: { tenantId_businessId: { tenantId, businessId } },
        update: {
          tokenEncrypted,
          tokenLast4,
          revokedAt: null,
          lastValidatedAt: new Date(),
          createdByUserId: context.userId,
        },
        create: {
          tenantId,
          businessId,
          tokenEncrypted,
          tokenLast4,
          lastValidatedAt: new Date(),
          createdByUserId: context.userId,
        },
      }),
      ...(tenant && !tenant.businessId
        ? [db.tenant.update({ where: { id: tenantId }, data: { businessId } })]
        : []),
    ]);

    return NextResponse.json({
      success: true,
      tenantId,
      business: {
        tenantId,
        businessId: business.businessId,
        label: business.label,
        lastSyncAt: business.lastSyncAt,
        createdAt: business.createdAt,
        tokenLast4,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
