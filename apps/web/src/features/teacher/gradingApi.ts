import type { ExamToGrade, GradeAnswerResult, PendingWrittenGroup } from '@exam/types';
import { api } from '@/lib/api';

export const fetchExamsToGrade = () => api.get<ExamToGrade[]>('/me/grading/exams');

export const fetchPending = (examPublicId: string) =>
  api.get<PendingWrittenGroup[]>(`/exams/${examPublicId}/answers/pending`);

export const gradeAnswer = (
  answerPublicId: string,
  body: { manualScore: number; feedback?: string },
) => api.patch<GradeAnswerResult>(`/answers/${answerPublicId}/grade`, body);
