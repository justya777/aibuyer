import bcrypt from 'bcryptjs';
import type { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { db } from './db';

const resolvedNextAuthSecret =
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV !== 'production' ? 'dev-only-nextauth-secret-change-me' : undefined);

async function ensureActiveTenant(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { activeTenantId: true },
  });

  if (user?.activeTenantId) {
    return user.activeTenantId;
  }

  const membership = await db.tenantMember.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { tenantId: true },
  });

  if (!membership?.tenantId) {
    return null;
  }

  await db.user.update({
    where: { id: userId },
    data: { activeTenantId: membership.tenantId },
  });

  return membership.tenantId;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password || '';

        if (!email || !password) {
          return null;
        }

        const user = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            passwordHash: true,
            role: true,
          },
        });

        if (!user?.passwordHash) {
          return null;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        const activeTenantId = await ensureActiveTenant(user.id);

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          activeTenantId,
        } as {
          id: string;
          email: string;
          role: 'ADMIN' | 'USER';
          activeTenantId: string | null;
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.userId = user.id;
        const role = (user as { role?: string }).role;
        token.role = role === 'ADMIN' ? 'ADMIN' : 'USER';
        token.activeTenantId = (user as { activeTenantId?: string | null }).activeTenantId || null;
      }

      if (trigger === 'update' && session?.activeTenantId) {
        token.activeTenantId = session.activeTenantId;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.userId || '');
        session.user.role = (token.role as 'ADMIN' | 'USER') || 'USER';
        session.user.activeTenantId = (token.activeTenantId as string | null) || null;
      }

      return session;
    },
  },
  secret: resolvedNextAuthSecret,
};

export function getServerAuthSession() {
  return getServerSession(authOptions);
}
