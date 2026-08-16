import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface OverallRow {
  studentId: string;
  name: string;
  status: 'attempted' | 'absent';
  scores: Record<string, number>; // questionPublicId -> score
  totalScore: number;
  percentage: number;
  rank: number | null;
}
export interface OverallData {
  exam: {
    title: string;
    courseCode: string;
    partName: string;
    semesterNumber: number;
    totalMarks: number;
  };
  questions: { questionPublicId: string; order: number; maxMarks: number; label: string }[];
  rows: OverallRow[];
}

export interface IndividualQuestion {
  order: number;
  type: string;
  text: string;
  maxMarks: number;
  studentAnswer: string;
  score: number;
  feedback: string | null;
  explanation: string | null;
}
export interface IndividualData {
  exam: { title: string; courseCode: string; totalMarks: number };
  student: { studentId: string; name: string };
  attempt: {
    submittedAt: string | null;
    totalScore: number;
    percentage: number;
    rank: number | null;
    status: string;
  };
  questions: IndividualQuestion[];
}

interface BreakdownItem {
  questionPublicId: string;
  score: number;
}
interface ExamSettings {
  showExplanation?: boolean;
}

@Injectable()
export class ReportDataService {
  constructor(private readonly prisma: PrismaService) {}

  /** Overall mark sheet — reads ExamResult (with breakdown) + the enrolled roster. Never scans Answer. */
  async buildOverall(examId: number): Promise<OverallData> {
    const exam = await this.prisma.db.exam.findUniqueOrThrow({
      where: { id: examId },
      select: {
        title: true,
        totalMarks: true,
        coursePart: {
          select: {
            name: true,
            course: {
              select: {
                code: true,
                semesterId: true,
                semester: { select: { number: true } },
              },
            },
          },
        },
      },
    });
    const eqs = await this.prisma.db.examQuestion.findMany({
      where: { examId },
      select: { order: true, snapshotMarks: true, question: { select: { publicId: true } } },
      orderBy: { order: 'asc' },
    });
    const questions = eqs.map((eq) => ({
      questionPublicId: eq.question.publicId,
      order: eq.order,
      maxMarks: eq.snapshotMarks ?? 0,
      label: `Q${eq.order}`,
    }));

    const students = await this.prisma.db.student.findMany({
      where: { batch: { currentSemesterId: exam.coursePart.course.semesterId } },
      select: { studentId: true, user: { select: { displayName: true } } },
      orderBy: { studentId: 'asc' },
    });
    const results = await this.prisma.db.examResult.findMany({
      where: { attempt: { examId } },
      select: {
        finalScore: true,
        percentage: true,
        rank: true,
        breakdown: true,
        attempt: { select: { student: { select: { studentId: true } } } },
      },
    });
    const byStudent = new Map(results.map((r) => [r.attempt.student.studentId, r]));

    const rows: OverallRow[] = students.map((s) => {
      const r = byStudent.get(s.studentId);
      const scores: Record<string, number> = {};
      for (const q of questions) scores[q.questionPublicId] = 0;
      if (r) {
        const bd = (r.breakdown as BreakdownItem[] | null) ?? [];
        for (const item of bd) scores[item.questionPublicId] = item.score;
      }
      return {
        studentId: s.studentId,
        name: s.user.displayName,
        status: r ? 'attempted' : 'absent',
        scores,
        totalScore: r?.finalScore ?? 0,
        percentage: r?.percentage ?? 0,
        rank: r?.rank ?? null,
      };
    });

    return {
      exam: {
        title: exam.title,
        courseCode: exam.coursePart.course.code,
        partName: exam.coursePart.name,
        semesterNumber: exam.coursePart.course.semester.number,
        totalMarks: exam.totalMarks,
      },
      questions,
      rows,
    };
  }

  /** Individual mark sheet — one attempt (targeted read, not a scan). Uses snapshot question text. */
  async buildIndividual(examId: number, studentPublicId: string): Promise<IndividualData> {
    const student = await this.prisma.db.student.findFirst({
      where: { publicId: studentPublicId },
      select: { id: true, studentId: true, user: { select: { displayName: true } } },
    });
    if (!student) throw new NotFoundException('Student not found');

    const exam = await this.prisma.db.exam.findUniqueOrThrow({
      where: { id: examId },
      select: {
        title: true,
        totalMarks: true,
        settings: true,
        coursePart: { select: { course: { select: { code: true } } } },
      },
    });
    const settings = (exam.settings as ExamSettings | null) ?? {};

    const attempt = await this.prisma.db.examAttempt.findFirst({
      where: { examId, studentId: student.id },
      select: {
        status: true,
        submittedAt: true,
        totalScore: true,
        result: { select: { percentage: true, rank: true } },
        answers: {
          select: {
            questionId: true,
            selectedOptionId: true,
            writtenText: true,
            autoScore: true,
            manualScore: true,
            feedback: true,
          },
        },
      },
    });
    const eqs = await this.prisma.db.examQuestion.findMany({
      where: { examId },
      select: {
        order: true,
        snapshotType: true,
        snapshotText: true,
        snapshotMarks: true,
        snapshotOptions: true,
        snapshotExplanation: true,
        question: { select: { id: true } },
      },
      orderBy: { order: 'asc' },
    });
    const answerByQ = new Map((attempt?.answers ?? []).map((a) => [a.questionId, a]));

    const questions: IndividualQuestion[] = eqs.map((eq) => {
      const a = answerByQ.get(eq.question.id);
      let studentAnswer = '(blank)';
      if (eq.snapshotType === 'mcq') {
        const opts = (eq.snapshotOptions as { id: string; text: string }[] | null) ?? [];
        const chosen = opts.find((o) => o.id === a?.selectedOptionId);
        studentAnswer = chosen ? chosen.text : '(blank)';
      } else if (a?.writtenText) {
        studentAnswer = a.writtenText;
      }
      const score = eq.snapshotType === 'mcq' ? (a?.autoScore ?? 0) : (a?.manualScore ?? 0);
      return {
        order: eq.order,
        type: eq.snapshotType ?? 'written',
        text: eq.snapshotText ?? '',
        maxMarks: eq.snapshotMarks ?? 0,
        studentAnswer,
        score,
        feedback: a?.feedback ?? null,
        explanation:
          eq.snapshotType === 'mcq' && settings.showExplanation ? eq.snapshotExplanation : null,
      };
    });

    return {
      exam: {
        title: exam.title,
        courseCode: exam.coursePart.course.code,
        totalMarks: exam.totalMarks,
      },
      student: { studentId: student.studentId, name: student.user.displayName },
      attempt: {
        submittedAt: attempt?.submittedAt ? attempt.submittedAt.toISOString() : null,
        totalScore: attempt?.totalScore ?? 0,
        percentage: attempt?.result?.percentage ?? 0,
        rank: attempt?.result?.rank ?? null,
        status: attempt ? attempt.status : 'absent',
      },
      questions,
    };
  }
}
