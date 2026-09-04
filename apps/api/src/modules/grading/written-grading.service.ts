import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/types/auth';
import { AuditService } from '../audit/audit.service';
import { ExamAccessService } from '../exam/exam-access.service';
import { AttemptGradingService } from './attempt-grading.service';
import type { GradeAnswerDto } from './dto/grade.dto';

const examScopeSelect = {
  id: true,
  publicId: true,
  coursePart: {
    select: {
      assignedTeacherId: true,
      course: {
        select: {
          semester: {
            select: {
              batch: {
                select: {
                  program: {
                    select: { departmentId: true, department: { select: { facultyId: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ExamSelect;

type ExamScope = Prisma.ExamGetPayload<{ select: typeof examScopeSelect }>;

@Injectable()
export class WrittenGradingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: ExamAccessService,
    private readonly attemptGrading: AttemptGradingService,
  ) {}

  private isAdmin(user: AuthUser): boolean {
    return user.roles.some((r) => r.role === 'admin' || r.role === 'super_admin');
  }

  /** Only the teacher assigned to the course part (or an admin, scoped) may grade this exam. */
  private async assertGrader(user: AuthUser, exam: ExamScope): Promise<void> {
    const program = exam.coursePart.course.semester.batch.program;
    if (this.isAdmin(user)) {
      this.access.assertAdminScope(user, {
        departmentId: program.departmentId,
        facultyId: program.department.facultyId,
      });
      return;
    }
    const teacher = await this.access.requireTeacher(user);
    if (exam.coursePart.assignedTeacherId !== teacher.id) {
      throw new ForbiddenException('You are not assigned to this exam');
    }
  }

  /** The teacher's assigned exams that have written questions, with a pending-grade count. */
  async listExamsToGrade(user: AuthUser) {
    const teacher = this.isAdmin(user) ? null : await this.access.requireTeacher(user);
    const exams = await this.prisma.db.exam.findMany({
      where: {
        ...(teacher ? { coursePart: { assignedTeacherId: teacher.id } } : {}),
        status: { in: ['live', 'ended', 'grading', 'results_published'] },
        examQuestions: { some: { snapshotType: 'written' } },
      },
      select: {
        id: true,
        publicId: true,
        title: true,
        status: true,
        coursePart: {
          select: {
            name: true,
            course: { select: { code: true } },
          },
        },
      },
      orderBy: { publishedAt: 'desc' },
    });

    const out = [];
    for (const e of exams) {
      const pendingCount = await this.prisma.db.answer.count({
        where: {
          isGraded: false,
          attempt: { examId: e.id },
          question: { examQuestions: { some: { examId: e.id, snapshotType: 'written' } } },
        },
      });
      out.push({
        examPublicId: e.publicId,
        title: e.title,
        courseCode: e.coursePart.course.code,
        part: e.coursePart.name,
        status: e.status,
        pendingCount,
      });
    }
    return out;
  }

  /** Ungraded written answers for the exam, grouped by question. */
  async getPending(user: AuthUser, examPublicId: string) {
    const exam = await this.prisma.db.exam.findFirst({
      where: { publicId: examPublicId },
      select: examScopeSelect,
    });
    if (!exam) throw new NotFoundException('Exam not found');
    await this.assertGrader(user, exam);

    const eqs = await this.prisma.db.examQuestion.findMany({
      where: { examId: exam.id, snapshotType: 'written' },
      select: {
        questionId: true,
        snapshotText: true,
        snapshotMarks: true,
        question: { select: { publicId: true } },
      },
      orderBy: { order: 'asc' },
    });
    if (eqs.length === 0) return [];

    const answers = await this.prisma.db.answer.findMany({
      where: {
        attempt: { examId: exam.id },
        questionId: { in: eqs.map((e) => e.questionId) },
        isGraded: false,
      },
      select: {
        publicId: true,
        questionId: true,
        writtenText: true,
        attempt: {
          select: {
            publicId: true,
            student: { select: { studentId: true, user: { select: { displayName: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return eqs.map((eq) => ({
      questionPublicId: eq.question.publicId,
      text: eq.snapshotText,
      maxMarks: eq.snapshotMarks,
      pending: answers
        .filter((a) => a.questionId === eq.questionId)
        .map((a) => ({
          answerPublicId: a.publicId,
          studentId: a.attempt.student.studentId,
          studentName: a.attempt.student.user.displayName,
          attemptPublicId: a.attempt.publicId,
          writtenText: a.writtenText,
        })),
    }));
  }

  async gradeWritten(user: AuthUser, ip: string, answerPublicId: string, dto: GradeAnswerDto) {
    const answer = await this.prisma.db.answer.findFirst({
      where: { publicId: answerPublicId },
      select: {
        id: true,
        manualScore: true,
        questionId: true,
        attemptId: true,
        attempt: { select: { examId: true } },
      },
    });
    if (!answer) throw new NotFoundException('Answer not found');

    const eq = await this.prisma.db.examQuestion.findFirst({
      where: { examId: answer.attempt.examId, questionId: answer.questionId },
      select: { snapshotType: true, snapshotMarks: true },
    });
    if (!eq) throw new NotFoundException('Exam question not found');
    if (eq.snapshotType !== 'written') throw new BadRequestException('MCQ answers are auto-graded');

    const exam = await this.prisma.db.exam.findFirstOrThrow({
      where: { id: answer.attempt.examId },
      select: examScopeSelect,
    });
    await this.assertGrader(user, exam);

    const max = eq.snapshotMarks ?? 0;
    // Validate against the SNAPSHOT marks, not the live bank.
    if (dto.manualScore < 0 || dto.manualScore > max) {
      throw new BadRequestException(`manualScore must be between 0 and ${max}`);
    }

    const teacher = this.isAdmin(user) ? null : await this.access.requireTeacher(user);
    await this.prisma.$transaction(async (tx) => {
      await tx.answer.update({
        where: { id: answer.id },
        data: {
          manualScore: dto.manualScore,
          isGraded: true,
          feedback: dto.feedback ?? null,
          gradedByTeacherId: teacher?.id ?? null,
        },
      });
      await this.audit.recordTx(tx, {
        actorUserId: user.id,
        action: 'answer.grade',
        entity: 'Answer',
        entityId: answerPublicId,
        before: { manualScore: answer.manualScore },
        after: { manualScore: dto.manualScore },
        ip,
      });
    });

    // May finalize the attempt (ExamResult) if this was the last ungraded answer.
    await this.attemptGrading.finalizeIfComplete(answer.attemptId);
    return { answerPublicId, manualScore: dto.manualScore, isGraded: true };
  }
}
