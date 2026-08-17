import { useQuery } from '@tanstack/react-query';
import type { MyExamListItem } from '@exam/types';
import { Award, BookOpen, Clock, Loader2, PenLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusPill } from '../shared/StatusPill';
import { StartCountdown } from '../shared/ExamCountdown';
import { useServerNow } from '../shared/useServerNow';
import { fetchMyExams } from './resultsApi';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function groupExams(exams: MyExamListItem[]) {
  const upcoming: MyExamListItem[] = [];
  const inProgress: MyExamListItem[] = [];
  const completed: MyExamListItem[] = [];

  for (const e of exams) {
    const hasActiveAttempt = e.attempt?.status === 'in_progress';
    if (e.status === 'live' && hasActiveAttempt) {
      inProgress.push(e);
    } else if (e.status === 'live' && !e.attempt) {
      inProgress.push(e);
    } else if (e.status === 'published') {
      upcoming.push(e);
    } else {
      completed.push(e);
    }
  }
  return { upcoming, inProgress, completed };
}

export function MyExamsPage() {
  const navigate = useNavigate();
  const nowMs = useServerNow();
  const { data, isLoading } = useQuery({
    queryKey: ['my-exams'],
    queryFn: fetchMyExams,
    // Poll so a published→live flip (server scheduler, ~60s) turns the Start
    // button on without the student needing to refresh.
    refetchInterval: 20_000,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  const exams = data ?? [];

  if (exams.length === 0) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">My Exams</h1>
        </header>
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <svg
            width="120"
            height="120"
            viewBox="0 0 120 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect x="20" y="10" width="80" height="100" rx="6" className="fill-muted" />
            <rect x="35" y="28" width="50" height="6" rx="3" className="fill-muted-foreground/30" />
            <rect x="35" y="42" width="40" height="6" rx="3" className="fill-muted-foreground/20" />
            <rect x="35" y="56" width="45" height="6" rx="3" className="fill-muted-foreground/20" />
            <rect x="35" y="70" width="30" height="6" rx="3" className="fill-muted-foreground/15" />
            <circle
              cx="82"
              cy="86"
              r="22"
              className="fill-background stroke-muted"
              strokeWidth="2"
            />
            <path
              d="M74 86l6 6 10-10"
              className="stroke-muted-foreground/40"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-foreground font-medium">No exams yet</p>
          <p className="text-muted-foreground max-w-xs text-sm">
            When your teacher publishes an exam for your batch, it will appear here.
          </p>
        </div>
      </div>
    );
  }

  const { upcoming, inProgress, completed } = groupExams(exams);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">My Exams</h1>
        <p className="text-muted-foreground mt-1 text-sm">All exams for your enrolled courses.</p>
      </header>

      <div className="space-y-8">
        {inProgress.length > 0 && (
          <Section title="In Progress">
            {inProgress.map((e) => (
              <ExamCard
                key={e.examPublicId}
                exam={e}
                nowMs={nowMs}
                onAction={() => navigate(`/exam/${e.examPublicId}`)}
              />
            ))}
          </Section>
        )}
        {upcoming.length > 0 && (
          <Section title="Upcoming">
            {upcoming.map((e) => (
              <ExamCard key={e.examPublicId} exam={e} nowMs={nowMs} />
            ))}
          </Section>
        )}
        {completed.length > 0 && (
          <Section title="Completed">
            {completed.map((e) => (
              <ExamCard
                key={e.examPublicId}
                exam={e}
                nowMs={nowMs}
                onAction={
                  e.attempt && e.status === 'results_published' && e.showMarksAfterSubmit
                    ? () => navigate(`/results/${e.attempt!.publicId}`)
                    : undefined
                }
              />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ExamCard({
  exam,
  nowMs,
  onAction,
}: {
  exam: MyExamListItem;
  nowMs: number;
  onAction?: () => void;
}) {
  const { attempt, status, showMarksAfterSubmit } = exam;
  const isLive = status === 'live';
  const isUpcoming = status === 'published';
  const isResultsPublished = status === 'results_published';
  const hasAttempt = attempt !== null;
  const submitted = hasAttempt && attempt.status !== 'in_progress';

  const startAtMs = new Date(exam.startAt).getTime();
  const beforeStart = nowMs < startAtMs;

  const completionState = (() => {
    if (!hasAttempt && (status === 'ended' || status === 'grading' || isResultsPublished)) {
      return 'did-not-attempt';
    }
    if (!submitted) return null;
    if (!showMarksAfterSubmit && !isResultsPublished) return 'awaiting-release';
    if (isResultsPublished && showMarksAfterSubmit) return 'results-available';
    if (attempt?.gradingStatus === 'awaiting_manual') return 'awaiting-grading';
    if (attempt?.gradingStatus === 'grading') return 'grading-in-progress';
    return 'awaiting-release';
  })();

  // The Start button is only ever active while the exam is live (the server
  // rejects a start attempt otherwise). Upcoming exams show it disabled.
  const canStart = isLive && !submitted && Boolean(onAction);
  const showStartDisabled = isUpcoming;
  const showResult = completionState === 'results-available' && Boolean(onAction);
  const showAction = canStart || showStartDisabled || showResult;

  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{exam.title}</h3>
          <StatusPill status={exam.status} />
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {exam.courseCode} · {exam.part}
        </p>

        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {formatDate(exam.startAt)}
          </span>
          <span>
            {exam.durationMinutes} min · {exam.totalMarks} marks
          </span>
        </div>

        {/* Upcoming: a live countdown to the start time (amber < 5 min, red < 1 min) */}
        {isUpcoming && (
          <div className="mt-3 text-sm">
            {beforeStart ? (
              <StartCountdown startAtMs={startAtMs} nowMs={nowMs} />
            ) : (
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin" />
                Opening the exam — this can take up to a minute…
              </span>
            )}
          </div>
        )}

        {/* Live: reassure the student they can begin now */}
        {isLive && !submitted && (
          <p className="text-success mt-3 flex items-center gap-1.5 text-sm font-medium">
            <Clock className="size-3.5" />
            The exam is open — you can start now.
          </p>
        )}

        {/* Completion state messaging */}
        <div className="mt-3">
          {completionState === 'did-not-attempt' && (
            <p className="text-muted-foreground text-sm italic">You did not attempt this exam.</p>
          )}
          {completionState === 'results-available' && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">
                {attempt!.totalScore ?? 0} / {exam.totalMarks}
                {exam.totalMarks > 0 && (
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    ({Math.round(((attempt!.totalScore ?? 0) / exam.totalMarks) * 100)}%)
                  </span>
                )}
              </span>
              <BookOpen className="text-muted-foreground size-3.5" />
            </div>
          )}
          {completionState === 'awaiting-grading' && (
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <PenLine className="size-3.5" />
              Your written answers are being graded.
            </p>
          )}
          {completionState === 'grading-in-progress' && (
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <Loader2 className="size-3.5 animate-spin" />
              Grading in progress.
            </p>
          )}
          {completionState === 'awaiting-release' && (
            <p className="text-muted-foreground text-sm">
              Results will be available once published by your teacher.
            </p>
          )}
        </div>
      </div>

      {showAction && (
        <div className="shrink-0">
          {canStart ? (
            <Button size="sm" onClick={onAction} className="flex items-center gap-1.5">
              {attempt?.status === 'in_progress' ? 'Resume' : 'Start exam'}
            </Button>
          ) : showStartDisabled ? (
            <Button size="sm" disabled title="You can start once the exam begins">
              Start exam
            </Button>
          ) : showResult ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onAction}
              className="flex items-center gap-1.5"
            >
              <Award className="size-3.5" />
              View result
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}
