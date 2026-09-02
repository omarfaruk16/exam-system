import { useQuery } from '@tanstack/react-query';
import type { StudentExamResult, StudentSemesterResult } from '@exam/types';
import { Award, BarChart3, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fetchMyResults } from './resultsApi';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function StudentResultsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['my-results'],
    queryFn: fetchMyResults,
  });

  if (isLoading) {
    return (
      <div className="w-full space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const groups = data ?? [];

  return (
    <div className="w-full">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">My Results</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Exam history and scores, grouped by semester.
        </p>
      </header>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="bg-muted flex size-16 items-center justify-center rounded-full">
            <BarChart3 className="text-muted-foreground size-8" />
          </div>
          <p className="font-medium">No results yet</p>
          <p className="text-muted-foreground max-w-xs text-sm">
            Completed exams with published results will appear here, organised by semester.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <SemesterSection
              key={g.semester.number}
              group={g}
              onView={(attemptId) => navigate(`/results/${attemptId}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SemesterSection({
  group,
  onView,
}: {
  group: StudentSemesterResult;
  onView: (attemptId: string) => void;
}) {
  const semLabel = group.semester.name ?? `Semester ${group.semester.number}`;
  const totalExams = group.exams.length;
  const graded = group.exams.filter((e) => e.score != null && e.showMarks);
  const avgPct =
    graded.length > 0
      ? Math.round(graded.reduce((s, e) => s + (e.percentage ?? 0), 0) / graded.length)
      : null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{semLabel}</h2>
          <p className="text-muted-foreground text-xs">{group.programName}</p>
        </div>
        {avgPct != null && (
          <div className="flex items-center gap-1.5">
            <Award className="text-muted-foreground size-3.5" />
            <span className="text-muted-foreground text-xs">
              Avg {avgPct}% across {totalExams} exam{totalExams !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="px-4 py-2.5 font-medium">Course</th>
                <th className="px-4 py-2.5 font-medium">Exam</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 text-right font-medium">Score</th>
                <th className="px-4 py-2.5 text-right font-medium">%</th>
                <th className="px-4 py-2.5 text-right font-medium">Rank</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {group.exams.map((exam) => (
                <ExamRow
                  key={exam.attemptPublicId}
                  exam={exam}
                  onView={() => onView(exam.attemptPublicId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

function ExamRow({ exam, onView }: { exam: StudentExamResult; onView: () => void }) {
  const pct = exam.percentage != null ? Math.round(exam.percentage) : null;
  const hasResult = exam.score != null && exam.showMarks;
  const awaitingGrading =
    exam.gradingStatus === 'awaiting_manual' || exam.gradingStatus === 'grading';

  const scoreColor =
    pct == null
      ? ''
      : pct >= 80
        ? 'text-success'
        : pct >= 50
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-destructive';

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-2.5">
        <span className="font-mono text-xs font-medium">{exam.courseCode}</span>
        <span className="text-muted-foreground ml-1.5 text-xs">{exam.courseName}</span>
      </td>
      <td className="px-4 py-2.5">
        <p className="font-medium">{exam.title}</p>
        <p className="text-muted-foreground text-xs">{exam.partName}</p>
      </td>
      <td className="text-muted-foreground px-4 py-2.5 text-xs tabular-nums">
        {exam.submittedAt ? fmtDate(exam.submittedAt) : fmtDate(exam.startAt)}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        {hasResult ? (
          <span className={cn('font-semibold', scoreColor)}>
            {exam.score} / {exam.totalMarks}
          </span>
        ) : awaitingGrading ? (
          <span className="text-muted-foreground flex items-center justify-end gap-1 text-xs">
            <Loader2 className="size-3 animate-spin" /> Grading
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">Pending</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        {pct != null && exam.showMarks ? (
          <span className={cn('text-sm font-medium', scoreColor)}>{pct}%</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="text-muted-foreground px-4 py-2.5 text-right tabular-nums">
        {exam.rank ?? '—'}
      </td>
      <td className="px-4 py-2.5 text-right">
        {hasResult && (
          <Button variant="ghost" size="sm" className="h-7" onClick={onView}>
            View
          </Button>
        )}
      </td>
    </tr>
  );
}
