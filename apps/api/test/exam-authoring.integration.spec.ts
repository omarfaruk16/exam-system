/**
 * Phase 3 integration tests against the real (seeded) dev DB. Behaviour, not claims:
 *   (a) teacher cannot create an exam against a soft-deleted OfferingPart;
 *   (b) bank edit rejected if the question is in a published/live exam;
 *   (c) question snapshot survives a later bank edit;
 *   (d) invalid state transition (draft → published) is rejected;
 *   (e) a teacher cannot submit/author a part they are not assigned to;
 *   (f) automatic live→ended fires for a past endAt.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessControlService } from '../src/common/access/access-control.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import type { AuthUser } from '../src/common/types/auth';
import { AuditService } from '../src/modules/audit/audit.service';
import { ExamAccessService } from '../src/modules/exam/exam-access.service';
import { ExamSchedulerService } from '../src/modules/exam/exam-scheduler.service';
import { ExamService } from '../src/modules/exam/exam.service';
import { QuestionService } from '../src/modules/exam/question.service';

let prisma: PrismaService;
let exams: ExamService;
let questions: QuestionService;
let scheduler: ExamSchedulerService;
let redisClient: Redis;
let resultsQueue: Queue;

let teacher1: AuthUser; // assigned to CSE Part A
let teacher2: AuthUser; // assigned to CSE Part B, NOT Part A
let admin: AuthUser;
let csePartAPublicId: string;

function principal(over: Partial<AuthUser> & Pick<AuthUser, 'id' | 'roles'>): AuthUser {
  return {
    publicId: 'p',
    username: 'u',
    email: null,
    displayName: 'U',
    status: 'active',
    mustChangePassword: false,
    twoFactorEnabled: false,
    ...over,
  };
}

const settings = {
  showMarksAfterSubmit: true,
  showExplanation: true,
  shuffleQuestions: false,
  shuffleOptions: false,
  negativeMarking: false,
  negativeMarkValue: 0,
};

beforeAll(async () => {
  process.loadEnvFile('.env');
  prisma = new PrismaService();
  await prisma.onModuleInit();
  const audit = new AuditService(prisma);
  const access = new ExamAccessService(prisma, new AccessControlService());
  exams = new ExamService(prisma, audit, access);
  questions = new QuestionService(prisma, audit, access);
  redisClient = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  resultsQueue = new Queue('results', { connection: redisClient });
  scheduler = new ExamSchedulerService(prisma, audit, resultsQueue);

  const t1 = await prisma.db.user.findFirstOrThrow({
    where: { username: 'teacher1' },
    select: { id: true },
  });
  const t2 = await prisma.db.user.findFirstOrThrow({
    where: { username: 'teacher2' },
    select: { id: true },
  });
  const ad = await prisma.db.user.findFirstOrThrow({
    where: { username: 'admin' },
    select: { id: true },
  });
  teacher1 = principal({
    id: t1.id,
    roles: [{ role: 'teacher', scopeFacultyId: null, scopeDepartmentId: null }],
  });
  teacher2 = principal({
    id: t2.id,
    roles: [{ role: 'teacher', scopeFacultyId: null, scopeDepartmentId: null }],
  });
  admin = principal({
    id: ad.id,
    roles: [{ role: 'admin', scopeFacultyId: null, scopeDepartmentId: null }],
  });

  const partA = await prisma.db.coursePart.findFirstOrThrow({
    where: { course: { code: 'CSE-1101' }, name: 'Part A' },
    select: { publicId: true },
  });
  csePartAPublicId = partA.publicId;
});

afterAll(async () => {
  await resultsQueue?.close();
  redisClient?.disconnect();
  await prisma?.onModuleDestroy();
});

async function buildDraftExamWithQuestion(startAt: Date, endAt: Date) {
  // A dedicated bank + one MCQ so the exam is publishable.
  const bank = await questions.createBank(teacher1, 'test', {
    coursePartPublicId: csePartAPublicId,
    name: `Test Bank ${Date.now()}-${Math.random()}`,
  });
  const q = await questions.createQuestion(teacher1, 'test', {
    bankPublicId: bank.publicId,
    type: 'mcq',
    text: 'Snapshot original text',
    marks: 4,
    options: [
      { text: 'A', isCorrect: true, order: 0 },
      { text: 'B', isCorrect: false, order: 1 },
    ],
  });
  const exam = await exams.createExam(teacher1, 'test', {
    coursePartPublicId: csePartAPublicId,
    title: `Test Exam ${Date.now()}-${Math.random()}`,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    durationMinutes: 30,
    settings,
  });
  await exams.addQuestion(teacher1, 'test', exam.publicId, {
    questionPublicId: q.publicId,
    order: 1,
  });
  return { exam, question: q };
}

describe('Phase 3 — exam authoring guards & lifecycle', () => {
  it('(a) teacher cannot create an exam against a soft-deleted course part', async () => {
    // A fresh course part assigned to teacher1 that we can safely soft-delete.
    const t1 = await prisma.db.teacher.findFirstOrThrow({
      where: { user: { username: 'teacher1' } },
      select: { id: true },
    });
    const course = await prisma.db.course.findFirstOrThrow({
      where: { code: 'CSE-1101' },
      select: { id: true },
    });
    const cp = await prisma.coursePart.create({
      data: {
        courseId: course.id,
        name: `Tmp ${Date.now()}`,
        marksWeight: 0,
        assignedTeacherId: t1.id,
        deletedAt: new Date(),
      },
    });

    await expect(
      exams.createExam(teacher1, 'test', {
        coursePartPublicId: cp.publicId,
        title: 'Should fail',
        startAt: new Date(Date.now() + 3_600_000).toISOString(),
        endAt: new Date(Date.now() + 7_200_000).toISOString(),
        durationMinutes: 30,
        settings,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // cleanup
    await prisma.coursePart.delete({ where: { id: cp.id } });
  });

  it('(e) a teacher cannot author/submit a part they are not assigned to', async () => {
    // teacher2 is NOT assigned to Part A.
    await expect(
      exams.createExam(teacher2, 'test', {
        coursePartPublicId: csePartAPublicId,
        title: 'Not yours',
        startAt: new Date(Date.now() + 3_600_000).toISOString(),
        endAt: new Date(Date.now() + 7_200_000).toISOString(),
        durationMinutes: 30,
        settings,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // And cannot submit teacher1's exam.
    const { exam } = await buildDraftExamWithQuestion(
      new Date(Date.now() + 3_600_000),
      new Date(Date.now() + 7_200_000),
    );
    await expect(exams.submit(teacher2, 'test', exam.publicId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('(d) an invalid transition (draft → published) is rejected with 400', async () => {
    const { exam } = await buildDraftExamWithQuestion(
      new Date(Date.now() + 3_600_000),
      new Date(Date.now() + 7_200_000),
    );
    await expect(exams.publish(admin, 'test', exam.publicId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('(b+c) snapshot on publish is immutable; bank edit is then rejected', async () => {
    const { exam, question } = await buildDraftExamWithQuestion(
      new Date(Date.now() + 3_600_000),
      new Date(Date.now() + 7_200_000),
    );
    await exams.submit(teacher1, 'test', exam.publicId);
    await exams.approve(admin, 'test', exam.publicId);
    await exams.publish(admin, 'test', exam.publicId);

    // (b) editing a question used in a published exam is rejected
    await expect(
      questions.updateQuestion(teacher1, 'test', question.publicId, { text: 'HACKED' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Force-change the bank row directly to prove the snapshot is independent.
    await prisma.question.update({
      where: { publicId: question.publicId },
      data: { text: 'CHANGED IN BANK' },
    });

    // (c) the exam still serves the original snapshot
    const eqs = await exams.getExamQuestions(teacher1, exam.publicId);
    expect(eqs[0]?.snapshotText).toBe('Snapshot original text');
    expect(eqs[0]?.snapshotAt).not.toBeNull();
  });

  it('(f) automatic transition ends an exam whose window has closed', async () => {
    // Publish an exam whose window is entirely in the past.
    const { exam } = await buildDraftExamWithQuestion(
      new Date(Date.now() - 7_200_000),
      new Date(Date.now() - 3_600_000),
    );
    await exams.submit(teacher1, 'test', exam.publicId);
    await exams.approve(admin, 'test', exam.publicId);
    await exams.publish(admin, 'test', exam.publicId);

    const swept = await scheduler.runSweep(new Date());
    expect(swept.toLive + swept.toEnded).toBeGreaterThan(0);

    const after = await prisma.db.exam.findFirstOrThrow({
      where: { publicId: exam.publicId },
      select: { status: true },
    });
    expect(after.status).toBe('ended');
  });
});
