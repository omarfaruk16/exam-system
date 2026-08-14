import { useQuery } from '@tanstack/react-query';
import type { MyExamListItem } from '@exam/types';
import { CalendarClock, GraduationCap, Timer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchMyExams } from '../exam-taking/api';
import { StatusPill } from '../shared/StatusPill';

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function MyExamsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['my-exams'], queryFn: fetchMyExams });

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">My exams</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Exams for your batch. Live exams can be started; results appear once published.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <GraduationCap className="text-muted-foreground size-8" />
          <p className="font-medium">No exams yet</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            When your teacher publishes an exam for your batch, it will appear here.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {data.map((exam) => (
            <ExamRow
              key={exam.examPublicId}
              exam={exam}
              onStart={() => navigate(`/exam/${exam.examPublicId}`)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ExamRow({ exam, onStart }: { exam: MyExamListItem; onStart: () => void }) {
  const takeable =
    exam.status === 'live' && (!exam.attempt || exam.attempt.status === 'in_progress');
  const submitted = exam.attempt && exam.attempt.status !== 'in_progress';

  return (
    <li>
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-semibold">{exam.title}</h2>
            <StatusPill status={exam.status} />
            {exam.attempt && <StatusPill status={exam.attempt.status} />}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {exam.courseCode} · {exam.part}
          </p>
          <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-3.5" /> {fmt(exam.startAt)} — {fmt(exam.endAt)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Timer className="size-3.5" /> {exam.durationMinutes} min
            </span>
          </div>
        </div>
        <div className="shrink-0">
          {takeable ? (
            <Button onClick={onStart}>
              {exam.attempt?.status === 'in_progress' ? 'Resume exam' : 'Start exam'}
            </Button>
          ) : submitted ? (
            <Button variant="outline" disabled>
              {exam.status === 'results_published' ? 'View result' : 'Submitted'}
            </Button>
          ) : (
            <Button variant="outline" disabled>
              {exam.status === 'published' ? 'Not open yet' : 'Closed'}
            </Button>
          )}
        </div>
      </Card>
    </li>
  );
}
