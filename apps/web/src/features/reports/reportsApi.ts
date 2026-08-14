import type { ReportJobStatus, RosterStudent } from '@exam/types';
import { api } from '@/lib/api';

export const fetchRoster = (examPublicId: string) =>
  api.get<RosterStudent[]>(`/exams/${examPublicId}/roster`);

export async function requestReport(
  examPublicId: string,
  type: 'overall' | 'individual',
  studentPublicId?: string,
): Promise<string> {
  const { jobId } = await api.post<{ jobId: string }>('/reports', {
    examPublicId,
    type,
    ...(studentPublicId ? { studentPublicId } : {}),
  });
  return jobId;
}

export const pollReport = (jobId: string) => api.get<ReportJobStatus>(`/reports/${jobId}`);
