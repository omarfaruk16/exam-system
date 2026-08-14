import type { AttemptResult, MyExamListItem } from '@exam/types';
import { api } from '@/lib/api';

export function fetchMyExams(): Promise<MyExamListItem[]> {
  return api.get('/me/exams');
}

export function fetchAttemptResult(attemptPublicId: string): Promise<AttemptResult> {
  return api.get(`/attempts/${attemptPublicId}/result`);
}

export interface ReportStatus {
  status: 'pending' | 'ready' | 'failed';
  downloads?: { excel: string; pdf: string };
  message?: string;
}

export async function requestReport(
  examPublicId: string,
  studentPublicId: string,
): Promise<string> {
  const { jobId } = await api.post<{ jobId: string }>('/reports', {
    examPublicId,
    type: 'individual',
    studentPublicId,
  });
  return jobId;
}

export function pollReport(jobId: string): Promise<ReportStatus> {
  return api.get(`/reports/${jobId}`);
}
