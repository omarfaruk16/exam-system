import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AttemptRedisService } from './attempt.redis';

export interface PaperOption {
  id: string;
  text: string;
}
export interface PaperQuestion {
  questionPublicId: string;
  order: number;
  type: 'mcq' | 'written';
  text: string;
  marks: number;
  options?: PaperOption[]; // MCQ only — NEVER includes isCorrect
}
export interface Paper {
  examPublicId: string;
  title: string;
  instructions: string | null;
  durationMinutes: number;
  totalMarks: number;
  questions: PaperQuestion[];
}

export interface PaperExam {
  id: number;
  publicId: string;
  title: string;
  instructions: string | null;
  durationMinutes: number;
  totalMarks: number;
  settings: { shuffleQuestions?: boolean; shuffleOptions?: boolean };
}

// Deterministic PRNG seeded from the attempt id, so a reconnect yields the SAME order.
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: readonly T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

@Injectable()
export class PaperService {
  private readonly PAPER_TTL_SEC = 6 * 60 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: AttemptRedisService,
  ) {}

  /** Base paper (unshuffled), cache-aside per exam. Correct answers stay server-side. */
  private async getBasePaper(exam: PaperExam): Promise<Paper> {
    const cached = await this.redis.getPaper(exam.id);
    if (cached) return JSON.parse(cached) as Paper;

    const eqs = await this.prisma.db.examQuestion.findMany({
      where: { examId: exam.id },
      select: {
        order: true,
        snapshotType: true,
        snapshotText: true,
        snapshotMarks: true,
        snapshotOptions: true,
        question: { select: { publicId: true } },
      },
      orderBy: { order: 'asc' },
    });

    const questions: PaperQuestion[] = eqs.map((eq) => {
      const opts =
        (eq.snapshotOptions as { id: string; text: string; order: number }[] | null) ?? [];
      return {
        questionPublicId: eq.question.publicId,
        order: eq.order,
        type: (eq.snapshotType ?? 'written') as 'mcq' | 'written',
        text: eq.snapshotText ?? '',
        marks: eq.snapshotMarks ?? 0,
        options:
          eq.snapshotType === 'mcq' ? opts.map((o) => ({ id: o.id, text: o.text })) : undefined,
      };
    });

    const paper: Paper = {
      examPublicId: exam.publicId,
      title: exam.title,
      instructions: exam.instructions,
      durationMinutes: exam.durationMinutes,
      totalMarks: exam.totalMarks,
      questions,
    };
    await this.redis.setPaper(exam.id, JSON.stringify(paper), this.PAPER_TTL_SEC);
    return paper;
  }

  /** Per-student paper: same content, shuffled deterministically from the attempt id per settings. */
  async getPaperForAttempt(exam: PaperExam, attemptPublicId: string): Promise<Paper> {
    const base = await this.getBasePaper(exam);
    const { shuffleQuestions, shuffleOptions } = exam.settings;
    if (!shuffleQuestions && !shuffleOptions) return base;

    const rnd = mulberry32(hashSeed(attemptPublicId));
    let questions = base.questions;
    if (shuffleQuestions) questions = shuffle(questions, rnd);
    if (shuffleOptions) {
      questions = questions.map((q) =>
        q.options ? { ...q, options: shuffle(q.options, rnd) } : q,
      );
    }
    return { ...base, questions };
  }
}
