import { DsaSource, PrismaClient, TenantMemberRole, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  const sampleTenantName = process.env.SEED_SAMPLE_TENANT_NAME || 'Sample Tenant';
  const sampleBusinessId = process.env.SEED_SAMPLE_BUSINESS_ID || '123456789012345';
  const sampleAdAccountId = process.env.SEED_SAMPLE_AD_ACCOUNT_ID || 'act_1825705654795965';
  const samplePageId = process.env.SEED_SAMPLE_PAGE_ID?.trim() || '';

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
      businessId: sampleBusinessId,
    },
    create: {
      id: 'sample-tenant',
      name: sampleTenantName,
      businessId: sampleBusinessId,
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

  await prisma.tenantAdAccount.upsert({
    where: {
      tenantId_adAccountId: {
        tenantId: sampleTenant.id,
        adAccountId: sampleAdAccountId,
      },
    },
    update: {
      name: 'Sample Ad Account',
      status: 'active',
      lastSyncedAt: new Date(),
    },
    create: {
      id: 'sample-tenant-ad-account',
      tenantId: sampleTenant.id,
      adAccountId: sampleAdAccountId,
      name: 'Sample Ad Account',
      status: 'active',
      lastSyncedAt: new Date(),
    },
  });

  if (samplePageId) {
    await prisma.tenantPage.upsert({
      where: {
        tenantId_pageId: {
          tenantId: sampleTenant.id,
          pageId: samplePageId,
        },
      },
      update: {
        name: 'Sample Page',
        source: 'BUSINESS_OWNED',
        lastSeenAt: new Date(),
      },
      create: {
        id: 'sample-tenant-page',
        tenantId: sampleTenant.id,
        pageId: samplePageId,
        name: 'Sample Page',
        source: 'BUSINESS_OWNED',
        tasksJson: ['ADVERTISE', 'CREATE_CONTENT'],
        lastSeenAt: new Date(),
      },
    });
  }

  await prisma.adAccountSettings.upsert({
    where: {
      tenantId_adAccountId: {
        tenantId: sampleTenant.id,
        adAccountId: sampleAdAccountId,
      },
    },
    update: {
      defaultPageId: samplePageId || null,
      dsaBeneficiary: 'Sample Beneficiary LLC',
      dsaPayor: 'Sample Payor LLC',
      dsaSource: DsaSource.MANUAL,
      dsaUpdatedAt: new Date(),
    },
    create: {
      tenantId: sampleTenant.id,
      adAccountId: sampleAdAccountId,
      defaultPageId: samplePageId || null,
      dsaBeneficiary: 'Sample Beneficiary LLC',
      dsaPayor: 'Sample Payor LLC',
      dsaSource: DsaSource.MANUAL,
      dsaUpdatedAt: new Date(),
    },
  });

  await prisma.user.update({
    where: { id: adminUser.id },
    data: { activeTenantId: sampleTenant.id },
  });

  console.log('Seed complete');
  console.log(`Admin: ${adminEmail}`);
  console.log(`Sample tenant: ${sampleTenant.name} (${sampleTenant.id})`);
  console.log(`Sample business id: ${sampleBusinessId}`);
  console.log(`Sample ad account: ${sampleAdAccountId}`);
  if (samplePageId) {
    console.log(`Sample page: ${samplePageId}`);
  }
  console.log('Sample DSA settings created for sample ad account');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
