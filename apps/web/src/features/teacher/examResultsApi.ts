import type { ExamResultsOverview } from '@exam/types';
import { api } from '@/lib/api';

/** Per-exam review roster: every enrolled student's attendance + mark. */
export const fetchExamResultsOverview = (publicId: string) =>
  api.get<ExamResultsOverview>(`/exams/${publicId}/results`);
