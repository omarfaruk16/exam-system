/**
 * Create (or update) a single super_admin — no demo data. Reads the account from env vars:
 *   ADMIN_EMAIL     (required)
 *   ADMIN_PASSWORD  (required, min 8 chars)
 *   ADMIN_NAME      (optional, defaults to "Super Admin")
 *
 * Safe to re-run: if the email already exists it just resets that admin's password. It also
 * ensures the five Role rows exist, so the new admin can then create other users from the UI.
 *
 * Run it inside the API container (see infra/DEPLOYMENT.md):
 *   docker exec -it -e ADMIN_EMAIL='you@ru.ac.bd' -e ADMIN_PASSWORD='YourStrongPass' \
 *     exam_api pnpm exec tsx prisma/create-admin.ts
 */
import { PrismaClient, type RoleName } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Same argon2 parameters the app uses, so the login check verifies the hash correctly.
const HASH_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

async function main(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? '').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD ?? '';
  const displayName = process.env.ADMIN_NAME?.trim() || 'Super Admin';

  if (!email || !password) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables.');
  }
  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
  }

  // 1. Ensure every role exists (required before any user can be created from the UI).
  const roleNames: RoleName[] = ['super_admin', 'admin', 'department_head', 'teacher', 'student'];
  for (const name of roleNames) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'super_admin' } });

  // 2. Create the user, or reset the password if this email already exists.
  const username = email.split('@')[0] || 'superadmin';
  const passwordHash = await argon2.hash(password, HASH_OPTS);
  const existing = await prisma.user.findFirst({ where: { email } });

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          displayName,
          mustChangePassword: false,
          status: 'active',
          deletedAt: null,
        },
      })
    : await prisma.user.create({
        data: { username, email, displayName, passwordHash, mustChangePassword: false },
      });

  // 3. Give them the super_admin role (institution-wide, no scope) if they don't have it.
  const hasRole = await prisma.userRole.findFirst({
    where: {
      userId: user.id,
      roleId: superAdminRole.id,
      scopeFacultyId: null,
      scopeDepartmentId: null,
    },
  });
  if (!hasRole) {
    await prisma.userRole.create({ data: { userId: user.id, roleId: superAdminRole.id } });
  }

  console.log(
    `✅ super_admin ready — email: ${email} · username: ${username} · ${existing ? 'password updated' : 'created'}`,
  );
  console.log('   Log in at https://e-exam.ru.ac.bd with that email and password.');
}

main()
  .catch((e: unknown) => {
    console.error('❌', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
