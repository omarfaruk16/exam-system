import type {
  CoursePartSummary,
  MarkingFilterOptions,
  MarkingFilters,
  MarkingMatrix,
  MarkingMetric,
} from '@exam/types';
import { api } from '@/lib/api';

/** One course part's live rollup + finalized state (teacher preview). */
export const fetchPartSummary = (partPublicId: string) =>
  api.get<CoursePartSummary>(`/marking/parts/${encodeURIComponent(partPublicId)}/summary`);

/**
 * Teacher/admin submits the part's final report to admin, choosing which aggregate
 * (average of all / best one / average of best two) the admin marking sheet will show.
 */
export const finalizePart = (partPublicId: string, metric: MarkingMetric) =>
  api.post<{ status: string; metric: MarkingMetric; students: number; examsTotal: number }>(
    `/marking/parts/${encodeURIComponent(partPublicId)}/finalize`,
    { metric },
  );

/** Cascading filter options, narrowed by the current selection above each selector. */
export const fetchMarkingFilters = (filters: MarkingFilters) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
  const qs = q.toString();
  return api.get<MarkingFilterOptions>(`/marking/filters${qs ? `?${qs}` : ''}`);
};

/** The admin final-marking matrix (parts × students). Each cell shows the metric the teacher sent. */
export const fetchMarkingMatrix = (filters: MarkingFilters) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
  const qs = q.toString();
  return api.get<MarkingMatrix>(`/marking/matrix${qs ? `?${qs}` : ''}`);
};

/** Download the final-marking matrix as an xlsx file and trigger the browser save. */
export async function downloadMarkingXlsx(filters: MarkingFilters): Promise<void> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
  const qs = q.toString();
  const { blob, filename } = await api.blob(`/marking/matrix/export${qs ? `?${qs}` : ''}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'final-marking.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
