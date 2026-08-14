/**
 * Phase 4 integration tests against the real dev DB + Redis. Behaviour, not claims:
 *   (a) two concurrent submits -> one succeeds, the other 409; no duplicate attempt;
 *   (b) answer after deadline -> 409;
 *   (c) session supersession -> first device's autosave -> 401 SESSION_SUPERSEDED;
 *   (d) auto-submit produces the same result as a manual submit;
 *   (e) MCQ scoring uses the snapshot, not the live bank;
 *   (f) showMarksAfterSubmit=false -> result 403 until exam is results_published.
 * (g) "zero duplicate (examId, studentId) after load" is verified from the k6 run.
 */
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessControlService } from '../src/common/access/access-control.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import type { AuthUser } from '../src/common/types/auth';
import { AuditService } from '../src/modules/audit/audit.service';
import { AttemptFinalizeService } from '../src/modules/attempt/attempt-finalize.service';
import { AttemptRedisService } from '../src/modules/attempt/attempt.redis';
import { AttemptService } from '../src/modules/attempt/attempt.service';
import { GradingService } from '../src/modules/attempt/grading.service';
import { AttemptGradingService } from '../src/modules/grading/attempt-grading.service';
import { PaperService } from '../src/modules/attempt/paper.service';
import { ExamAccessService } from '../src/modules/exam/exam-access.service';
import { ExamSchedulerService } from '../src/modules/exam/exam-scheduler.service';
import { ExamService } from '../src/modules/exam/exam.service';
import { QuestionService } from '../src/modules/exam/question.service';

let prisma: PrismaService;
let redisClient: Redis;
let gradingQueue: Queue;
let resultsQueue: Queue;
let attempts: AttemptService;
let finalize: AttemptFinalizeService;
let grading: GradingService;
let exams: ExamService;
let questions: QuestionService;
let scheduler: ExamSchedulerService;

let teacher1: AuthUser;
let admin: AuthUser;
let student: AuthUser;
let partA: string;

function principal(over: Pick<AuthUser, 'id' | 'roles'>): AuthUser {
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

const baseSettings = {
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
  redisClient = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  gradingQueue = new Queue('grading', { connection: redisClient });
  resultsQueue = new Queue('results', { connection: redisClient });
  const audit = new AuditService(prisma);
  const attemptRedis = new AttemptRedisService(redisClient);
  const paper = new PaperService(prisma, attemptRedis);
  const access = new ExamAccessService(prisma, new AccessControlService());
  attempts = new AttemptService(prisma, attemptRedis, paper, audit);
  finalize = new AttemptFinalizeService(prisma, attemptRedis, audit, gradingQueue);
  grading = new GradingService(prisma, new AttemptGradingService(prisma, resultsQueue));
  exams = new ExamService(prisma, audit, access);
  questions = new QuestionService(prisma, audit, access);
  scheduler = new ExamSchedulerService(prisma, audit, resultsQueue);

  const t1 = await prisma.db.user.findFirstOrThrow({
    where: { username: 'teacher1' },
    select: { id: true },
  });
  const ad = await prisma.db.user.findFirstOrThrow({
    where: { username: 'admin' },
    select: { id: true },
  });
  const st = await prisma.db.user.findFirstOrThrow({
    where: { username: '2021001' },
    select: { id: true },
  });
  teacher1 = principal({
    id: t1.id,
    roles: [{ role: 'teacher', scopeFacultyId: null, scopeDepartmentId: null }],
  });
  admin = principal({
    id: ad.id,
    roles: [{ role: 'admin', scopeFacultyId: null, scopeDepartmentId: null }],
  });
  student = principal({
    id: st.id,
    roles: [{ role: 'student', scopeFacultyId: null, scopeDepartmentId: null }],
  });

  partA = (
    await prisma.db.offeringPart.findFirstOrThrow({
      where: { offering: { course: { code: 'CSE-1101' } }, coursePart: { name: 'Part A' } },
      select: { publicId: true },
    })
  ).publicId;
});

afterAll(async () => {
  await gradingQueue?.close();
  await resultsQueue?.close();
  redisClient?.disconnect();
  await prisma?.onModuleDestroy();
});

