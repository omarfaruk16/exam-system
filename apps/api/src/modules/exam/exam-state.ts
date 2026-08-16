import type { ExamStatus } from '@prisma/client';

/** The one true set of allowed exam status transitions. Anything else is rejected. */
export const EXAM_TRANSITIONS: Record<ExamStatus, ExamStatus[]> = {
  draft: ['in_review'],
  in_review: ['approved', 'changes_requested', 'rejected'],
  changes_requested: ['draft'],
  rejected: [],
  approved: ['published'],
  published: ['live'],
  live: ['ended'],
  ended: ['grading'],
  grading: ['results_published'],
  results_published: ['archived'],
  archived: [],
};

export function canTransition(from: ExamStatus, to: ExamStatus): boolean {
  return EXAM_TRANSITIONS[from].includes(to);
}

/** Once an exam using a bank question reaches one of these, the question is immutable. */
export const LOCKED_EXAM_STATUSES: readonly ExamStatus[] = [
  'published',
  'live',
  'ended',
  'grading',
  'results_published',
  'archived',
];

/** Pre-publish statuses an admin may still edit exam fields in. */
export const ADMIN_EDITABLE_STATUSES: readonly ExamStatus[] = [
  'draft',
  'in_review',
  'approved',
  'changes_requested',
];
