/**
 * Database seed script — creates a Demo organization and Admin user for local development.
 *
 * Run with: npm run db:seed
 *
 * After seeding, you can use the mock-token (in development only) or log in with:
 *   Email: admin@demo.com
 *   Password: password123
 *   Org Slug: demo
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Upsert org (safe to re-run)
  const org = await prisma.organization.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo Organization',
      slug: 'demo',
      maxQuestionsPerDay: 500,
    },
  });
  console.log(`✅ Organization: ${org.name} (slug: ${org.slug})`);

  // Upsert admin user
  const passwordHash = await bcrypt.hash('password123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      email: 'admin@demo.com',
      name: 'Admin User',
      passwordHash,
      role: 'ADMIN',
      organizationId: org.id,
    },
  });
  console.log(`✅ Admin user: ${admin.email}`);

  // Upsert reviewer user
  const reviewerHash = await bcrypt.hash('password123', 12);
  const reviewer = await prisma.user.upsert({
    where: { email: 'reviewer@demo.com' },
    update: {},
    create: {
      email: 'reviewer@demo.com',
      name: 'Reviewer User',
      passwordHash: reviewerHash,
      role: 'REVIEWER',
      organizationId: org.id,
    },
  });
  console.log(`✅ Reviewer user: ${reviewer.email}`);

  console.log('\n🎉 Seed complete!');
  console.log('');
  console.log('Login credentials:');
  console.log('  Admin  → admin@demo.com    / password123  (org: demo)');
  console.log('  Reviewer → reviewer@demo.com / password123  (org: demo)');
  console.log('');
  console.log('Or use mock-token header in dev: Authorization: Bearer mock-token');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
