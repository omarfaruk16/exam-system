import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AttemptStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QUEUE_GRADING } from '../../queue/queue.constants';
import { AttemptRedisService } from './attempt.redis';

export interface FinalizeResult {
  attemptPublicId: string;
  status: AttemptStatus;
  submittedAt: string | null;
  autoSubmitted: boolean;
}

export interface FinalizeOptions {
  auto: boolean;
  sessionId?: string;
  idempotencyKey?: string;
  actorUserId?: number;
  ip?: string | null;
}

const LOCK_TTL_MS = 15_000;
const IDEM_TTL_SEC = 24 * 60 * 60;

/**
 * The single finalize path (§6.5, Step 4). Both manual submit and auto-submit go through here.
 * Idempotency key → cached result; Redis lock on attemptId → one submit at a time; status re-checked
 * inside the lock. Late manual submits are flagged autoSubmitted, never rejected.
 */
@Injectable()
export class AttemptFinalizeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: AttemptRedisService,
    private readonly audit: AuditService,
    @InjectQueue(QUEUE_GRADING) private readonly gradingQueue: Queue,
  ) {}

  async finalize(attemptPublicId: string, opts: FinalizeOptions): Promise<FinalizeResult> {
    const attempt = await this.prisma.db.examAttempt.findFirst({
      where: { publicId: attemptPublicId },
      select: {
        id: true,
        publicId: true,
        examId: true,
        studentId: true,
        student: { select: { userId: true } },
      },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    // A manual submit must come from the attempt's own student.
    if (!opts.auto && opts.actorUserId != null && attempt.student.userId !== opts.actorUserId) {
      throw new ForbiddenException('Not your attempt');
    }

    const idemKey =
      opts.idempotencyKey && opts.idempotencyKey.length > 0
        ? opts.idempotencyKey
        : `auto:${attempt.id}`;

    // 1. Idempotency cache — return the prior result without re-running.
    const cached = await this.redis.getIdempotent(idemKey);
    if (cached) return JSON.parse(cached) as FinalizeResult;

    // 2. Distributed lock.
    const token = randomUUID();
    const acquired = await this.redis.acquireLock(attempt.id, token, LOCK_TTL_MS);
    if (!acquired)
      throw new ConflictException('A submission for this attempt is already in progress');

    try {
      // 3. Re-check status inside the lock.
      const fresh = await this.prisma.db.examAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
        select: { status: true, submittedAt: true, autoSubmitted: true },
      });
      if (fresh.status !== 'in_progress') {
        const already = this.result(
          attempt.publicId,
          fresh.status,
          fresh.submittedAt,
          fresh.autoSubmitted,
        );
        await this.redis.setIdempotent(idemKey, JSON.stringify(already), IDEM_TTL_SEC);
        return already;
      }

      // Manual submits must carry the current session.
      if (!opts.auto) {
        const session = await this.redis.getSession(attempt.examId, attempt.studentId);
        if (!session || session !== opts.sessionId) {
          throw new UnauthorizedException('SESSION_SUPERSEDED');
        }
      }

      // 4. Deadline: past-deadline submits proceed but are flagged.
      const deadline = await this.redis.getDeadline(attempt.id);
      const autoSubmitted = opts.auto || (deadline !== null && Date.now() > deadline);
      const submittedAt = new Date();

      // 5. Single transaction: copy any Redis-only answers, mark submitted.
      const snapshot = await this.redis.readAnswerSnapshot(attempt.id);
      const questionMap = await this.questionMap(attempt.examId);
      await this.prisma.$transaction(async (tx) => {
        for (const [questionPublicId, raw] of Object.entries(snapshot)) {
          const questionId = questionMap.get(questionPublicId);
          if (!questionId) continue;
          const parsed = JSON.parse(raw) as {
            selectedOptionId?: string | null;
            writtenText?: string | null;
          };
          await tx.answer.upsert({
            where: { attemptId_questionId: { attemptId: attempt.id, questionId } },
            create: {
              attemptId: attempt.id,
              questionId,
              selectedOptionId: parsed.selectedOptionId ?? null,
              writtenText: parsed.writtenText ?? null,
            },
            update: {}, // never overwrite an answer already persisted to the DB
          });
        }
        await tx.examAttempt.update({
          where: { id: attempt.id },
          data: { status: 'submitted', submittedAt, autoSubmitted, gradingStatus: 'pending' },
        });
      });

      // 6. Enqueue grading (async — keeps the submit response fast under the deadline spike).
      await this.gradingQueue.add('grade', { attemptId: attempt.id });

      await this.audit.record({
        actorUserId: opts.actorUserId ?? attempt.student.userId,
        action: autoSubmitted ? 'attempt.auto_submit' : 'attempt.submit',
        entity: 'ExamAttempt',
        entityId: attempt.publicId,
        after: { status: 'submitted', autoSubmitted },
        ip: opts.ip ?? null,
      });

      const result = this.result(attempt.publicId, 'submitted', submittedAt, autoSubmitted);
      await this.redis.setIdempotent(idemKey, JSON.stringify(result), IDEM_TTL_SEC);
      return result;
    } finally {
      await this.redis.releaseLock(attempt.id, token);
    }
  }

  private result(
    publicId: string,
    status: AttemptStatus,
    submittedAt: Date | null,
    autoSubmitted: boolean,
  ): FinalizeResult {
    return {
      attemptPublicId: publicId,
      status,
      submittedAt: submittedAt ? submittedAt.toISOString() : null,
      autoSubmitted,
    };
  }

  private async questionMap(examId: number): Promise<Map<string, number>> {
    const eqs = await this.prisma.db.examQuestion.findMany({
      where: { examId },
      select: { questionId: true, question: { select: { publicId: true } } },
    });
    return new Map(eqs.map((e) => [e.question.publicId, e.questionId]));
  }
}
