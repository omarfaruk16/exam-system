import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AttemptGradingService } from '../grading/attempt-grading.service';

interface ExamSettings {
  negativeMarking?: boolean;
  negativeMarkValue?: number;
}

/**
 * MCQ auto-grading (§6.6). Scores each MCQ Answer against the ExamQuestion SNAPSHOT
 * (snapshotCorrectOptionId), never the live bank, then hands off to the shared finalizer which
 * writes the ExamResult rollup once every answer (MCQ + written) is graded. Idempotent.
 */
@Injectable()
export class GradingService {
  private readonly logger = new Logger(GradingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attemptGrading: AttemptGradingService,
  ) {}

  async grade(attemptId: number): Promise<void> {
    const attempt = await this.prisma.db.examAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        status: true,
        examId: true,
        exam: { select: { settings: true } },
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

    const updates: { id: number; autoScore: number }[] = [];
    for (const ans of attempt.answers) {
      const eq = snap.get(ans.questionId);
      if (!eq || eq.snapshotType !== 'mcq') continue;
      const answered = ans.selectedOptionId != null;
      const correct = answered && ans.selectedOptionId === eq.snapshotCorrectOptionId;
      const score = correct ? (eq.snapshotMarks ?? 0) : answered ? -negativeValue : 0;
      updates.push({ id: ans.id, autoScore: score });
    }
    if (updates.length > 0) {
      await this.prisma.$transaction(
        updates.map((u) =>
          this.prisma.answer.update({
            where: { id: u.id },
            data: { autoScore: u.autoScore, isGraded: true },
          }),
        ),
      );
    }

    await this.attemptGrading.finalizeIfComplete(attemptId);
    this.logger.log(`MCQ-graded attempt ${attemptId} (${updates.length} MCQ answers)`);
  }
}
