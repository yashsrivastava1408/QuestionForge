import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create Organization
  const org = await prisma.organization.upsert({
    where: { slug: 'asd' },
    update: {},
    create: {
      name: 'Question Forge Internal',
      slug: 'asd',
    },
  });
  console.log('✅ Organization created:', org.slug);

  // Hash password
  const passwordHash = await bcrypt.hash('password123', 12);

  // Create Admin User
  const admin = await prisma.user.upsert({
    where: { email: 'asd@gmail.com' },
    update: { passwordHash },
    create: {
      email: 'asd@gmail.com',
      name: 'Admin User',
      passwordHash,
      role: 'ADMIN',
      organizationId: org.id,
    },
  });
  console.log('✅ Admin user created:', admin.email);
  console.log('\n🎉 You can now log in with:');
  console.log('Slug:', org.slug);
  console.log('Email:', admin.email);
  console.log('Password: password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
