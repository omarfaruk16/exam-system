import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

interface ExamSettings {
  negativeMarking?: boolean;
  negativeMarkValue?: number;
}

/**
 * MCQ auto-grading (§6.6, Step 5). Scores each MCQ Answer against the ExamQuestion SNAPSHOT
 * (snapshotCorrectOptionId), never the live bank. Written answers stay ungraded (manual, Phase 5).
 * Idempotent: safe to run more than once for the same attempt.
 */
@Injectable()
export class GradingService {
  private readonly logger = new Logger(GradingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async grade(attemptId: number): Promise<void> {
    const attempt = await this.prisma.db.examAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        status: true,
        examId: true,
        exam: { select: { settings: true, totalMarks: true } },
        answers: { select: { id: true, questionId: true, selectedOptionId: true } },
      },
    });
    if (!attempt) return;
    if (attempt.status !== 'submitted' && attempt.status !== 'grading') return; // idempotent guard

    const eqs = await this.prisma.db.examQuestion.findMany({
      where: { examId: attempt.examId },
      select: {
        questionId: true,
        snapshotType: true,
        snapshotMarks: true,
        snapshotCorrectOptionId: true,
      },
    });
    const snap = new Map(eqs.map((e) => [e.questionId, e]));

    const settings = (attempt.exam.settings as ExamSettings | null) ?? {};
    const negativeValue = settings.negativeMarking ? (settings.negativeMarkValue ?? 0) : 0;

    let mcqSum = 0;
    const answerScores: { id: number; autoScore: number }[] = [];
    for (const ans of attempt.answers) {
      const eq = snap.get(ans.questionId);
      if (!eq || eq.snapshotType !== 'mcq') continue;
      const answered = ans.selectedOptionId != null;
      const correct = answered && ans.selectedOptionId === eq.snapshotCorrectOptionId;
      // Correct -> full marks; wrong (and answered) -> negative penalty if enabled; blank -> 0.
      const score = correct ? (eq.snapshotMarks ?? 0) : answered ? -negativeValue : 0;
      mcqSum += score;
      answerScores.push({ id: ans.id, autoScore: score });
    }

    const hasWritten = eqs.some((e) => e.snapshotType === 'written');
    const total = Math.max(0, mcqSum); // never negative overall

    await this.prisma.$transaction(async (tx) => {
      for (const a of answerScores) {
        await tx.answer.update({
          where: { id: a.id },
          data: { autoScore: a.autoScore, isGraded: true },
        });
      }
      if (hasWritten) {
        // MCQs scored; written answers await a manual grade before the rollup is final.
        await tx.examAttempt.update({
          where: { id: attemptId },
          data: { gradingStatus: 'awaiting_manual', totalScore: total },
        });
      } else {
        await tx.examAttempt.update({
          where: { id: attemptId },
          data: { status: 'graded', gradingStatus: 'graded', totalScore: total },
        });
        const pct =
          attempt.exam.totalMarks > 0
            ? Math.min(100, Math.max(0, (total / attempt.exam.totalMarks) * 100))
            : 0;
        await tx.examResult.upsert({
          where: { attemptId },
          create: { attemptId, finalScore: total, percentage: pct },
          update: { finalScore: total, percentage: pct, computedAt: new Date() },
        });
      }
    });

    this.logger.log(
      `Graded attempt ${attemptId}: mcqScore=${total}${hasWritten ? ' (written awaiting manual)' : ' (final)'}`,
    );
  }
}
