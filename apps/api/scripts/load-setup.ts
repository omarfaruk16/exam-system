/**
 * Seeds N student accounts (all enrolled in the CSE 2021 batch) and a FRESH live exam with 5 MCQs
 * for the k6 load test. Prints EXAM_ID for the k6 run. Re-runnable (students idempotent; new exam
 * each run so there are no leftover attempts).
 *   pnpm --filter @exam/api exec tsx scripts/load-setup.ts 300
 */
process.loadEnvFile('.env');
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const N = Number(process.argv[2] ?? 300);

async function main(): Promise<void> {
  const hash = await argon2.hash('Load@12345', {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const studentRole = await prisma.role.findFirstOrThrow({ where: { name: 'student' } });
  const cseBatch = await prisma.batch.findFirstOrThrow({
    where: { name: '2021 Batch', program: { department: { code: 'CSE' } } },
    select: { id: true },
  });

  const usernames = Array.from({ length: N }, (_, i) => `loadstudent${i + 1}`);
  await prisma.user.createMany({
    data: usernames.map((u, i) => ({
      username: u,
      email: `${u}@load.ru.ac.bd`,
      passwordHash: hash, // same hash for all — same password, fine for a load test
      displayName: `Load Student ${i + 1}`,
      mustChangePassword: false,
    })),
    skipDuplicates: true,
  });
  const users = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true, username: true },
  });
  await prisma.student.createMany({
    data: users.map((u) => ({
      userId: u.id,
      studentId: `LOAD-${u.username.replace('loadstudent', '')}`,
      batchId: cseBatch.id,
    })),
    skipDuplicates: true,
  });
  await prisma.userRole.createMany({
    data: users.map((u) => ({ userId: u.id, roleId: studentRole.id })),
    skipDuplicates: true,
  });

  const partA = await prisma.offeringPart.findFirstOrThrow({
    where: { offering: { course: { code: 'CSE-1101' } }, coursePart: { name: 'Part A' } },
    select: { id: true, assignedTeacherId: true },
  });

  const bank = await prisma.questionBank.create({
    data: {
      offeringPartId: partA.id,
      name: `Load Bank ${Date.now()}`,
      createdByTeacherId: partA.assignedTeacherId,
    },
  });
  const exam = await prisma.exam.create({
    data: {
      offeringPartId: partA.id,
      createdByTeacherId: partA.assignedTeacherId!,
      title: `LOAD TEST ${Date.now()}`,
      startAt: new Date(Date.now() - 60_000),
      endAt: new Date(Date.now() + 2 * 3600 * 1000),
      durationMinutes: 120,
      status: 'live',
      totalMarks: 5,
      publishedAt: new Date(),
      settings: {
        showMarksAfterSubmit: true,
        showExplanation: false,
        shuffleQuestions: false,
        shuffleOptions: false,
        negativeMarking: false,
        negativeMarkValue: 0,
      },
    },
    select: { id: true, publicId: true },
  });
  for (let i = 0; i < 5; i++) {
    const q = await prisma.question.create({
      data: { bankId: bank.id, type: 'mcq', text: `Load Q${i + 1}`, marks: 1 },
    });
    const optA = await prisma.questionOption.create({
      data: { questionId: q.id, text: 'A', isCorrect: true, order: 0 },
    });
    const optB = await prisma.questionOption.create({
      data: { questionId: q.id, text: 'B', isCorrect: false, order: 1 },
    });
    await prisma.examQuestion.create({
      data: {
        examId: exam.id,
        questionId: q.id,
        order: i + 1,
        snapshotAt: new Date(),
        snapshotType: 'mcq',
        snapshotText: `Load Q${i + 1}`,
        snapshotMarks: 1,
        snapshotOptions: [
          { id: optA.publicId, text: 'A', order: 0 },
          { id: optB.publicId, text: 'B', order: 1 },
        ],
        snapshotCorrectOptionId: optA.publicId,
      },
    });
  }

  console.log(`EXAM_ID=${exam.publicId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
