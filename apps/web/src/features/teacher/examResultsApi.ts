import type { ExamResultsOverview, TeacherConductedExam } from '@exam/types';
import { api } from '@/lib/api';

/** Per-exam review roster: every enrolled student's attendance + mark. */
export const fetchExamResultsOverview = (publicId: string) =>
  api.get<ExamResultsOverview>(`/exams/${publicId}/results`);

/** Conducted exams for the Results portal, each tagged with its batch / session. */
export const fetchConductedResults = () =>
  api.get<TeacherConductedExam[]>('/exams/my/conducted-results');
