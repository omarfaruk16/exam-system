import type {
  AutosaveResponse,
  MyExamListItem,
  ServerTime,
  StartAttemptResponse,
  SubmitResult,
} from '@exam/types';
import { api } from '@/lib/api';

export interface AnswerPayload {
  questionPublicId: string;
  selectedOptionId?: string | null;
  writtenText?: string | null;
}

export const startExam = (examPublicId: string) =>
  api.post<StartAttemptResponse>(`/exams/${examPublicId}/start`);

export const autosave = (attemptId: string, sessionId: string, answers: AnswerPayload[]) =>
  api.post<AutosaveResponse>(
    `/attempts/${attemptId}/answers`,
    { answers },
    { headers: { 'X-Exam-Session': sessionId } },
  );

export const submitAttempt = (attemptId: string, sessionId: string, idempotencyKey: string) =>
  api.post<SubmitResult>(`/attempts/${attemptId}/submit`, undefined, {
    headers: { 'X-Exam-Session': sessionId, 'X-Idempotency-Key': idempotencyKey },
  });

export const fetchServerTime = () => api.get<ServerTime>('/time');

export const fetchMyExams = () => api.get<MyExamListItem[]>('/me/exams');
