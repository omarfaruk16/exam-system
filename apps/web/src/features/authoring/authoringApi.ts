import type {
  BankQuestion,
  DeptBankRow,
  ExamDetail,
  ExamListItem,
  ExamQuestionItem,
  ExamSettings,
  MarksMatrix,
  PartOption,
  QuestionBankSummary,
} from '@exam/types';
import { api } from '@/lib/api';

// ── Exams ──
export const fetchExams = () => api.get<ExamListItem[]>('/exams');

export const fetchDeptExams = (departmentPublicId: string) =>
  api.get<ExamListItem[]>(`/exams?department=${encodeURIComponent(departmentPublicId)}`);

export const fetchDeptBankSummary = (departmentPublicId: string) =>
  api.get<DeptBankRow[]>(
    `/question-banks/by-department?dept=${encodeURIComponent(departmentPublicId)}`,
  );

export const fetchExam = (publicId: string) => api.get<ExamDetail>(`/exams/${publicId}`);

export const fetchExamQuestions = (publicId: string) =>
  api.get<ExamQuestionItem[]>(`/exams/${publicId}/questions`);

export const fetchMyParts = () => api.get<PartOption[]>('/exams/my/parts');

/** Parts the current user may author into — teacher (assigned) or admin/head (in scope). */
export const fetchAuthorableParts = () => api.get<PartOption[]>('/exams/authorable/parts');

export const fetchMarksMatrix = (partPublicId: string) =>
  api.get<MarksMatrix>(`/exams/parts/${encodeURIComponent(partPublicId)}/marks-matrix`);

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

export const updateBank = (bankPublicId: string, name: string) =>
  api.patch<QuestionBankSummary>(`/question-banks/${encodeURIComponent(bankPublicId)}`, { name });

export const deleteBank = (bankPublicId: string) =>
  api.del<{ status: string }>(`/question-banks/${encodeURIComponent(bankPublicId)}`);

export const fetchBankQuestions = (bankPublicId: string) =>
  api.get<BankQuestion[]>(`/questions?bank=${encodeURIComponent(bankPublicId)}`);

export const fetchQuestionsByPart = (coursePartPublicId: string) =>
  api.get<BankQuestion[]>(`/questions?part=${encodeURIComponent(coursePartPublicId)}`);

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

export type UpdateQuestionInput = {
  text?: string;
  marks?: number;
  explanation?: string;
  modelAnswer?: string;
  options?: { text: string; isCorrect: boolean; order: number }[];
};

export const updateQuestion = (publicId: string, input: UpdateQuestionInput) =>
  api.patch<BankQuestion>(`/questions/${publicId}`, input);

/** Download all questions in a chapter as an xlsx file and trigger browser save. */
export async function downloadExport(bankPublicId: string, chapterName: string): Promise<void> {
  const { blob, filename } = await api.blob(
    `/questions/export?bank=${encodeURIComponent(bankPublicId)}`,
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `${chapterName.replace(/[^a-z0-9]/gi, '_')}_questions.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download the blank question template xlsx. */
export async function downloadTemplate(): Promise<void> {
  const { blob, filename } = await api.blob('/questions/template');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'question_template.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

/** Upload an xlsx file to import questions into a chapter. */
export const importQuestions = (bankPublicId: string, file: File): Promise<{ jobId: string }> => {
  const form = new FormData();
  form.append('file', file);
  return api.upload<{ jobId: string }>(
    `/questions/import?bank=${encodeURIComponent(bankPublicId)}`,
    form,
  );
};

/** Poll import job status. */
export const fetchImportStatus = (jobId: string) =>
  api.get<import('@exam/types').ImportJobState>(`/questions/import/${jobId}`);
