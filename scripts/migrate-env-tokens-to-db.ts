/**
 * One-time migration: move TENANT_SU_TOKEN_MAP env tokens into the
 * MetaCredential table so that DbTokenProvider can serve them.
 *
 * Usage:
 *   npx tsx scripts/migrate-env-tokens-to-db.ts
 *
 * Required env vars:
 *   - DATABASE_URL
 *   - TOKEN_ENCRYPTION_KEY  (32-byte hex)
 *   - TENANT_SU_TOKEN_MAP   (JSON map of tenantId -> token)
 *
 * Optional:
 *   - GLOBAL_SYSTEM_USER_TOKEN  (applied to tenants that already have a
 *     BusinessPortfolio but no entry in TENANT_SU_TOKEN_MAP)
 */

import { PrismaClient } from '@prisma/client';
import { createCipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    console.error('ERROR: TOKEN_ENCRYPTION_KEY is required.');
    process.exit(1);
  }
  const buf = Buffer.from(raw, 'hex');
  if (buf.length !== 32) {
    console.error(`ERROR: TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes). Got ${buf.length} bytes.`);
    process.exit(1);
  }
  return buf;
}

function encryptToken(plaintext: string, encKey: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

async function main() {
  const encKey = getEncryptionKey();
  const prisma = new PrismaClient();

  const tenantMapRaw = process.env.TENANT_SU_TOKEN_MAP;
  const globalToken = (
    process.env.GLOBAL_SYSTEM_USER_TOKEN ||
    process.env.GLOBAL_SU_TOKEN ||
    process.env.META_SYSTEM_USER_TOKEN
  )?.trim();

  let tenantMap: Record<string, string> = {};
  if (tenantMapRaw) {
    try {
      tenantMap = JSON.parse(tenantMapRaw);
    } catch {
      console.error('ERROR: TENANT_SU_TOKEN_MAP is not valid JSON.');
      process.exit(1);
    }
  }

  const entries = Object.entries(tenantMap).filter(
    ([k, v]) => k.trim() && typeof v === 'string' && v.trim()
  );

  if (entries.length === 0 && !globalToken) {
    console.log('No tokens found in TENANT_SU_TOKEN_MAP or GLOBAL_SYSTEM_USER_TOKEN. Nothing to migrate.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${entries.length} tenant-specific token(s) to migrate.`);
  if (globalToken) {
    console.log('GLOBAL_SYSTEM_USER_TOKEN is set — will apply to existing BPs without a tenant-specific mapping.');
  }

  let migrated = 0;
  let skipped = 0;

  for (const [tenantId, token] of entries) {
    const trimmedTenantId = tenantId.trim();
    const trimmedToken = token.trim();

    const tenant = await prisma.tenant.findUnique({
      where: { id: trimmedTenantId },
      select: { id: true, businessId: true },
    });

    if (!tenant) {
      console.warn(`  SKIP: Tenant ${trimmedTenantId} not found in DB.`);
      skipped++;
      continue;
    }

    const portfolio = await prisma.businessPortfolio.findFirst({
      where: { tenantId: trimmedTenantId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { businessId: true },
    });

    const businessId = portfolio?.businessId || tenant.businessId;
    if (!businessId) {
      console.warn(`  SKIP: Tenant ${trimmedTenantId} has no BusinessPortfolio or businessId.`);
      skipped++;
      continue;
    }

    const tokenLast4 = trimmedToken.slice(-4);
    const tokenEncrypted = encryptToken(trimmedToken, encKey);

    await prisma.metaCredential.upsert({
      where: { tenantId_businessId: { tenantId: trimmedTenantId, businessId } },
      update: { tokenEncrypted, tokenLast4 },
      create: { tenantId: trimmedTenantId, businessId, tokenEncrypted, tokenLast4 },
    });

    await prisma.businessPortfolio.upsert({
      where: { tenantId_businessId: { tenantId: trimmedTenantId, businessId } },
      update: { isActive: true },
      create: { tenantId: trimmedTenantId, businessId, isActive: true },
    });

    console.log(`  OK: Tenant ${trimmedTenantId} → Business ${businessId} (****${tokenLast4})`);
    migrated++;
  }

  if (globalToken) {
    const mappedTenantIds = new Set(entries.map(([k]) => k.trim()));
    const portfolios = await prisma.businessPortfolio.findMany({
      where: { deletedAt: null, tenantId: { notIn: [...mappedTenantIds] } },
      select: { tenantId: true, businessId: true },
    });

    for (const bp of portfolios) {
      const existing = await prisma.metaCredential.findUnique({
        where: { tenantId_businessId: { tenantId: bp.tenantId, businessId: bp.businessId } },
        select: { id: true, revokedAt: true },
      });

      if (existing && !existing.revokedAt) continue;

      const tokenLast4 = globalToken.slice(-4);
      const tokenEncrypted = encryptToken(globalToken, encKey);

      await prisma.metaCredential.upsert({
        where: { tenantId_businessId: { tenantId: bp.tenantId, businessId: bp.businessId } },
        update: { tokenEncrypted, tokenLast4, revokedAt: null },
        create: { tenantId: bp.tenantId, businessId: bp.businessId, tokenEncrypted, tokenLast4 },
      });

      await prisma.businessPortfolio.update({
        where: { tenantId_businessId: { tenantId: bp.tenantId, businessId: bp.businessId } },
        data: { isActive: true },
      });

      console.log(`  OK (global): Tenant ${bp.tenantId} → Business ${bp.businessId} (****${tokenLast4})`);
      migrated++;
    }
  }

  console.log(`\nMigration complete: ${migrated} migrated, ${skipped} skipped.`);
  console.log(
    '\n⚠  DEPRECATION WARNING: Remove TENANT_SU_TOKEN_MAP and GLOBAL_SYSTEM_USER_TOKEN from .env once verified.'
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