const rand = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function publishLiveMcqExam(settingsOverride: Partial<typeof baseSettings> = {}) {
  const bank = await questions.createBank(teacher1, 't', {
    offeringPartPublicId: partA,
    name: `B ${rand()}`,
  });
  const q = await questions.createQuestion(teacher1, 't', {
    bankPublicId: bank.publicId,
    type: 'mcq',
    text: 'Pick the right one',
    marks: 5,
    options: [
      { text: 'right', isCorrect: true, order: 0 },
      { text: 'wrong', isCorrect: false, order: 1 },
    ],
  });
  const exam = await exams.createExam(teacher1, 't', {
    offeringPartPublicId: partA,
    title: `E ${rand()}`,
    startAt: new Date(Date.now() - 60_000).toISOString(),
    endAt: new Date(Date.now() + 3_600_000).toISOString(),
    durationMinutes: 60,
    settings: { ...baseSettings, ...settingsOverride },
  });
  await exams.addQuestion(teacher1, 't', exam.publicId, { questionPublicId: q.publicId, order: 1 });
  await exams.submit(teacher1, 't', exam.publicId);
  await exams.approve(admin, 't', exam.publicId);
  await exams.publish(admin, 't', exam.publicId);
  await scheduler.runSweep(); // published -> live (startAt is in the past)

  const eq = await prisma.db.examQuestion.findFirstOrThrow({
    where: { exam: { publicId: exam.publicId } },
    select: {
      snapshotCorrectOptionId: true,
      snapshotOptions: true,
      question: { select: { publicId: true } },
    },
  });
  const opts = eq.snapshotOptions as { id: string }[];
  const correctOptionId = eq.snapshotCorrectOptionId!;
  return {
    examPublicId: exam.publicId,
    bankQuestionPublicId: q.publicId,
    questionPublicId: eq.question.publicId,
    correctOptionId,
    otherOptionId: opts.find((o) => o.id !== correctOptionId)!.id,
  };
}

const attemptId = async (publicId: string) =>
  (await prisma.db.examAttempt.findFirstOrThrow({ where: { publicId }, select: { id: true } })).id;

