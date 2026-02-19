import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  tenantName: z.string().min(2).max(120).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, tenantName } = SignupSchema.parse(body);
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Email is already registered.' },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const created = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role: 'USER',
        },
      });

      const tenant = await tx.tenant.create({
        data: {
          name: tenantName?.trim() || `${normalizedEmail.split('@')[0]}'s Workspace`,
        },
      });

      await tx.tenantMember.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          role: 'ADMIN',
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { activeTenantId: tenant.id },
      });

      return { userId: user.id, tenantId: tenant.id };
    });

    return NextResponse.json({
      success: true,
      userId: created.userId,
      tenantId: created.tenantId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid signup payload.', details: error.flatten() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Signup failed.' },
      { status: 500 }
    );
  }
}
