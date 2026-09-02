/**
 * Phase 5a integration tests (real DB + Redis). Behaviour, not claims:
 *   (a) manualScore above snapshotMarks -> 400;
 *   (b) grading all written answers finalizes ExamResult and auto-publishes results;
 *   (c) dense rank (with a tie) computed by the SQL window function;
 *   (d) overall mark sheet includes enrolled-but-absent students with zeros;
 *   (e) individual mark sheet shows the SNAPSHOT question text after a bank edit;
 *   (f) report request -> 403 when the exam is not results_published;
 *   (g) MCQ-only exam auto-publishes results after auto-grade + window end.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessControlService } from '../src/common/access/access-control.service';
import type { Env } from '../src/common/config/env.validation';
import { PrismaService } from '../src/common/prisma/prisma.service';
import type { AuthUser } from '../src/common/types/auth';
import { AuditService } from '../src/modules/audit/audit.service';
import { AttemptFinalizeService } from '../src/modules/attempt/attempt-finalize.service';
import { AttemptRedisService } from '../src/modules/attempt/attempt.redis';
import { AttemptService } from '../src/modules/attempt/attempt.service';
import { GradingService } from '../src/modules/attempt/grading.service';
import { PaperService } from '../src/modules/attempt/paper.service';
import { ExamAccessService } from '../src/modules/exam/exam-access.service';
import { ExamSchedulerService } from '../src/modules/exam/exam-scheduler.service';
import { ExamService } from '../src/modules/exam/exam.service';
import { QuestionService } from '../src/modules/exam/question.service';
import { AttemptGradingService } from '../src/modules/grading/attempt-grading.service';
import { ResultsService } from '../src/modules/grading/results.service';
import { WrittenGradingService } from '../src/modules/grading/written-grading.service';
import { ReportDataService } from '../src/modules/report/report-data.service';
import { ReportService } from '../src/modules/report/report.service';

let prisma: PrismaService;
let redis: Redis;
let gradingQueue: Queue;
let resultsQueue: Queue;
let reportQueue: Queue;
let exams: ExamService;
let questions: QuestionService;
let scheduler: ExamSchedulerService;
let attempts: AttemptService;
let finalize: AttemptFinalizeService;
let grading: GradingService;
let written: WrittenGradingService;
let results: ResultsService;
let reportData: ReportDataService;
let reportService: ReportService;

let teacher1: AuthUser;
let admin: AuthUser;
let student: AuthUser;
let studentPublicId: string;
let partA: string;
let partAId: number;
let teacher1Id: number;
let cseBatchId: number;

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
const rand = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  gradingQueue = new Queue('grading', { connection: redis });
  resultsQueue = new Queue('results', { connection: redis });
  reportQueue = new Queue('report', { connection: redis });

  const audit = new AuditService(prisma);
  const access = new ExamAccessService(prisma, new AccessControlService());
  const attemptRedis = new AttemptRedisService(redis);
  const attemptGrading = new AttemptGradingService(prisma, resultsQueue);
  const config = {
    getOrThrow: (k: string) =>
      process.env[k] ?? 'dev_only_session_secret_change_me_please_0123456789abcdef',
  } as unknown as ConfigService<Env, true>;

  exams = new ExamService(prisma, audit, access);
  questions = new QuestionService(prisma, audit, access);
  scheduler = new ExamSchedulerService(prisma, audit, resultsQueue);
  attempts = new AttemptService(
    prisma,
    attemptRedis,
    new PaperService(prisma, attemptRedis),
    audit,
  );
  finalize = new AttemptFinalizeService(prisma, attemptRedis, audit, gradingQueue);
  grading = new GradingService(prisma, attemptGrading);
  written = new WrittenGradingService(prisma, audit, access, attemptGrading);
  results = new ResultsService(prisma, audit);
  reportData = new ReportDataService(prisma, config);
  reportService = new ReportService(reportQueue, prisma, access, config, redis);

  const t1u = await prisma.db.user.findFirstOrThrow({
    where: { username: 'teacher1' },
    select: { id: true },
  });
  const adu = await prisma.db.user.findFirstOrThrow({
    where: { username: 'admin' },
    select: { id: true },
  });
  const stu = await prisma.db.student.findFirstOrThrow({
    where: { studentId: '2021001' },
    select: { userId: true, publicId: true },
  });
  teacher1 = principal({
    id: t1u.id,
    roles: [{ role: 'teacher', scopeFacultyId: null, scopeDepartmentId: null }],
  });
  admin = principal({
    id: adu.id,
    roles: [{ role: 'admin', scopeFacultyId: null, scopeDepartmentId: null }],
  });
  student = principal({
    id: stu.userId,
    roles: [{ role: 'student', scopeFacultyId: null, scopeDepartmentId: null }],
  });
  studentPublicId = stu.publicId;

  const p = await prisma.db.coursePart.findFirstOrThrow({
    where: { course: { code: 'CSE-1101' }, name: 'Part A' },
    select: { id: true, publicId: true, assignedTeacherId: true },
  });
  partA = p.publicId;
  partAId = p.id;
  teacher1Id = p.assignedTeacherId!;
  const batch = await prisma.db.batch.findFirstOrThrow({
    where: {
      name: '2021 Batch',
      program: { department: { name: 'Computer Science & Engineering' } },
    },
    select: { id: true },
  });
  cseBatchId = batch.id;
});

afterAll(async () => {
  await gradingQueue?.close();
  await resultsQueue?.close();
  await reportQueue?.close();
  redis?.disconnect();
  await prisma?.onModuleDestroy();
});

const attemptId = async (publicId: string) =>
  (await prisma.db.examAttempt.findFirstOrThrow({ where: { publicId }, select: { id: true } })).id;

async function runResultsWorker(examId: number) {
  await results.rerank(examId);
  await results.maybePublishResults(examId);
}

async function publishLiveExam(
  withWritten: boolean,
  settingsOverride: Partial<typeof baseSettings> = {},
) {
  const bank = await questions.createBank(teacher1, 't', {
    coursePartPublicId: partA,
    name: `B ${rand()}`,
  });
  const mcq = await questions.createQuestion(teacher1, 't', {
    bankPublicId: bank.publicId,
    type: 'mcq',
    text: 'MCQ original text',
    marks: 3,
    options: [
      { text: 'right', isCorrect: true, order: 0 },
      { text: 'wrong', isCorrect: false, order: 1 },
    ],
  });
  let writtenQ: { publicId: string } | undefined;
  if (withWritten) {
    writtenQ = await questions.createQuestion(teacher1, 't', {
      bankPublicId: bank.publicId,
      type: 'written',
      text: 'Explain something',
      marks: 5,
      modelAnswer: 'model',
    });
  }
  const exam = await exams.createExam(teacher1, 't', {
    coursePartPublicId: partA,
    title: `E ${rand()}`,
    startAt: new Date(Date.now() - 60_000).toISOString(),
    endAt: new Date(Date.now() + 3_600_000).toISOString(),
    durationMinutes: 60,
    settings: { ...baseSettings, ...settingsOverride },
  });
  await exams.addQuestion(teacher1, 't', exam.publicId, {
    questionPublicId: mcq.publicId,
    order: 1,
  });
  if (writtenQ)
    await exams.addQuestion(teacher1, 't', exam.publicId, {
      questionPublicId: writtenQ.publicId,
      order: 2,
    });
  await exams.submit(teacher1, 't', exam.publicId);
  await exams.approve(admin, 't', exam.publicId);
  await exams.publish(admin, 't', exam.publicId);
  await scheduler.runSweep(); // -> live

  const eqMcq = await prisma.db.examQuestion.findFirstOrThrow({
    where: { exam: { publicId: exam.publicId }, snapshotType: 'mcq' },
    select: { snapshotCorrectOptionId: true, question: { select: { publicId: true } } },
  });
  const examRow = await prisma.db.exam.findFirstOrThrow({
    where: { publicId: exam.publicId },
    select: { id: true },
  });
  return {
    examPublicId: exam.publicId,
    examId: examRow.id,
    mcqBankPublicId: mcq.publicId,
    mcqQuestionPublicId: eqMcq.question.publicId,
    mcqCorrectOptionId: eqMcq.snapshotCorrectOptionId!,
    writtenQuestionPublicId: writtenQ?.publicId,
  };
}

async function endWindow(examId: number) {
  await prisma.exam.update({ where: { id: examId }, data: { endAt: new Date(Date.now() - 1000) } });
  await scheduler.runSweep(); // live -> ended
}

async function takeAndSubmit(
  ex: Awaited<ReturnType<typeof publishLiveExam>>,
  writtenText?: string,
) {
  const s = await attempts.start(student, ex.examPublicId, null);
  const answers: { questionPublicId: string; selectedOptionId?: string; writtenText?: string }[] = [
    { questionPublicId: ex.mcqQuestionPublicId, selectedOptionId: ex.mcqCorrectOptionId },
  ];
  if (ex.writtenQuestionPublicId)
    answers.push({
      questionPublicId: ex.writtenQuestionPublicId,
      writtenText: writtenText ?? 'my answer',
    });
  await attempts.autosave(student, s.attempt.publicId, s.sessionId, answers);
  await finalize.finalize(s.attempt.publicId, {
    auto: false,
    sessionId: s.sessionId,
    actorUserId: student.id,
    idempotencyKey: rand(),
  });
  const id = await attemptId(s.attempt.publicId);
  await grading.grade(id); // MCQ auto-grade + finalize (awaiting_manual if written)
  return { attemptPublicId: s.attempt.publicId, attemptId: id };
}

describe('Phase 5a — written grading & finalization', () => {
  it('(a) manualScore above snapshotMarks is rejected (400)', async () => {
    const ex = await publishLiveExam(true);
    await takeAndSubmit(ex);
    const pending = await written.getPending(teacher1, ex.examPublicId);
    const answerPublicId = pending[0]!.pending[0]!.answerPublicId;
    await expect(
      written.gradeWritten(teacher1, 't', answerPublicId, { manualScore: 6 }), // max is 5
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('(b) grading all written answers finalizes the result and auto-publishes', async () => {
    const ex = await publishLiveExam(true);
    const att = await takeAndSubmit(ex, 'a good answer');
    await endWindow(ex.examId);
    await runResultsWorker(ex.examId); // still awaiting manual -> no publish
    let exam = await prisma.db.exam.findFirstOrThrow({
      where: { id: ex.examId },
      select: { status: true },
    });
    expect(exam.status).not.toBe('results_published');

    const pending = await written.getPending(teacher1, ex.examPublicId);
    await written.gradeWritten(teacher1, 't', pending[0]!.pending[0]!.answerPublicId, {
      manualScore: 5,
      feedback: 'good',
    });
    await runResultsWorker(ex.examId);

    const result = await prisma.db.examResult.findFirstOrThrow({
      where: { attempt: { publicId: att.attemptPublicId } },
      select: { finalScore: true },
    });
    expect(result.finalScore).toBe(8); // 3 (MCQ) + 5 (written)
    exam = await prisma.db.exam.findFirstOrThrow({
      where: { id: ex.examId },
      select: { status: true },
    });
    expect(exam.status).toBe('results_published');
  });

  it('(g) an MCQ-only exam auto-publishes results after auto-grade + window end', async () => {
    const ex = await publishLiveExam(false);
    await takeAndSubmit(ex);
    await endWindow(ex.examId);
    await runResultsWorker(ex.examId);
    const exam = await prisma.db.exam.findFirstOrThrow({
      where: { id: ex.examId },
      select: { status: true },
    });
    expect(exam.status).toBe('results_published');
  });
});

describe('Phase 5a — ranking', () => {
  it('(c) dense rank handles ties', async () => {
    const exam = await prisma.exam.create({
      data: {
        coursePartId: partAId,
        createdByTeacherId: teacher1Id,
        title: `Rank ${rand()}`,
        startAt: new Date(Date.now() - 60_000),
        endAt: new Date(Date.now() + 3_600_000),
        durationMinutes: 60,
        status: 'grading',
        totalMarks: 10,
        settings: baseSettings,
      },
      select: { id: true },
    });
    const scores = [10, 8, 8, 6, 4];
    for (let i = 0; i < scores.length; i++) {
      const u = await prisma.user.create({
        data: {
          username: `rank_${rand()}_${i}`,
          passwordHash: 'x',
          displayName: `R${i}`,
          mustChangePassword: false,
        },
      });
      const st = await prisma.student.create({
        data: { userId: u.id, studentId: `RANK-${Date.now()}-${i}`, batchId: cseBatchId },
      });
      const att = await prisma.examAttempt.create({
        data: {
          examId: exam.id,
          studentId: st.id,
          status: 'graded',
          gradingStatus: 'graded',
          submittedAt: new Date(),
          totalScore: scores[i]!,
        },
      });
      await prisma.examResult.create({
        data: { attemptId: att.id, finalScore: scores[i]!, percentage: scores[i]! * 10 },
      });
    }
    await results.rerank(exam.id);
    const rows = await prisma.db.examResult.findMany({
      where: { attempt: { examId: exam.id } },
      select: { finalScore: true, rank: true },
      orderBy: { finalScore: 'desc' },
    });
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 2, 3, 4]); // 10->1, 8,8->2, 6->3, 4->4
  });
});

describe('Phase 5a — reporting', () => {
  it('(f) report request is rejected (403) before results are published', async () => {
    const ex = await publishLiveExam(false); // live, not results_published
    await expect(
      reportService.request(teacher1, { examPublicId: ex.examPublicId, type: 'overall' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('(d) overall mark sheet includes absent (enrolled, no attempt) students with zeros', async () => {
    const ex = await publishLiveExam(false);
    await takeAndSubmit(ex);
    await endWindow(ex.examId);
    await runResultsWorker(ex.examId);

    const data = await reportData.buildOverall(ex.examId);
    const attemptedRows = data.rows.filter((r) => r.status === 'attempted');
    const absentRows = data.rows.filter((r) => r.status === 'absent');
    expect(attemptedRows.length).toBeGreaterThanOrEqual(1);
    expect(absentRows.length).toBeGreaterThanOrEqual(1);
    expect(absentRows.every((r) => r.totalScore === 0)).toBe(true);
    expect(data.rows.some((r) => r.studentId === '2021001' && r.status === 'attempted')).toBe(true);
  });

  it('(e) individual mark sheet shows the snapshot text after the bank is edited', async () => {
    const ex = await publishLiveExam(false);
    await takeAndSubmit(ex);
    await endWindow(ex.examId);
    await runResultsWorker(ex.examId);

    const before = await reportData.buildIndividual(ex.examId, studentPublicId);
    expect(before.questions[0]!.text).toBe('MCQ original text');

    // Edit the LIVE bank question text.
    await prisma.question.update({
      where: { publicId: ex.mcqBankPublicId },
      data: { text: 'MCQ CHANGED IN BANK' },
    });

    const after = await reportData.buildIndividual(ex.examId, studentPublicId);
    expect(after.questions[0]!.text).toBe('MCQ original text'); // snapshot, unchanged
  });
});
