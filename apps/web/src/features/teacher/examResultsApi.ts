import type { ExamResultsOverview, LiveExamOverview, TeacherConductedExam } from '@exam/types';
import { api } from '@/lib/api';

/** Per-exam review roster: every enrolled student's attendance + mark. */
export const fetchExamResultsOverview = (publicId: string) =>
  api.get<ExamResultsOverview>(`/exams/${publicId}/results`);

/** Conducted exams for the Results portal, each tagged with its batch / session. */
export const fetchConductedResults = () =>
  api.get<TeacherConductedExam[]>('/exams/my/conducted-results');

/** Live invigilation: which students are currently sitting the exam right now. */
export const fetchLiveOverview = (publicId: string) =>
  api.get<LiveExamOverview>(`/exams/${publicId}/live`);

/** Invigilator force-submits a student's in-progress attempt. */
export const forceSubmitAttempt = (publicId: string, attemptPublicId: string) =>
  api.post<{ status: 'ok' }>(`/exams/${publicId}/live/${attemptPublicId}/submit`);

/** Invigilator marks a currently-attempting student absent (voids their attempt). */
export const markAttemptAbsent = (publicId: string, attemptPublicId: string) =>
  api.post<{ status: 'ok' }>(`/exams/${publicId}/live/${attemptPublicId}/absent`);
