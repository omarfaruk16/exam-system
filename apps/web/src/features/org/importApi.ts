import type { ImportJobState } from '@exam/types';
import { api } from '@/lib/api';

export type ImportEntity =
  'students' | 'teachers' | 'departments' | 'courses' | 'faculties' | 'semesters';

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

export const templateUrl = (entity: ImportEntity, format: 'xlsx' | 'csv' = 'xlsx') =>
  `${API_BASE}/imports/templates/${entity}${format === 'csv' ? '?format=csv' : ''}`;
export const errorReportUrl = (jobId: string) => `${API_BASE}/imports/${jobId}/errors`;

export type ExportFormat = 'xlsx' | 'csv';

/**
 * Download URL for exporting existing data. Structure entities go through /org/export/:type;
 * teachers and students have their own routes (with an optional department/batch filter).
 */
export const exportUrl = (
  entity: ImportEntity,
  format: ExportFormat = 'xlsx',
  filter?: string,
): string => {
  const q = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (format === 'csv') params.set('format', 'csv');
    for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `?${s}` : '';
  };
  if (entity === 'teachers') return `${API_BASE}/org/teachers/export${q({ department: filter })}`;
  if (entity === 'students') return `${API_BASE}/org/students/export${q({ batch: filter })}`;
  return `${API_BASE}/org/export/${entity}${q({})}`;
};
