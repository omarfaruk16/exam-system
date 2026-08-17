import type { ExamDetail } from '@exam/types';
import { api } from '@/lib/api';

export const approveExam = (publicId: string) => api.post<ExamDetail>(`/exams/${publicId}/approve`);

export const requestChanges = (publicId: string, note: string) =>
  api.post<ExamDetail>(`/exams/${publicId}/request-changes`, { note });

export const rejectExam = (publicId: string, note?: string) =>
  api.post<ExamDetail>(`/exams/${publicId}/reject`, note ? { note } : undefined);

/** approved → published. Snapshots questions and makes the exam visible to students. */
export const publishExam = (publicId: string) => api.post<ExamDetail>(`/exams/${publicId}/publish`);
