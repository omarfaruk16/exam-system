/**
 * Phase 3 integration tests against the real (seeded) dev DB. Behaviour, not claims:
 *   (a) teacher cannot create an exam against a soft-deleted OfferingPart;
 *   (b) bank edit rejected if the question is in a published/live exam;
 *   (c) question snapshot survives a later bank edit;
 *   (d) invalid state transition (draft → published) is rejected;
 *   (e) a teacher cannot submit/author a part they are not assigned to;
 *   (f) automatic live→ended fires for a past endAt.
 */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, type Job } from 'bullmq';
import ExcelJS from 'exceljs';
import IORedis, { type Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessControlService } from '../src/common/access/access-control.service';
import type { Env } from '../src/common/config/env.validation';
import { PrismaService } from '../src/common/prisma/prisma.service';
import type { AuthUser } from '../src/common/types/auth';
import { AuditService } from '../src/modules/audit/audit.service';
import { AttemptFinalizeService } from '../src/modules/attempt/attempt-finalize.service';
import { AttemptRedisService } from '../src/modules/attempt/attempt.redis';
import { ExamAccessService } from '../src/modules/exam/exam-access.service';
import { ExamSchedulerService } from '../src/modules/exam/exam-scheduler.service';
import { ExamService } from '../src/modules/exam/exam.service';
import {
  QuestionImportProcessor,
  type QuestionImportJobData,
} from '../src/modules/exam/question-import.processor';
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
    avatarUrl: null,
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
  redisClient = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  resultsQueue = new Queue('results', { connection: redisClient });
  const attemptRedis = new AttemptRedisService(redisClient);
  const gradingQueue = new Queue('grading', { connection: redisClient });
  const finalize = new AttemptFinalizeService(prisma, attemptRedis, audit, gradingQueue);
  exams = new ExamService(prisma, audit, access, finalize, attemptRedis);
  questions = new QuestionService(prisma, audit, access);
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

  // ── Feature: split MCQ / short-question import (question-bank) ──
  async function runImport(
    bankId: number,
    kind: 'mcq' | 'written',
    build: (wb: ExcelJS.Workbook) => void,
  ) {
    const wb = new ExcelJS.Workbook();
    build(wb);
    const dir = await mkdtemp(join(tmpdir(), 'qimport-'));
    const filePath = join(dir, `${kind}.xlsx`);
    await wb.xlsx.writeFile(filePath);
    const processor = new QuestionImportProcessor(prisma, {
      getOrThrow: () => dir,
    } as unknown as ConfigService<Env, true>);
    const job = {
      data: { filePath, originalName: `${kind}.xlsx`, bankId, uploadedByUserId: teacher1.id, kind },
      id: `job-${kind}-${Date.now()}`,
      updateProgress: async () => undefined,
    } as unknown as Job<QuestionImportJobData>;
    return processor.process(job);
  }

  it('(g) MCQ-scoped import reads only the MCQ sheet, ignoring a Written sheet in the same file', async () => {
    const bank = await questions.createBank(teacher1, 'test', {
      coursePartPublicId: csePartAPublicId,
      name: `Import MCQ ${Date.now()}-${Math.random()}`,
    });
    const bankRow = await prisma.db.questionBank.findFirstOrThrow({
      where: { publicId: bank.publicId },
      select: { id: true },
    });

    const summary = await runImport(bankRow.id, 'mcq', (wb) => {
      const mcq = wb.addWorksheet('MCQ');
      mcq.addRow(['question', 'marks', 'optionA', 'optionB', 'correct', 'explanation']);
      mcq.addRow(['What is 2+2?', 1, '4', '5', 'A', 'basic arithmetic']);
      const written = wb.addWorksheet('Written');
      written.addRow(['question', 'marks', 'modelAnswer']);
      written.addRow(['Explain gravity', 5, 'A force of attraction']);
    });

    expect(summary.imported).toBe(1);
    const created = await prisma.db.question.findMany({
      where: { bankId: bankRow.id, deletedAt: null },
      select: { type: true },
    });
    expect(created).toHaveLength(1);
    expect(created[0]!.type).toBe('mcq');
  });

  it('(h) short-question import falls back to the first sheet when no "Written" sheet exists', async () => {
    const bank = await questions.createBank(teacher1, 'test', {
      coursePartPublicId: csePartAPublicId,
      name: `Import Written ${Date.now()}-${Math.random()}`,
    });
    const bankRow = await prisma.db.questionBank.findFirstOrThrow({
      where: { publicId: bank.publicId },
      select: { id: true },
    });

    const summary = await runImport(bankRow.id, 'written', (wb) => {
      // A plain single-sheet upload (arbitrary sheet name) still imports as short questions.
      const ws = wb.addWorksheet('Sheet1');
      ws.addRow(['question', 'marks', 'modelAnswer']);
      ws.addRow(['Define osmosis', 4, 'Movement of water across a membrane']);
      ws.addRow(['State Newton’s first law', 3, 'An object stays at rest…']);
    });

    expect(summary.imported).toBe(2);
    const created = await prisma.db.question.findMany({
      where: { bankId: bankRow.id, deletedAt: null },
      select: { type: true },
    });
    expect(created).toHaveLength(2);
    expect(created.every((q) => q.type === 'written')).toBe(true);
  });

  // ── Feature: one question bank shared across sessions/years of the same course part ──
  it('(i) the bank is shared across sessions of the same course part, and the list shows it once', async () => {
    const t1 = await prisma.db.teacher.findFirstOrThrow({
      where: { user: { username: 'teacher1' } },
      select: { id: true },
    });
    const partA = await prisma.db.coursePart.findFirstOrThrow({
      where: { publicId: csePartAPublicId },
      select: {
        name: true,
        course: {
          select: {
            code: true,
            name: true,
            credit: true,
            semester: { select: { batch: { select: { programId: true } } } },
          },
        },
      },
    });
    const programId = partA.course.semester.batch.programId;

    // A second session/year of the SAME course + section (a fresh batch → semester → course →
    // part), assigned to the same teacher.
    const batch = await prisma.batch.create({
      data: { programId, name: `TmpBatch ${Date.now()}-${Math.random()}`, year: 1990 },
      select: { id: true },
    });
    const semester = await prisma.semester.create({
      data: { batchId: batch.id, number: 1, name: 'Tmp Semester' },
      select: { id: true },
    });
    const course = await prisma.course.create({
      data: {
        semesterId: semester.id,
        code: partA.course.code,
        name: partA.course.name,
        credit: partA.course.credit,
      },
      select: { id: true },
    });
    const session2 = await prisma.coursePart.create({
      data: { courseId: course.id, name: partA.name, marksWeight: 0, assignedTeacherId: t1.id },
      select: { id: true, publicId: true },
    });

    // A bank + question created under session 1…
    const bank = await questions.createBank(teacher1, 'test', {
      coursePartPublicId: csePartAPublicId,
      name: `Shared Bank ${Date.now()}-${Math.random()}`,
    });
    const q = await questions.createQuestion(teacher1, 'test', {
      bankPublicId: bank.publicId,
      type: 'written',
      text: 'Shared across sessions?',
      marks: 2,
    });
    const bankRow = await prisma.db.questionBank.findFirstOrThrow({
      where: { publicId: bank.publicId },
      select: { id: true },
    });

    try {
      // …is visible when browsing session 2's bank (shared across sessions).
      const banksViaSession2 = await questions.listBanks(teacher1, session2.publicId);
      expect(banksViaSession2.some((b) => b.publicId === bank.publicId)).toBe(true);
      const qsViaSession2 = await questions.listQuestionsByPart(teacher1, session2.publicId);
      expect(qsViaSession2.some((x) => x.publicId === q.publicId)).toBe(true);

      // …and the authoring list shows this course + section exactly once (no per-session dupes).
      const authorable = await exams.listAuthorableParts(teacher1);
      const same = authorable.filter(
        (p) => p.courseCode === partA.course.code && p.partName === partA.name,
      );
      expect(same).toHaveLength(1);
    } finally {
      await prisma.questionOption.deleteMany({ where: { question: { bankId: bankRow.id } } });
      await prisma.question.deleteMany({ where: { bankId: bankRow.id } });
      await prisma.questionBank.delete({ where: { id: bankRow.id } });
      await prisma.coursePart.delete({ where: { id: session2.id } });
      await prisma.course.delete({ where: { id: course.id } });
      await prisma.semester.delete({ where: { id: semester.id } });
      await prisma.batch.delete({ where: { id: batch.id } });
    }
  });

  // ── Feature: a bank question can be deleted (unless locked into a published/live exam) ──
  it('(j) deleteQuestion soft-deletes a bank question and drops it from the list', async () => {
    const bank = await questions.createBank(teacher1, 'test', {
      coursePartPublicId: csePartAPublicId,
      name: `Del Bank ${Date.now()}-${Math.random()}`,
    });
    const q = await questions.createQuestion(teacher1, 'test', {
      bankPublicId: bank.publicId,
      type: 'written',
      text: 'To be deleted',
      marks: 1,
    });

    await questions.deleteQuestion(teacher1, 'test', q.publicId);

    const remaining = await questions.listQuestions(teacher1, bank.publicId);
    expect(remaining.some((x) => x.publicId === q.publicId)).toBe(false);
    // Deleting again is a clean 404 (already gone), never a silent success.
    await expect(questions.deleteQuestion(teacher1, 'test', q.publicId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
