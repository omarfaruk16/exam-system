import { Prisma } from '@prisma/client';

export const questionBankSelect = {
  publicId: true,
  name: true,
  createdAt: true,
  offeringPart: { select: { publicId: true } },
} satisfies Prisma.QuestionBankSelect;

// Authoring-facing question view — includes isCorrect (teacher/admin only; never used for students).
export const questionSelect = {
  publicId: true,
  type: true,
  text: true,
  marks: true,
  explanation: true,
  modelAnswer: true,
  bank: { select: { publicId: true } },
  options: {
    select: { publicId: true, text: true, isCorrect: true, order: true },
    orderBy: { order: 'asc' },
  },
} satisfies Prisma.QuestionSelect;

export const examSelect = {
  publicId: true,
  title: true,
  instructions: true,
  startAt: true,
  endAt: true,
  durationMinutes: true,
  totalMarks: true,
  status: true,
  settings: true,
  reviewNote: true,
  publishedAt: true,
  offeringPart: {
    select: { publicId: true, coursePart: { select: { publicId: true, name: true } } },
  },
  createdBy: { select: { publicId: true, user: { select: { displayName: true } } } },
} satisfies Prisma.ExamSelect;

// Compact projection for the authoring exam list — adds course code, part name, and a question count.
export const examListSelect = {
  publicId: true,
  title: true,
  startAt: true,
  endAt: true,
  durationMinutes: true,
  totalMarks: true,
  status: true,
  reviewNote: true,
  offeringPart: {
    select: {
      coursePart: { select: { name: true } },
      offering: { select: { course: { select: { code: true } } } },
    },
  },
  createdBy: { select: { user: { select: { displayName: true } } } },
  _count: { select: { examQuestions: true } },
} satisfies Prisma.ExamSelect;

// Shows the snapshot (what the exam actually serves once published) alongside the live link.
export const examQuestionSelect = {
  publicId: true,
  order: true,
  marksOverride: true,
  snapshotAt: true,
  snapshotType: true,
  snapshotText: true,
  snapshotMarks: true,
  snapshotExplanation: true,
  snapshotOptions: true,
  question: { select: { publicId: true, type: true, text: true, marks: true } },
} satisfies Prisma.ExamQuestionSelect;
