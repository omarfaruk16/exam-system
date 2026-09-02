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

/** Teacher/admin submits the part's final report to admin (computes + stamps the rollup). */
export const finalizePart = (partPublicId: string) =>
  api.post<{ status: string; students: number; examsTotal: number }>(
    `/marking/parts/${encodeURIComponent(partPublicId)}/finalize`,
  );

/** Cascading filter options, narrowed by the current selection above each selector. */
export const fetchMarkingFilters = (filters: MarkingFilters) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
  const qs = q.toString();
  return api.get<MarkingFilterOptions>(`/marking/filters${qs ? `?${qs}` : ''}`);
};

/** The admin final-marking matrix (parts × students) for the chosen scope + metric. */
export const fetchMarkingMatrix = (filters: MarkingFilters, metric: MarkingMetric) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
  q.set('metric', metric);
  return api.get<MarkingMatrix>(`/marking/matrix?${q.toString()}`);
};
