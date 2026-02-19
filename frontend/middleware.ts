import { withAuth } from 'next-auth/middleware';

const resolvedNextAuthSecret =
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV !== 'production' ? 'dev-only-nextauth-secret-change-me' : undefined);

export default withAuth({
  secret: resolvedNextAuthSecret,
});

export const config = {
  matcher: ['/((?!api/auth|login|signup|_next/static|_next/image|favicon.ico).*)'],
};
