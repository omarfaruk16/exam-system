import { useQuery } from '@tanstack/react-query';
import type { ExamListItem } from '@exam/types';
import { ClipboardCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchExams } from '../authoring/authoringApi';
import { StatusPill } from '../shared/StatusPill';

export function ReviewQueuePage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['authoring-exams'], queryFn: fetchExams });
  const queue = (data ?? []).filter(
    (e) => e.status === 'in_review' || e.status === 'changes_requested',
  );

  return (
    <div className="w-full">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Review queue</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Exams submitted by teachers awaiting your review.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : queue.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <ClipboardCheck className="text-muted-foreground size-8" />
          <p className="font-medium">Nothing to review</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            When teachers submit exams for review, they appear here.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {queue.map((exam) => (
            <ReviewRow
              key={exam.publicId}
              exam={exam}
              onOpen={() => navigate(`/review/${exam.publicId}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewRow({ exam, onOpen }: { exam: ExamListItem; onOpen: () => void }) {
  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-semibold">{exam.title}</h3>
          <StatusPill status={exam.status} />
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {exam.courseCode} · {exam.part} · {exam.createdByName}
        </p>
        <p className="text-muted-foreground mt-2 text-xs">
          {exam.questionCount} question{exam.questionCount === 1 ? '' : 's'} · {exam.totalMarks}{' '}
          marks · Updated{' '}
          {new Date(exam.updatedAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
      <Button onClick={onOpen}>Review</Button>
    </Card>
  );
}
