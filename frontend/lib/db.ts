import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __frontendPrisma: PrismaClient | undefined;
}

export const db =
  global.__frontendPrisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__frontendPrisma = db;
}
