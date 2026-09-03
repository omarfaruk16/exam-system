import { useQuery } from '@tanstack/react-query';
import type { MarkingFilters } from '@exam/types';
import { Download, Loader2, SlidersHorizontal, TableProperties } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { downloadMarkingXlsx, fetchMarkingFilters, fetchMarkingMatrix } from './markingApi';

// The cascading selector order — picking one clears everything to its right.
const LEVELS = ['faculty', 'department', 'program', 'batch', 'semester', 'course'] as const;
type Level = (typeof LEVELS)[number];
const LEVEL_LABEL: Record<Level, string> = {
  faculty: 'Faculty',
  department: 'Department',
  program: 'Programme',
  batch: 'Session',
  semester: 'Semester',
  course: 'Course',
};

export function FinalMarkingPage() {
  const [filters, setFilters] = useState<MarkingFilters>({});
  const [exporting, setExporting] = useState(false);

  const optionsQuery = useQuery({
    queryKey: ['marking-filters', filters],
    queryFn: () => fetchMarkingFilters(filters),
  });

  const matrixQuery = useQuery({
    queryKey: ['marking-matrix', filters],
    queryFn: () => fetchMarkingMatrix(filters),
  });

  function selectLevel(level: Level, value: string) {
    // Set this level and clear every level to its right (cascading reset).
    const next: MarkingFilters = { ...filters };
    const idx = LEVELS.indexOf(level);
    for (let i = idx; i < LEVELS.length; i++) delete next[LEVELS[i]!];
    if (value) next[level] = value;
    setFilters(next);
  }

  const opts = optionsQuery.data;
  const optionsFor = (level: Level) => {
    switch (level) {
      case 'faculty':
        return opts?.faculties ?? [];
      case 'department':
        return opts?.departments ?? [];
      case 'program':
        return opts?.programs ?? [];
      case 'batch':
        return opts?.batches ?? [];
      case 'semester':
        return opts?.semesters ?? [];
      case 'course':
        return opts?.courses ?? [];
    }
  };
  // A selector unlocks once its parent is chosen (faculty is always open).
  const enabledFor = (level: Level): boolean => {
    switch (level) {
      case 'faculty':
        return true;
      case 'department':
        return Boolean(filters.faculty);
      case 'program':
        return Boolean(filters.department);
      case 'batch':
      case 'semester':
        return Boolean(filters.program);
      case 'course':
        return Boolean(filters.semester);
    }
  };

  const matrix = matrixQuery.data;

  async function handleExport() {
    setExporting(true);
    try {
      await downloadMarkingXlsx(filters);
    } catch {
      toast.error('Could not export the marking sheet');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="w-full">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TableProperties className="text-primary size-5" />
            <h1 className="text-2xl font-semibold tracking-tight">Final Marking</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Consolidated results across every course part. Each part shows the mark its teacher
            chose to send — narrow the scope below; the sheet reads pre-computed rollups, so it
            stays fast at any size.
          </p>
        </div>
        {matrix && matrix.rows.length > 0 && (
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Export xlsx
          </Button>
        )}
      </header>

      {/* Cascading selectors */}
      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-center gap-1.5">
          <SlidersHorizontal className="text-muted-foreground size-3.5" />
          <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            Scope
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {LEVELS.map((level) => (
            <label key={level} className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">{LEVEL_LABEL[level]}</span>
              <select
                value={filters[level] ?? ''}
                disabled={!enabledFor(level)}
                onChange={(e) => selectLevel(level, e.target.value)}
                className={cn(
                  'border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2',
                  !enabledFor(level) && 'cursor-not-allowed opacity-50',
                )}
              >
                <option value="">All</option>
                {optionsFor(level).map((o) => (
                  <option key={o.publicId} value={o.publicId}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        {matrix && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">
              {matrix.rows.length} student{matrix.rows.length === 1 ? '' : 's'} ·{' '}
              {matrix.columns.length} part{matrix.columns.length === 1 ? '' : 's'}
            </span>
            {matrix.pendingColumns > 0 && (
              <span className="text-warning">
                · {matrix.pendingColumns} awaiting a teacher’s final report
              </span>
            )}
          </div>
        )}
      </Card>

      {/* Matrix */}
      {matrixQuery.isLoading ? (
        <Card className="flex items-center justify-center gap-2 py-16 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading marks…
        </Card>
      ) : !matrix || matrix.columns.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <TableProperties className="text-muted-foreground size-7" />
          <p className="font-medium">No course parts in this scope</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Choose a programme and semester above, or broaden the scope. Only parts whose teacher
            has sent a final report show marks.
          </p>
        </Card>
      ) : matrix.rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="font-medium">No students in this scope</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            No batch is assigned to these semesters yet, so there are no students to show.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="bg-card sticky left-0 z-10 px-3 py-2.5 font-medium">Roll</th>
                  <th className="px-3 py-2.5 font-medium">Student ID</th>
                  <th className="px-3 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Session</th>
                  {matrix.columns.map((c) => (
                    <th key={c.partPublicId} className="px-3 py-2.5 text-right font-medium">
                      <div className="whitespace-nowrap">
                        {c.courseCode} · {c.partName}
                      </div>
                      <div className="text-muted-foreground/70 flex items-center justify-end gap-1 text-[10px] font-normal">
                        {c.finalized ? (
                          <span className="text-success">● {c.sentMetricLabel}</span>
                        ) : (
                          <span className="text-warning">○ pending</span>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="bg-primary/5 px-3 py-2.5 text-right font-semibold">Overall</th>
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((r, i) => (
                  <tr
                    key={r.studentPublicId}
                    className={cn('border-b last:border-0', i % 2 === 1 && 'bg-muted/30')}
                  >
                    <td className="text-muted-foreground sticky left-0 bg-inherit px-3 py-2 tabular-nums">
                      {r.rollNumber ?? '—'}
                    </td>
                    <td className="px-3 py-2 font-medium tabular-nums">{r.studentId}</td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="text-muted-foreground px-3 py-2 text-xs">{r.batch}</td>
                    {matrix.columns.map((c) => {
                      const v = r.cells[c.partPublicId];
                      return (
                        <td
                          key={c.partPublicId}
                          className={cn(
                            'px-3 py-2 text-right tabular-nums',
                            v == null && 'text-muted-foreground',
                          )}
                        >
                          {v == null ? '—' : `${v}%`}
                        </td>
                      );
                    })}
                    <td className="bg-primary/5 px-3 py-2 text-right font-semibold tabular-nums">
                      {r.overall == null ? '—' : `${r.overall}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="text-muted-foreground mt-3 text-xs">
        Values are percentages. Each column shows the mark the part’s teacher chose to send (● with
        the metric name); ○ pending parts are awaiting the teacher’s final report. “Overall” is the
        mean of the sent marks across the student’s parts.
      </p>
    </div>
  );
}
