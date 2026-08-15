import type { ImportJobState } from '@exam/types';
import { api } from '@/lib/api';

export type ImportEntity = 'students' | 'teachers' | 'departments' | 'courses';

const API_BASE = '/api/v1';

/** Multipart upload (the JSON api client can't send FormData). Returns the job id. */
async function uploadFile(path: string, file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as { jobId?: string; message?: string }) : {};
  if (!res.ok) throw new Error(data.message ?? `Upload failed (${res.status})`);
  return data.jobId!;
}

export const uploadStudents = (file: File, batchPublicId: string) =>
  uploadFile(`/imports/students?batch=${encodeURIComponent(batchPublicId)}`, file);

export const uploadEntity = (entity: Exclude<ImportEntity, 'students'>, file: File) =>
  uploadFile(`/imports/${entity}`, file);

export const fetchImportState = (jobId: string) => api.get<ImportJobState>(`/imports/${jobId}`);

export const templateUrl = (entity: ImportEntity) => `${API_BASE}/imports/templates/${entity}`;
export const errorReportUrl = (jobId: string) => `${API_BASE}/imports/${jobId}/errors`;
