import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AuthRequiredError, requirePlatformAdmin } from '@/lib/tenant-context';

export async function GET() {
  try {
    await requirePlatformAdmin();

    const tenants = await db.tenant.findMany({
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, role: true, createdAt: true },
            },
          },
        },
        assets: {
          select: { id: true, adAccountId: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      tenants: tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        createdAt: tenant.createdAt,
        members: tenant.members.map((member) => ({
          userId: member.user.id,
          email: member.user.email,
          platformRole: member.user.role,
          tenantRole: member.role,
          joinedAt: member.createdAt,
        })),
        assets: tenant.assets,
      })),
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch tenants.' },
      { status: 500 }
    );
  }
}
