import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/types/auth';
import { AuditService } from '../audit/audit.service';
import { AttemptRedisService } from './attempt.redis';
import type { AnswerInput } from './dto/attempt.dto';
import { PaperService } from './paper.service';

const BUFFER_SEC = 2 * 60 * 60;

interface ExamSettings {
  showMarksAfterSubmit?: boolean;
  showExplanation?: boolean;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
}

@Injectable()
export class AttemptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: AttemptRedisService,
    private readonly paper: PaperService,
    private readonly audit: AuditService,
  ) {}

  private async requireStudent(user: AuthUser): Promise<{ id: number; batchId: number }> {
    const student = await this.prisma.db.student.findFirst({
      where: { userId: user.id },
      select: { id: true, batchId: true },
    });
    if (!student) throw new ForbiddenException('Only a student can take an exam');
    return student;
  }

  /** The student's visible exams (their batch's offerings), with any existing attempt. */
  async listMyExams(user: AuthUser) {
    const student = await this.requireStudent(user);
    const exams = await this.prisma.db.exam.findMany({
      where: {
        offeringPart: { offering: { batchId: student.batchId } },
        status: { in: ['published', 'live', 'ended', 'grading', 'results_published'] },
      },
      select: {
        publicId: true,
        title: true,
        startAt: true,
        endAt: true,
        durationMinutes: true,
        totalMarks: true,
        status: true,
        settings: true,
        offeringPart: {
          select: {
            coursePart: { select: { name: true } },
            offering: { select: { course: { select: { code: true } } } },
          },
        },
        attempts: {
          where: { studentId: student.id },
          select: {
            publicId: true,
            status: true,
            gradingStatus: true,
            totalScore: true,
            submittedAt: true,
          },
          take: 1,
        },
      },
      orderBy: [{ startAt: 'desc' }],
    });
    return exams.map((e) => {
      const a = e.attempts[0];
      const settings = (e.settings as ExamSettings) ?? {};
      return {
        examPublicId: e.publicId,
        title: e.title,
        courseCode: e.offeringPart.offering.course.code,
        part: e.offeringPart.coursePart.name,
        startAt: e.startAt.toISOString(),
        endAt: e.endAt.toISOString(),
        durationMinutes: e.durationMinutes,
        totalMarks: e.totalMarks,
        status: e.status,
        showMarksAfterSubmit: settings.showMarksAfterSubmit !== false,
        attempt: a
          ? {
              publicId: a.publicId,
              status: a.status,
              gradingStatus: a.gradingStatus,
              totalScore: a.totalScore,
              submittedAt: a.submittedAt?.toISOString() ?? null,
            }
          : null,
      };
    });
  }

  // ─────────────────────────────── START ───────────────────────────────
  async start(user: AuthUser, examPublicId: string, ip: string | null) {
    const student = await this.requireStudent(user);
    const exam = await this.prisma.db.exam.findFirst({
      where: { publicId: examPublicId },
      select: {
        id: true,
        publicId: true,
        title: true,
        instructions: true,
        durationMinutes: true,
        totalMarks: true,
        status: true,
        endAt: true,
        settings: true,
        offeringPart: { select: { offering: { select: { batchId: true } } } },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    if (exam.status !== 'live') throw new ForbiddenException('This exam is not currently open');
    if (student.batchId !== exam.offeringPart.offering.batchId) {
      throw new ForbiddenException('You are not enrolled in this exam');
    }

    // Create or resume — the unique (examId, studentId) constraint blocks a duplicate attempt.
    let attempt = await this.prisma.db.examAttempt.findFirst({
      where: { examId: exam.id, studentId: student.id },
      select: { id: true, publicId: true, startedAt: true, status: true },
    });
    if (!attempt) {
      try {
        attempt = await this.prisma.examAttempt.create({
          data: { examId: exam.id, studentId: student.id },
          select: { id: true, publicId: true, startedAt: true, status: true },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          attempt = await this.prisma.db.examAttempt.findFirstOrThrow({
            where: { examId: exam.id, studentId: student.id },
            select: { id: true, publicId: true, startedAt: true, status: true },
          });
        } else {
          throw e;
        }
      }
    }
    if (attempt.status !== 'in_progress') {
      throw new ConflictException('You have already submitted this exam');
    }

    const ttlSec = exam.durationMinutes * 60 + BUFFER_SEC;
    // Deadline is server-authoritative: min(exam end, start + duration). Never from the client.
    const deadlineMs = Math.min(
      exam.endAt.getTime(),
      attempt.startedAt.getTime() + exam.durationMinutes * 60_000,
    );
    await this.redis.setDeadline(attempt.id, deadlineMs, ttlSec);

    // Single active session — overwriting supersedes any previous device.
    const sessionId = randomUUID();
    const previous = await this.redis.setSession(exam.id, student.id, sessionId, ttlSec);
    if (previous && previous !== sessionId) {
      await this.audit.record({
        actorUserId: user.id,
        action: 'exam.session_superseded',
        entity: 'ExamAttempt',
        entityId: attempt.publicId,
        before: { sessionId: previous },
        after: { sessionId },
        ip,
      });
    }

    const paper = await this.paper.getPaperForAttempt(
      {
        id: exam.id,
        publicId: exam.publicId,
        title: exam.title,
        instructions: exam.instructions,
        durationMinutes: exam.durationMinutes,
        totalMarks: exam.totalMarks,
        settings: (exam.settings as ExamSettings) ?? {},
      },
      attempt.publicId,
    );

    // Already-persisted answers, so a reconnect resumes where the student left off.
    const saved = await this.prisma.db.answer.findMany({
      where: { attemptId: attempt.id },
      select: {
        selectedOptionId: true,
        writtenText: true,
        question: { select: { publicId: true } },
      },
    });

    return {
      attempt: {
        publicId: attempt.publicId,
        startedAt: attempt.startedAt.toISOString(),
        deadline: new Date(deadlineMs).toISOString(),
        durationMinutes: exam.durationMinutes,
        status: attempt.status,
      },
      sessionId,
      serverTime: new Date().toISOString(),
      paper,
      savedAnswers: saved.map((a) => ({
        questionPublicId: a.question.publicId,
        selectedOptionId: a.selectedOptionId,
        writtenText: a.writtenText,
      })),
    };
  }

  // ─────────────────────────────── AUTOSAVE ───────────────────────────────
  async autosave(
    user: AuthUser,
    attemptPublicId: string,
    sessionId: string,
    answers: AnswerInput[],
  ) {
    const attempt = await this.prisma.db.examAttempt.findFirst({
      where: { publicId: attemptPublicId },
      select: {
        id: true,
        examId: true,
        studentId: true,
        status: true,
        student: { select: { userId: true } },
      },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.student.userId !== user.id) throw new ForbiddenException('Not your attempt');
    if (attempt.status !== 'in_progress')
      throw new ConflictException('This attempt is no longer open');

    const session = await this.redis.getSession(attempt.examId, attempt.studentId);
    if (!session || session !== sessionId) throw new UnauthorizedException('SESSION_SUPERSEDED');

    const deadline = await this.redis.getDeadline(attempt.id);
    const now = Date.now();
    if (deadline !== null && now > deadline) {
      throw new ConflictException('DEADLINE_PASSED — no further answers are accepted');
    }

    const eqs = await this.prisma.db.examQuestion.findMany({
      where: { examId: attempt.examId },
      select: {
        questionId: true,
        snapshotType: true,
        snapshotOptions: true,
        question: { select: { publicId: true } },
      },
    });
    const byQ = new Map(eqs.map((e) => [e.question.publicId, e]));

    const redisEntries: Record<string, string> = {};
    let saved = 0;
    for (const ans of answers) {
      const eq = byQ.get(ans.questionPublicId);
      if (!eq) continue;

      let selectedOptionId: string | null = null;
      if (eq.snapshotType === 'mcq' && ans.selectedOptionId != null) {
        const opts = (eq.snapshotOptions as { id: string }[] | null) ?? [];
        if (!opts.some((o) => o.id === ans.selectedOptionId)) {
          throw new BadRequestException('Invalid option for this question');
        }
        selectedOptionId = ans.selectedOptionId;
      }
      const writtenText = eq.snapshotType === 'written' ? (ans.writtenText ?? null) : null;

      // UPSERT on the (attemptId, questionId) unique constraint — never select-then-insert.
      await this.prisma.answer.upsert({
        where: { attemptId_questionId: { attemptId: attempt.id, questionId: eq.questionId } },
        create: { attemptId: attempt.id, questionId: eq.questionId, selectedOptionId, writtenText },
        update: { selectedOptionId, writtenText },
      });
      redisEntries[ans.questionPublicId] = JSON.stringify({ selectedOptionId, writtenText });
      saved++;
    }

    const snapTtl =
      deadline !== null
        ? Math.max(60, Math.ceil((deadline - now) / 1000) + BUFFER_SEC)
        : 3 * 60 * 60;
    await this.redis.saveAnswerSnapshot(attempt.id, redisEntries, snapTtl);

    return { saved, serverTime: new Date().toISOString() };
  }

  // ─────────────────────────────── RESULT ───────────────────────────────
  async getResult(user: AuthUser, attemptPublicId: string) {
    const attempt = await this.prisma.db.examAttempt.findFirst({
      where: { publicId: attemptPublicId },
      select: {
        publicId: true,
        status: true,
        gradingStatus: true,
        totalScore: true,
        autoSubmitted: true,
        submittedAt: true,
        examId: true,
        student: { select: { userId: true, publicId: true } },
        exam: { select: { publicId: true, status: true, settings: true, totalMarks: true } },
        result: { select: { finalScore: true, percentage: true, rank: true } },
        answers: {
          select: {
            questionId: true,
            selectedOptionId: true,
            writtenText: true,
            autoScore: true,
            manualScore: true,
            isGraded: true,
            feedback: true,
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');

    const isOwner = attempt.student.userId === user.id;
    const isStaff = user.roles.some((r) => ['admin', 'super_admin', 'teacher'].includes(r.role));
    if (!isOwner && !isStaff) throw new ForbiddenException('Not your result');

    const settings = (attempt.exam.settings as ExamSettings) ?? {};
    // When showMarksAfterSubmit=false and results are not yet published, return a
    // holding response (showMarks=false) rather than a 403 — the frontend shows Mode B.
    const showMarks =
      !isOwner ||
      settings.showMarksAfterSubmit !== false ||
      attempt.exam.status === 'results_published';

    const baseFields = {
      attemptPublicId: attempt.publicId,
      status: attempt.status,
      gradingStatus: attempt.gradingStatus,
      autoSubmitted: attempt.autoSubmitted,
      submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : null,
    };

    // Return literal-typed showMarks so the union is discriminated by TypeScript callers.
    if (!showMarks) return { ...baseFields, showMarks: false as const };

    const eqs = await this.prisma.db.examQuestion.findMany({
      where: { examId: attempt.examId },
      select: {
        questionId: true,
        order: true,
        snapshotType: true,
        snapshotText: true,
        snapshotMarks: true,
        snapshotExplanation: true,
        snapshotCorrectOptionId: true,
        snapshotOptions: true,
        question: { select: { publicId: true } },
      },
      orderBy: { order: 'asc' },
    });
    const answerByQ = new Map(attempt.answers.map((a) => [a.questionId, a]));

    type SnapshotOption = { id: string; text: string; order: number };

    const questions = eqs.map((eq) => {
      const a = answerByQ.get(eq.questionId);
      const opts = (eq.snapshotOptions ?? []) as SnapshotOption[];
      const score = a
        ? a.isGraded
          ? (a.autoScore ?? 0) + (a.manualScore ?? 0)
          : (a.autoScore ?? null)
        : null;
      return {
        questionPublicId: eq.question.publicId,
        order: eq.order,
        type: eq.snapshotType,
        snapshotText: eq.snapshotText ?? null,
        snapshotOptions: eq.snapshotType === 'mcq' ? opts : null,
        marks: eq.snapshotMarks,
        score,
        selectedOptionId: a?.selectedOptionId ?? null,
        writtenText: a?.writtenText ?? null,
        correctOptionId: eq.snapshotType === 'mcq' ? eq.snapshotCorrectOptionId : null,
        explanation: settings.showExplanation ? (eq.snapshotExplanation ?? null) : null,
        feedback: a?.feedback ?? null,
      };
    });

    const totalStudents = await this.prisma.db.examResult.count({
      where: { attempt: { examId: attempt.examId } },
    });

    return {
      ...baseFields,
      showMarks: true as const,
      examPublicId: attempt.exam.publicId,
      totalScore: attempt.totalScore,
      totalMarks: attempt.exam.totalMarks,
      percentage: attempt.result?.percentage ?? null,
      rank: attempt.result?.rank ?? null,
      totalStudents,
      myStudentPublicId: isOwner ? attempt.student.publicId : null,
      questions,
    };
  }
}
