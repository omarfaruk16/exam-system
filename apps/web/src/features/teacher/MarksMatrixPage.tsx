import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, TableProperties } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fetchMarksMatrix } from '@/features/authoring/authoringApi';

export function MarksMatrixPage() {
  const { partPublicId } = useParams<{ partPublicId: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['marks-matrix', partPublicId],
    queryFn: () => fetchMarksMatrix(partPublicId!),
    enabled: Boolean(partPublicId),
  });

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
      </div>

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
