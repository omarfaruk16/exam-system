import type {
  BankQuestion,
  ExamDetail,
  ExamListItem,
  ExamQuestionItem,
  ExamSettings,
  PartOption,
  QuestionBankSummary,
} from '@exam/types';
import { api } from '@/lib/api';

// ── Exams ──
export const fetchExams = () => api.get<ExamListItem[]>('/exams');

export const fetchExam = (publicId: string) => api.get<ExamDetail>(`/exams/${publicId}`);

export const fetchExamQuestions = (publicId: string) =>
  api.get<ExamQuestionItem[]>(`/exams/${publicId}/questions`);

export const fetchMyParts = () => api.get<PartOption[]>('/exams/my/parts');

export interface ExamMetadataInput {
  title: string;
  instructions?: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  settings: ExamSettings;
}

export const createExam = (input: ExamMetadataInput & { coursePartPublicId: string }) =>
  api.post<ExamDetail>('/exams', input);

export const updateExam = (publicId: string, input: ExamMetadataInput) =>
  api.patch<ExamDetail>(`/exams/${publicId}`, input);

export const deleteExam = (publicId: string) => api.del<{ status: string }>(`/exams/${publicId}`);

export const submitExam = (publicId: string) => api.post<ExamDetail>(`/exams/${publicId}/submit`);

export const reviseExam = (publicId: string) => api.post<ExamDetail>(`/exams/${publicId}/revise`);

// ── Exam questions ──
export const addExamQuestion = (
  examPublicId: string,
  input: { questionPublicId: string; order: number; marksOverride?: number },
) => api.post<ExamQuestionItem>(`/exams/${examPublicId}/questions`, input);

export const removeExamQuestion = (examPublicId: string, examQuestionPublicId: string) =>
  api.del<{ status: string }>(`/exams/${examPublicId}/questions/${examQuestionPublicId}`);

export const reorderExamQuestions = (examPublicId: string, order: string[]) =>
  api.patch<ExamQuestionItem[]>(`/exams/${examPublicId}/questions/reorder`, { order });

// ── Question banks ──
export const fetchBanks = (coursePartPublicId: string) =>
  api.get<QuestionBankSummary[]>(`/question-banks?part=${encodeURIComponent(coursePartPublicId)}`);

export const createBank = (coursePartPublicId: string, name: string) =>
  api.post<QuestionBankSummary>('/question-banks', { coursePartPublicId, name });

export const fetchBankQuestions = (bankPublicId: string) =>
  api.get<BankQuestion[]>(`/questions?bank=${encodeURIComponent(bankPublicId)}`);

export interface CreateQuestionInput {
  bankPublicId: string;
  type: 'mcq' | 'written';
  text: string;
  marks: number;
  explanation?: string;
  modelAnswer?: string;
  options?: { text: string; isCorrect: boolean; order: number }[];
}

export const createQuestion = (input: CreateQuestionInput) =>
  api.post<BankQuestion>('/questions', input);