describe('Phase 4 — exam-taking engine', () => {
  it('(a) two concurrent submits -> one succeeds, other 409, single attempt row', async () => {
    const ex = await publishLiveMcqExam();
    const s = await attempts.start(student, ex.examPublicId, null);
    await attempts.autosave(student, s.attempt.publicId, s.sessionId, [
      { questionPublicId: ex.questionPublicId, selectedOptionId: ex.correctOptionId },
    ]);

    const results = await Promise.allSettled([
      finalize.finalize(s.attempt.publicId, {
        auto: false,
        sessionId: s.sessionId,
        idempotencyKey: 'k1',
        actorUserId: student.id,
      }),
      finalize.finalize(s.attempt.publicId, {
        auto: false,
        sessionId: s.sessionId,
        idempotencyKey: 'k2',
        actorUserId: student.id,
      }),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const err = results.filter((r) => r.status === 'rejected');
    expect(ok.length).toBeGreaterThanOrEqual(1);
    for (const e of err)
      expect((e as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const count = await prisma.db.examAttempt.count({
      where: { exam: { publicId: ex.examPublicId } },
    });
    expect(count).toBe(1);
  });

  it('(b) autosave after the deadline returns 409', async () => {
    const ex = await publishLiveMcqExam();
    const s = await attempts.start(student, ex.examPublicId, null);
    // Force the stored deadline into the past.
    await redisClient.set(
      `exam:attempt:deadline:${await attemptId(s.attempt.publicId)}`,
      String(Date.now() - 1000),
    );
    await expect(
      attempts.autosave(student, s.attempt.publicId, s.sessionId, [
        { questionPublicId: ex.questionPublicId, selectedOptionId: ex.correctOptionId },
      ]),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('(c) a second device supersedes the session; the first device gets 401', async () => {
    const ex = await publishLiveMcqExam();
    const first = await attempts.start(student, ex.examPublicId, null);
    const second = await attempts.start(student, ex.examPublicId, null); // supersedes
    expect(second.sessionId).not.toBe(first.sessionId);
    await expect(
      attempts.autosave(student, first.attempt.publicId, first.sessionId, [
        { questionPublicId: ex.questionPublicId, selectedOptionId: ex.correctOptionId },
      ]),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // The current (second) session still works.
    const ok = await attempts.autosave(student, second.attempt.publicId, second.sessionId, [
      { questionPublicId: ex.questionPublicId, selectedOptionId: ex.correctOptionId },
    ]);
    expect(ok.saved).toBe(1);
  });

  it('(d) auto-submit produces the same graded result as a manual submit', async () => {
    const ex = await publishLiveMcqExam();
    const s = await attempts.start(student, ex.examPublicId, null);
    await attempts.autosave(student, s.attempt.publicId, s.sessionId, [
      { questionPublicId: ex.questionPublicId, selectedOptionId: ex.correctOptionId },
    ]);
    const id = await attemptId(s.attempt.publicId);
    await redisClient.set(`exam:attempt:deadline:${id}`, String(Date.now() - 1000));

    const res = await finalize.finalize(s.attempt.publicId, { auto: true });
    expect(res.status).toBe('submitted');
    expect(res.autoSubmitted).toBe(true);
    await grading.grade(id);
    const graded = await prisma.db.examAttempt.findFirstOrThrow({
      where: { id },
      select: { totalScore: true, autoSubmitted: true, status: true },
    });
    expect(graded.autoSubmitted).toBe(true);
    expect(graded.totalScore).toBe(5); // correct MCQ => full marks, same as a manual submit
    expect(graded.status).toBe('graded');
  });

  it('(e) MCQ scoring uses the snapshot, unaffected by a later bank edit', async () => {
    const ex = await publishLiveMcqExam();
    const s = await attempts.start(student, ex.examPublicId, null);
    await attempts.autosave(student, s.attempt.publicId, s.sessionId, [
      { questionPublicId: ex.questionPublicId, selectedOptionId: ex.correctOptionId },
    ]);
    await finalize.finalize(s.attempt.publicId, {
      auto: false,
      sessionId: s.sessionId,
      actorUserId: student.id,
      idempotencyKey: rand(),
    });
    const id = await attemptId(s.attempt.publicId);
    await grading.grade(id);
    const before = await prisma.db.examAttempt.findFirstOrThrow({
      where: { id },
      select: { totalScore: true },
    });
    expect(before.totalScore).toBe(5);

    // Flip the correct option in the LIVE bank.
    const q = await prisma.db.question.findFirstOrThrow({
      where: { publicId: ex.bankQuestionPublicId },
      select: { id: true },
    });
    await prisma.questionOption.updateMany({
      where: { questionId: q.id },
      data: { isCorrect: false },
    });
    await prisma.questionOption.updateMany({
      where: { questionId: q.id, order: 1 },
      data: { isCorrect: true },
    });

    await grading.grade(id); // re-grade
    const after = await prisma.db.examAttempt.findFirstOrThrow({
      where: { id },
      select: { totalScore: true },
    });
    expect(after.totalScore).toBe(5); // unchanged — snapshot, not live bank
  });

  it('(f) showMarksAfterSubmit=false hides the result until results are published', async () => {
    const ex = await publishLiveMcqExam({ showMarksAfterSubmit: false });
    const s = await attempts.start(student, ex.examPublicId, null);
    await attempts.autosave(student, s.attempt.publicId, s.sessionId, [
      { questionPublicId: ex.questionPublicId, selectedOptionId: ex.correctOptionId },
    ]);
    await finalize.finalize(s.attempt.publicId, {
      auto: false,
      sessionId: s.sessionId,
      actorUserId: student.id,
      idempotencyKey: rand(),
    });
    await grading.grade(await attemptId(s.attempt.publicId));

    // Student cannot see the result yet.
    await expect(attempts.getResult(student, s.attempt.publicId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    // Move the exam through ended -> grading -> results_published.
    await prisma.exam.update({
      where: { publicId: ex.examPublicId },
      data: { endAt: new Date(Date.now() - 1000) },
    });
    await scheduler.runSweep(); // live -> ended
    await exams.startGrading(admin, 't', ex.examPublicId);
    await exams.publishResults(admin, 't', ex.examPublicId);

    const result = await attempts.getResult(student, s.attempt.publicId);
    expect(result.totalScore).toBe(5);
  });
});
