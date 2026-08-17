import { useQuery } from '@tanstack/react-query';
import type { ExamListItem } from '@exam/types';
import { BarChart3, CalendarClock, ChevronRight, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '../shared/StatusPill';
import { fetchExams } from '../authoring/authoringApi';

// Exams that have been (or are being) conducted — the ones with a roster to review.
const CONDUCTED = ['live', 'ended', 'grading', 'results_published'];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ResultsPortalPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['authoring-exams'], queryFn: fetchExams });

  const exams = (data ?? []).filter((e) => CONDUCTED.includes(e.status));

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Results</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Past and ongoing exams. Open one to see every student, who attended, and their marks.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : exams.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <BarChart3 className="text-muted-foreground size-8" />
          <p className="font-medium">No conducted exams yet</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Once an exam goes live and students sit it, it appears here with the full mark sheet.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => (
            <ExamRow
              key={exam.publicId}
              exam={exam}
              onOpen={() => navigate(`/exam-results/${exam.publicId}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ExamRow({ exam, onOpen }: { exam: ExamListItem; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="w-full text-left">
      <Card className="hover:border-primary/40 flex items-center justify-between gap-4 p-5 transition-colors">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">{exam.title}</h3>
            <StatusPill status={exam.status} />
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {exam.courseCode} · {exam.part}
          </p>
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-3.5" />
              {formatDate(exam.startAt)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" />
              {exam.totalMarks} marks · {exam.durationMinutes} min
            </span>
          </div>
        </div>
        <ChevronRight className="text-muted-foreground size-5 shrink-0" />
      </Card>
    </button>
  );
}
