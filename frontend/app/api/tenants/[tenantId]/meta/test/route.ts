import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decryptToken } from '@/lib/security/token-encryption';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

const GRAPH_API_BASE = 'https://graph.facebook.com';

function handleError(error: unknown): NextResponse {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 401 });
  }
  if (error instanceof TenantAccessError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }
  return NextResponse.json(
    { success: false, error: 'Failed to test Meta connection.' },
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

    const businessId = request.nextUrl.searchParams.get('businessId') || undefined;
    const credential = await db.metaCredential.findFirst({
      where: { tenantId, ...(businessId ? { businessId } : {}), revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        tokenEncrypted: true,
        tokenLast4: true,
        lastValidatedAt: true,
        businessId: true,
        systemUserId: true,
      },
    });

    if (!credential) {
      return NextResponse.json({
        success: true,
        connected: false,
        error: 'No active Meta credential found.',
      });
    }

    let valid = false;
    let businessName: string | undefined;

    try {
      const token = decryptToken(credential.tokenEncrypted);
      const res = await fetch(
        `${GRAPH_API_BASE}/me?access_token=${encodeURIComponent(token)}&fields=id,name`
      );
      if (res.ok) {
        const data = await res.json();
        valid = true;
        businessName = data.name;
      }
    } catch {
      valid = false;
    }

    if (valid) {
      await db.metaCredential.update({
        where: { tenantId_businessId: { tenantId, businessId: credential.businessId } },
        data: { lastValidatedAt: new Date() },
      });
    }

    return NextResponse.json({
      success: true,
      connected: true,
      valid,
      businessId: credential.businessId,
      businessName,
      tokenLast4: credential.tokenLast4,
      lastValidatedAt: credential.lastValidatedAt,
    });
  } catch (error) {
    return handleError(error);
  }
}
