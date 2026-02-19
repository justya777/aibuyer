import { PrismaClient, TenantMemberRole, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  const sampleTenantName = process.env.SEED_SAMPLE_TENANT_NAME || 'Sample Tenant';
  const sampleAdAccountId = process.env.SEED_SAMPLE_AD_ACCOUNT_ID || 'act_1825705654795965';

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: UserRole.ADMIN,
      passwordHash,
    },
    create: {
      email: adminEmail,
      role: UserRole.ADMIN,
      passwordHash,
    },
  });

  const sampleTenant = await prisma.tenant.upsert({
    where: { id: 'sample-tenant' },
    update: {
      name: sampleTenantName,
    },
    create: {
      id: 'sample-tenant',
      name: sampleTenantName,
    },
  });

  await prisma.tenantMember.upsert({
    where: {
      userId_tenantId: {
        userId: adminUser.id,
        tenantId: sampleTenant.id,
      },
    },
    update: {
      role: TenantMemberRole.ADMIN,
    },
    create: {
      userId: adminUser.id,
      tenantId: sampleTenant.id,
      role: TenantMemberRole.ADMIN,
    },
  });

  await prisma.tenantAsset.upsert({
    where: {
      tenantId_adAccountId: {
        tenantId: sampleTenant.id,
        adAccountId: sampleAdAccountId,
      },
    },
    update: {},
    create: {
      tenantId: sampleTenant.id,
      adAccountId: sampleAdAccountId,
    },
  });

  await prisma.user.update({
    where: { id: adminUser.id },
    data: { activeTenantId: sampleTenant.id },
  });

  console.log('Seed complete');
  console.log(`Admin: ${adminEmail}`);
  console.log(`Sample tenant: ${sampleTenant.name} (${sampleTenant.id})`);
  console.log(`Sample ad account: ${sampleAdAccountId}`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
