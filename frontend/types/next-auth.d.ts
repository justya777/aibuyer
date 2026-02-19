import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'ADMIN' | 'USER';
      activeTenantId: string | null;
    } & DefaultSession['user'];
  }

  interface User {
    role?: 'ADMIN' | 'USER';
    activeTenantId?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    role?: 'ADMIN' | 'USER';
    activeTenantId?: string | null;
  }
}
