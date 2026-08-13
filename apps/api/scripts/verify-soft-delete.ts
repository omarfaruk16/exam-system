/**
 * Proof that soft-delete is enforced by the extension, not by per-query filters.
 * Run: pnpm --filter @exam/api exec tsx scripts/verify-soft-delete.ts
 */
process.loadEnvFile('.env');
import { PrismaClient } from '@prisma/client';
import { softDeleteExtension } from '../src/common/prisma/soft-delete.extension';

const base = new PrismaClient();
const db = base.$extends(softDeleteExtension);

async function main(): Promise<void> {
  // clean any leftover from a previous run (hard delete via base client)
  await base.faculty.deleteMany({ where: { code: 'ZZTMP' } });

  const created = await db.faculty.create({ data: { name: 'Temp Faculty', code: 'ZZTMP' } });
  const before = await db.faculty.findMany({ where: { code: 'ZZTMP' } });
  console.log(`1. after create   -> db.findMany sees ${before.length} (expect 1)`);

  await db.faculty.delete({ where: { id: created.id } }); // extension => soft delete

  const afterDb = await db.faculty.findMany({ where: { code: 'ZZTMP' } });
  console.log(`2. after delete   -> db.findMany sees ${afterDb.length} (expect 0, filtered)`);

  const uniq = await db.faculty.findUnique({ where: { code: 'ZZTMP' } });
  console.log(`3. findUnique     -> ${uniq === null ? 'null' : 'ROW'} (expect null)`);

  const raw = await base.faculty.findMany({ where: { code: 'ZZTMP' } });
  console.log(
    `4. base (raw)     -> row still in DB: ${raw.length === 1}, deletedAt set: ${raw[0]?.deletedAt != null} (expect true/true — NOT hard-deleted)`,
  );

  await base.faculty.deleteMany({ where: { code: 'ZZTMP' } }); // cleanup
  console.log('5. cleanup done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => base.$disconnect());
