import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../common/config/env.validation';
import { PrismaService } from '../../common/prisma/prisma.service';

/** The formal letterhead every report shares. */
export interface ReportHeader {
  institution: string; // "University of Rajshahi"
  department: string;
  program: string; // degree / programme name
  semester: string; // e.g. "Semester 3" or its given name
  courseName: string;
  courseCode: string;
  partName: string;
  batch: string; // batch/session name(s) sitting this exam
  examDate: string; // formatted date of the exam
  duration: string; // e.g. "1 hr 30 min"
  examSequence: number; // "Exam N" for this course part
  title: string;
  teacher: string;
  totalMarks: number;
}

export interface OverallRow {
  rollNumber: string | null;
  studentId: string;
  name: string;
  status: 'attempted' | 'absent';
  scores: Record<string, number>; // questionPublicId -> score
  totalScore: number;
  percentage: number;
  rank: number | null;
}
export interface OverallData {
  header: ReportHeader;
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
  header: ReportHeader;
  student: { studentId: string; name: string; rollNumber: string | null };
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

/** Snapshot of an exam + all its course/department context, enough to print the letterhead. */
const examHeaderSelect = {
  id: true,
  title: true,
  totalMarks: true,
  startAt: true,
  durationMinutes: true,
  coursePartId: true,
  createdBy: { select: { user: { select: { displayName: true } } } },
  coursePart: {
    select: {
      name: true,
      assignedTeacher: { select: { user: { select: { displayName: true } } } },
      course: {
        select: {
          code: true,
          name: true,
          semesterId: true,
          semester: {
            select: {
              number: true,
              name: true,
              program: {
                select: {
                  name: true,
                  department: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} hr ${m} min`;
  if (h) return `${h} hr`;
  return `${m} min`;
}

function formatExamDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Dhaka',
  });
}

@Injectable()
export class ReportDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Builds the shared letterhead: institution, department, course, batch, teacher, exam #. */
  private async buildHeader(exam: {
    id: number;
    title: string;
    totalMarks: number;
    startAt: Date;
    durationMinutes: number;
    coursePartId: number;
    createdBy: { user: { displayName: string } };
    coursePart: {
      name: string;
      assignedTeacher: { user: { displayName: string } } | null;
      course: {
        code: string;
        name: string;
        semesterId: number;
        semester: {
          number: number;
          name: string | null;
          program: { name: string; department: { name: string } };
        };
      };
    };
  }): Promise<ReportHeader> {
    const course = exam.coursePart.course;
    const sem = course.semester;

    // Batch(es) currently sitting in this semester — usually one, join if more.
    const batches = await this.prisma.db.batch.findMany({
      where: { currentSemesterId: course.semesterId, deletedAt: null },
      select: { name: true },
      orderBy: { name: 'asc' },
    });

    // "Exam N of this part" — position by start time among this part's exams.
    const examSequence = await this.prisma.db.exam.count({
      where: {
        coursePartId: exam.coursePartId,
        deletedAt: null,
        startAt: { lte: exam.startAt },
      },
    });

    const teacher =
      exam.coursePart.assignedTeacher?.user.displayName ?? exam.createdBy.user.displayName;

    return {
      institution: this.config.get('INSTITUTION_NAME', { infer: true }) ?? 'University of Rajshahi',
      department: sem.program.department.name,
      program: sem.program.name,
      semester: sem.name?.trim() ? sem.name : `Semester ${sem.number}`,
      courseName: course.name,
      courseCode: course.code,
      partName: exam.coursePart.name,
      batch: batches.length ? batches.map((b) => b.name).join(', ') : '—',
      examDate: formatExamDate(exam.startAt),
      duration: formatDuration(exam.durationMinutes),
      examSequence: Math.max(1, examSequence),
      title: exam.title,
      teacher,
      totalMarks: exam.totalMarks,
    };
  }

  /** Overall mark sheet — reads ExamResult (with breakdown) + the enrolled roster. Never scans Answer. */
  async buildOverall(examId: number): Promise<OverallData> {
    const exam = await this.prisma.db.exam.findUniqueOrThrow({
      where: { id: examId },
      select: examHeaderSelect,
    });
    const header = await this.buildHeader(exam);
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
      select: { studentId: true, rollNumber: true, user: { select: { displayName: true } } },
      orderBy: [{ rollNumber: 'asc' }, { studentId: 'asc' }],
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
        rollNumber: s.rollNumber,
        studentId: s.studentId,
        name: s.user.displayName,
        status: r ? 'attempted' : 'absent',
        scores,
        totalScore: r?.finalScore ?? 0,
        percentage: r?.percentage ?? 0,
        rank: r?.rank ?? null,
      };
    });

    return { header, questions, rows };
  }

  /** Individual mark sheet — one attempt (targeted read, not a scan). Uses snapshot question text. */
  async buildIndividual(examId: number, studentPublicId: string): Promise<IndividualData> {
    const student = await this.prisma.db.student.findFirst({
      where: { publicId: studentPublicId },
      select: {
        id: true,
        studentId: true,
        rollNumber: true,
        user: { select: { displayName: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const exam = await this.prisma.db.exam.findUniqueOrThrow({
      where: { id: examId },
      select: { ...examHeaderSelect, settings: true },
    });
    const header = await this.buildHeader(exam);
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
      header,
      student: {
        studentId: student.studentId,
        name: student.user.displayName,
        rollNumber: student.rollNumber,
      },
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
