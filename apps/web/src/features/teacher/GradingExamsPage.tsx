import { useQuery } from '@tanstack/react-query';
import type { ExamToGrade } from '@exam/types';
import { CheckCircle2, ClipboardCheck, PenLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '../shared/StatusPill';
import { fetchExamsToGrade } from './gradingApi';

export function GradingExamsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['exams-to-grade'],
    queryFn: fetchExamsToGrade,
  });

  const awaiting = (data ?? []).filter((e) => e.pendingCount > 0);
  const done = (data ?? []).filter((e) => e.pendingCount === 0);

  return (
    <div className="w-full">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Grading</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Written answers awaiting your marks. Results publish automatically once every answer is
          graded.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : awaiting.length === 0 && done.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <ClipboardCheck className="text-muted-foreground size-8" />
          <p className="font-medium">Nothing to grade</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            When students submit exams with written questions, they will appear here for marking.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {awaiting.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                Awaiting grading
              </h2>
              {awaiting.map((exam) => (
                <ExamRow
                  key={exam.examPublicId}
                  exam={exam}
                  onOpen={() => navigate(`/grading/${exam.examPublicId}`)}
                />
              ))}
            </section>
          )}
          {done.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                Completed
              </h2>
              {done.map((exam) => (
                <ExamRow
                  key={exam.examPublicId}
                  exam={exam}
                  onOpen={() => navigate(`/grading/${exam.examPublicId}`)}
                  done
                />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ExamRow({
  exam,
  onOpen,
  done,
}: {
  exam: ExamToGrade;
  onOpen: () => void;
  done?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-semibold">{exam.title}</h3>
          <StatusPill status={exam.status} />
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {exam.courseCode} · {exam.part}
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm">
          {done ? (
            <span className="text-success inline-flex items-center gap-1.5">
              <CheckCircle2 className="size-4" /> All answers graded
            </span>
          ) : (
            <span className="text-warning inline-flex items-center gap-1.5 font-medium">
              <PenLine className="size-4" /> {exam.pendingCount} answer
              {exam.pendingCount === 1 ? '' : 's'} to grade
            </span>
          )}
        </p>
      </div>
      <Button variant={done ? 'outline' : 'default'} onClick={onOpen}>
        {done ? 'Review' : 'Grade answers'}
      </Button>
    </Card>
  );
}
