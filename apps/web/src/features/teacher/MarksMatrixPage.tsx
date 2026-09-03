import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MarkingMetric } from '@exam/types';
import { ArrowLeft, CheckCircle2, Loader2, Send, TableProperties } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fetchMarksMatrix } from '@/features/authoring/authoringApi';
import { fetchPartSummary, finalizePart } from '@/features/marking/markingApi';

const METRIC_OPTIONS: { key: MarkingMetric; label: string; hint: string }[] = [
  {
    key: 'averageAll',
    label: 'Average of all exams',
    hint: 'Mean of every exam the student sat, as a percentage.',
  },
  {
    key: 'bestOne',
    label: 'Best one',
    hint: 'The student’s single highest exam percentage.',
  },
  {
    key: 'bestTwoAverage',
    label: 'Average of best two',
    hint: 'Mean of the student’s two highest exam percentages.',
  },
];
const METRIC_LABEL: Record<MarkingMetric, string> = {
  averageAll: 'Average of all exams',
  bestOne: 'Best one',
  bestTwoAverage: 'Average of best two',
};

export function MarksMatrixPage() {
  const { partPublicId } = useParams<{ partPublicId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['marks-matrix', partPublicId],
    queryFn: () => fetchMarksMatrix(partPublicId!),
    enabled: Boolean(partPublicId),
  });

  // Finalized state (whether the final report has been sent to admin).
  const summaryQuery = useQuery({
    queryKey: ['part-summary', partPublicId],
    queryFn: () => fetchPartSummary(partPublicId!),
    enabled: Boolean(partPublicId),
  });

  const [sendOpen, setSendOpen] = useState(false);
  const [metric, setMetric] = useState<MarkingMetric>('bestTwoAverage');

  const finalize = useMutation({
    mutationFn: (m: MarkingMetric) => finalizePart(partPublicId!, m),
    onSuccess: async (res) => {
      toast.success(
        `Final report sent to admin — ${METRIC_LABEL[res.metric]} · ${res.students} students`,
      );
      setSendOpen(false);
      await qc.invalidateQueries({ queryKey: ['part-summary', partPublicId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not send the final report'),
  });

  // Pre-select the previously-sent metric when re-opening the dialog.
  function openSend() {
    if (summaryQuery.data?.sentMetric) setMetric(summaryQuery.data.sentMetric);
    setSendOpen(true);
  }

  if (isLoading) {
    return (
      <div className="w-full space-y-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="font-medium">Could not load the marks sheet</p>
        <button
          onClick={() => navigate(-1)}
          className="text-primary mt-4 inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" /> Go back
        </button>
      </div>
    );
  }

  const { part, exams, rows, hasBestTwo } = data;
  const fmt = (n: number | null) =>
    n == null ? '—' : Number.isInteger(n) ? String(n) : n.toFixed(1);

  return (
    <div className="mx-auto w-full">
      <button
        onClick={() => navigate(-1)}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Back
      </button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TableProperties className="text-primary size-5 shrink-0" />
            <h1 className="text-2xl font-semibold tracking-tight">Marks Sheet</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            <span className="font-mono">{part.courseCode}</span> · {part.courseName} ·{' '}
            {part.partName} · {part.semesterLabel}
            {part.batch && <> · Session {part.batch}</>}
          </p>
        </div>

        {/* Send final report to admin (item 2) — choose which aggregate to send. */}
        {exams.length > 0 && (
          <div className="flex flex-col items-end gap-1.5">
            <Button onClick={openSend} disabled={finalize.isPending}>
              {finalize.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {summaryQuery.data?.finalized ? 'Re-send final report' : 'Send final report to admin'}
            </Button>
            {summaryQuery.data?.finalized && summaryQuery.data.finalizedAt && (
              <span className="text-success inline-flex items-center gap-1 text-xs">
                <CheckCircle2 className="size-3.5" /> Sent{' '}
                {new Date(summaryQuery.data.finalizedAt).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
                {summaryQuery.data.sentMetric && (
                  <span className="text-muted-foreground">
                    · {METRIC_LABEL[summaryQuery.data.sentMetric]}
                  </span>
                )}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Which aggregate to send? */}
      <Dialog open={sendOpen} onOpenChange={(o) => !finalize.isPending && setSendOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send final report to admin</DialogTitle>
            <DialogDescription>
              Choose which mark to submit for every student in this course part. This is what the
              admin final-marking sheet will show — you can re-send to change it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {METRIC_OPTIONS.map((m) => (
              <label
                key={m.key}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                  metric === m.key ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                )}
              >
                <input
                  type="radio"
                  name="send-metric"
                  className="accent-primary mt-0.5 size-4 shrink-0"
                  checked={metric === m.key}
                  onChange={() => setMetric(m.key)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="text-muted-foreground block text-xs">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSendOpen(false)}
              disabled={finalize.isPending}
            >
              Cancel
            </Button>
            <Button onClick={() => finalize.mutate(metric)} disabled={finalize.isPending}>
              {finalize.isPending && <Loader2 className="size-4 animate-spin" />}
              <Send className="size-4" /> Send to admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* What "final report" sends: per-student % aggregates across this part's exams. */}
      {exams.length > 0 && (
        <p className="text-muted-foreground mb-4 text-xs">
          Sending the final report submits each student’s{' '}
          <span className="font-medium">average of all exams</span>,{' '}
          <span className="font-medium">best one</span>, and{' '}
          <span className="font-medium">average of the best two</span> (as percentages) to the admin
          final-marking sheet.
        </p>
      )}

      {exams.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="bg-muted flex size-14 items-center justify-center rounded-full">
            <TableProperties className="text-muted-foreground size-7" />
          </div>
          <p className="font-medium">No completed exams yet</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Once an exam for this course part has ended and been graded, its marks appear here.
          </p>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-medium">No students enrolled</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            No batch is currently assigned to this course's semester, so there are no students to
            show.
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
                  <th className="bg-card sticky left-0 z-0 min-w-[160px] px-3 py-2.5 font-medium">
                    Name
                  </th>
                  {exams.map((e) => (
                    <th key={e.publicId} className="px-3 py-2.5 text-right font-medium">
                      <div className="whitespace-nowrap">{e.title}</div>
                      <div className="text-muted-foreground/70 text-[10px] font-normal">
                        {new Date(e.date).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                        })}{' '}
                        · /{e.totalMarks}
                      </div>
                    </th>
                  ))}
                  <th className="bg-primary/5 px-3 py-2.5 text-right font-semibold">Average</th>
                  <th className="bg-primary/5 px-3 py-2.5 text-right font-semibold">Best</th>
                  {hasBestTwo && (
                    <th className="bg-primary/5 px-3 py-2.5 text-right font-semibold">
                      <div>Best two</div>
                      <div className="text-muted-foreground/70 text-[10px] font-normal">
                        average
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.studentPublicId}
                    className={cn('border-b last:border-0', i % 2 === 1 && 'bg-muted/30')}
                  >
                    <td className="text-muted-foreground sticky left-0 bg-inherit px-3 py-2 tabular-nums">
                      {r.rollNumber ?? '—'}
                    </td>
                    <td className="px-3 py-2 font-medium tabular-nums">{r.studentId}</td>
                    <td className="bg-inherit px-3 py-2">{r.name}</td>
                    {exams.map((e) => {
                      const v = r.scores[e.publicId];
                      const isBest =
                        v != null && r.best != null && v === r.best && exams.length > 1;
                      return (
                        <td
                          key={e.publicId}
                          className={cn(
                            'px-3 py-2 text-right tabular-nums',
                            v == null && 'text-muted-foreground',
                            isBest && 'text-success font-medium',
                          )}
                        >
                          {v == null ? '—' : fmt(v)}
                        </td>
                      );
                    })}
                    <td className="bg-primary/5 px-3 py-2 text-right font-medium tabular-nums">
                      {fmt(r.average)}
                    </td>
                    <td className="bg-primary/5 text-success px-3 py-2 text-right font-medium tabular-nums">
                      {fmt(r.best)}
                    </td>
                    {hasBestTwo && (
                      <td className="bg-primary/5 px-3 py-2 text-right font-medium tabular-nums">
                        {fmt(r.bestTwoAverage)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="text-muted-foreground mt-3 text-xs">
        Scores are raw exam marks. Average is the mean of a student's achieved scores;
        {hasBestTwo ? ' Best two is the average of their two highest scores.' : ''} Absent exams
        show as “—”.
      </p>
    </div>
  );
}
