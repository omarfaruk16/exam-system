import { useMutation, useQuery } from '@tanstack/react-query';
import type { ExamResultRow } from '@exam/types';
import { AlertCircle, ArrowLeft, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { requestReport, pollReport } from '../reports/reportsApi';
import { StatusPill } from '../shared/StatusPill';
import { fetchExamResultsOverview } from './examResultsApi';

export function ExamResultsPage() {
  const { examPublicId } = useParams<{ examPublicId: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['exam-results', examPublicId],
    queryFn: () => fetchExamResultsOverview(examPublicId!),
    enabled: Boolean(examPublicId),
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="font-medium">Could not load results</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/exam-results')}>
          Back to results
        </Button>
      </div>
    );
  }

  const { exam, counts, rows } = data;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <button
        onClick={() => navigate('/exam-results')}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Back to results
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{exam.title}</h1>
            <StatusPill status={exam.status} />
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {exam.courseCode} · {exam.courseName} · {exam.partName} · Semester {exam.semesterNumber}
          </p>
        </div>
        {examPublicId && <ReportButton examPublicId={examPublicId} />}
      </div>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Enrolled" value={String(counts.total)} />
        <Stat label="Attended" value={String(counts.attempted)} tone="success" />
        <Stat label="Absent" value={String(counts.absent)} tone="muted" />
        <Stat label="Total marks" value={String(exam.totalMarks)} />
      </div>

      {/* Roster — every student, attendance and mark, on one page */}
      <Card className="mt-5 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="px-4 py-2.5 font-medium">Roll</th>
                <th className="px-4 py-2.5 font-medium">Student ID</th>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Batch</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Marks</th>
                <th className="px-4 py-2.5 text-right font-medium">Rank</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RosterRow
                  key={r.studentPublicId}
                  row={r}
                  totalMarks={exam.totalMarks}
                  onView={
                    r.attemptPublicId ? () => navigate(`/results/${r.attemptPublicId}`) : undefined
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function RosterRow({
  row,
  totalMarks,
  onView,
}: {
  row: ExamResultRow;
  totalMarks: number;
  onView?: () => void;
}) {
  const pct = row.percentage != null ? Math.round(row.percentage) : null;
  return (
    <tr className="border-b last:border-0">
      <td className="text-muted-foreground px-4 py-2.5 tabular-nums">{row.rollNumber ?? '—'}</td>
      <td className="px-4 py-2.5 font-medium tabular-nums">{row.studentId}</td>
      <td className="px-4 py-2.5">{row.name}</td>
      <td className="text-muted-foreground px-4 py-2.5">{row.batchName}</td>
      <td className="px-4 py-2.5">
        <AttendanceBadge row={row} />
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        {row.score != null ? (
          <span className="font-medium">
            {row.score} / {totalMarks}
            {pct != null && <span className="text-muted-foreground ml-1.5 text-xs">({pct}%)</span>}
          </span>
        ) : row.attempted ? (
          <span className="text-muted-foreground text-xs italic">Pending</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">{row.rank ?? '—'}</td>
      <td className="px-4 py-2.5 text-right">
        {onView && (
          <Button variant="ghost" size="sm" className="h-7 gap-1.5" onClick={onView}>
            <FileText className="size-3.5" /> Script
          </Button>
        )}
      </td>
    </tr>
  );
}

// ─── Class report (overall) download ───────────────────────────────────────────

function ReportButton({ examPublicId }: { examPublicId: string }) {
  const [phase, setPhase] = useState<'idle' | 'polling' | 'error'>('idle');
  const [links, setLinks] = useState<{ excel: string; pdf: string } | null>(null);

  const pollUntilReady = async (jobId: string) => {
    for (let i = 0; i < 40; i++) {
      await new Promise<void>((r) => setTimeout(r, 2000));
      try {
        const s = await pollReport(jobId);
        if (s.status === 'ready' && s.downloads) {
          setLinks(s.downloads);
          setPhase('idle');
          // Auto-open the Excel download once ready
          window.location.href = s.downloads.excel;
          return;
        }
        if (s.status === 'failed') {
          setPhase('error');
          toast.error(s.message ?? 'Report generation failed.');
          return;
        }
      } catch {
        /* transient — keep polling */
      }
    }
    setPhase('error');
    toast.error('Report took too long. Try again.');
  };

  const mutation = useMutation({
    mutationFn: () => requestReport(examPublicId, 'overall'),
    onSuccess: (jobId) => {
      setPhase('polling');
      void pollUntilReady(jobId);
    },
    onError: () => {
      setPhase('error');
      toast.error('Could not start report generation.');
    },
  });

  if (links) {
    return (
      <div className="flex items-center gap-2">
        <a href={links.excel}>
          <Button variant="outline" size="sm" className="shrink-0">
            <FileSpreadsheet className="size-4" /> Excel
          </Button>
        </a>
        <a href={links.pdf}>
          <Button variant="outline" size="sm" className="shrink-0">
            <FileText className="size-4" /> PDF
          </Button>
        </a>
      </div>
    );
  }

  if (phase === 'polling') {
    return (
      <Button variant="outline" size="sm" disabled className="shrink-0">
        <Loader2 className="size-4 animate-spin" /> Generating report…
      </Button>
    );
  }

  if (phase === 'error') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => mutation.mutate()}
        className="border-destructive text-destructive hover:bg-destructive/10 shrink-0"
      >
        <AlertCircle className="size-4" /> Retry report
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={() => mutation.mutate()} className="shrink-0">
      <Download className="size-4" /> Generate report
    </Button>
  );
}

function AttendanceBadge({ row }: { row: ExamResultRow }) {
  if (!row.attempted) {
    return (
      <span className="text-destructive bg-destructive/10 rounded-full px-2 py-0.5 text-xs font-medium">
        Absent
      </span>
    );
  }
  const label =
    row.attemptStatus === 'in_progress'
      ? 'In progress'
      : row.gradingStatus === 'awaiting_manual' || row.gradingStatus === 'grading'
        ? 'Grading'
        : 'Attended';
  const tone =
    row.attemptStatus === 'in_progress'
      ? 'text-warning bg-warning/10'
      : label === 'Grading'
        ? 'text-blue-700 bg-blue-500/10 dark:text-blue-300'
        : 'text-success bg-success/10';
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', tone)}>{label}</span>;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'muted';
}) {
  return (
    <Card className="p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-xl font-semibold tabular-nums',
          tone === 'success' && 'text-success',
          tone === 'muted' && 'text-muted-foreground',
        )}
      >
        {value}
      </p>
    </Card>
  );
}
