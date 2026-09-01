import { useMutation, useQuery } from '@tanstack/react-query';
import type { AttemptResultQuestion } from '@exam/types';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MathText } from '@/components/ui/math-text';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fetchAttemptResult, pollReport, requestReport } from './resultsApi';

export function ResultPage() {
  const { attemptPublicId } = useParams<{ attemptPublicId: string }>();
  const navigate = useNavigate();

  // Return to the immediate previous page (teacher's exam roster, results list,
  // or my-exams). Falls back to /my-exams on a fresh load with no history.
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/my-exams');
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['result', attemptPublicId],
    queryFn: () => fetchAttemptResult(attemptPublicId!),
    enabled: Boolean(attemptPublicId),
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <ResultSkeleton />;

  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <BackLink onClick={goBack} />
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <AlertCircle className="text-destructive size-8" />
          <p className="font-medium">Result unavailable</p>
          <p className="text-muted-foreground text-sm">
            {error instanceof Error ? error.message : 'Could not load the result.'}
          </p>
        </Card>
      </div>
    );
  }

  // Mode B — results withheld by teacher
  if (!data.showMarks) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <BackLink onClick={goBack} />
        <Card className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="bg-muted flex size-14 items-center justify-center rounded-full">
            <Award className="text-muted-foreground size-7" />
          </div>
          <p className="text-lg font-semibold">Exam submitted</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Your exam has been submitted. Results will be released by your teacher.
          </p>
        </Card>
      </div>
    );
  }

  // Mode A — full breakdown
  const pct = data.percentage != null ? Math.round(data.percentage) : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <BackLink onClick={goBack} />

      {/* Score header */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Your result
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular-nums">{data.totalScore ?? 0}</span>
              <span className="text-muted-foreground text-xl">/ {data.totalMarks}</span>
              {pct != null && <span className="text-muted-foreground text-sm">({pct}%)</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {data.rank != null && data.totalStudents != null && (
                <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium">
                  <Award className="size-3" />
                  Rank {data.rank} / {data.totalStudents}
                </span>
              )}
              {data.submittedAt && (
                <span className="text-muted-foreground text-xs">
                  Submitted{' '}
                  {new Date(data.submittedAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
          </div>

          {data.myStudentPublicId && data.examPublicId && (
            <MarkSheetButton
              examPublicId={data.examPublicId}
              studentPublicId={data.myStudentPublicId}
            />
          )}
        </div>
      </Card>

      {/* Per-question breakdown */}
      {data.questions && data.questions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            Question breakdown
          </h2>
          {data.questions.map((q, i) => (
            <QuestionRow key={q.questionPublicId} q={q} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Mark-sheet download ───────────────────────────────────────────────────────

function MarkSheetButton({
  examPublicId,
  studentPublicId,
}: {
  examPublicId: string;
  studentPublicId: string;
}) {
  const [phase, setPhase] = useState<'idle' | 'polling' | 'ready' | 'error'>('idle');

  const pollUntilReady = async (jobId: string) => {
    const MAX = 30;
    for (let i = 0; i < MAX; i++) {
      await new Promise<void>((r) => setTimeout(r, 2000));
      try {
        const s = await pollReport(jobId);
        if (s.status === 'ready' && s.downloads?.excel) {
          setPhase('ready');
          window.location.href = s.downloads.excel;
          return;
        }
        if (s.status === 'failed') {
          setPhase('error');
          toast.error('Mark sheet generation failed.');
          return;
        }
      } catch {
        // transient network error — keep polling
      }
    }
    setPhase('error');
    toast.error('Mark sheet took too long. Try again.');
  };

  const mutation = useMutation({
    mutationFn: () => requestReport(examPublicId, studentPublicId),
    onSuccess: (jobId) => {
      setPhase('polling');
      void pollUntilReady(jobId);
    },
    onError: () => {
      setPhase('error');
      toast.error('Could not generate the mark sheet.');
    },
  });

  if (phase === 'idle') {
    return (
      <Button variant="outline" size="sm" onClick={() => mutation.mutate()} className="shrink-0">
        <Download className="size-4" />
        Download mark sheet
      </Button>
    );
  }
  if (phase === 'polling') {
    return (
      <Button variant="outline" size="sm" disabled className="shrink-0">
        <Loader2 className="size-4 animate-spin" />
        Generating…
      </Button>
    );
  }
  if (phase === 'ready') {
    return (
      <Button variant="outline" size="sm" disabled className="shrink-0">
        <Download className="size-4" />
        Downloaded
      </Button>
    );
  }
  // error state
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setPhase('idle')}
      className="border-destructive text-destructive hover:bg-destructive/10 shrink-0"
    >
      <AlertCircle className="size-4" />
      Retry download
    </Button>
  );
}

// ─── Question row ──────────────────────────────────────────────────────────────

function QuestionRow({ q, index }: { q: AttemptResultQuestion; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const isMcq = q.type === 'mcq';
  const selectedOption = isMcq
    ? (q.snapshotOptions ?? []).find((o) => o.id === q.selectedOptionId)
    : null;
  const isCorrect = isMcq && q.selectedOptionId != null && q.selectedOptionId === q.correctOptionId;
  const isWrong = isMcq && q.selectedOptionId != null && q.selectedOptionId !== q.correctOptionId;
  const correctOption = isMcq
    ? (q.snapshotOptions ?? []).find((o) => o.id === q.correctOptionId)
    : null;

  const scoreColor =
    q.score != null && q.marks != null
      ? q.score === q.marks
        ? 'text-success'
        : q.score === 0
          ? 'text-destructive'
          : 'text-amber-600 dark:text-amber-400'
      : '';

  return (
    <Card className="overflow-hidden">
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
            {index + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  isMcq
                    ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
                    : 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
                )}
              >
                {isMcq ? 'MCQ' : 'Written'}
              </span>
              <span className={cn('ml-auto text-sm font-semibold tabular-nums', scoreColor)}>
                {q.score ?? '—'} / {q.marks ?? '—'}
              </span>
            </div>

            {/* Question text — 2-line clamp, expandable */}
            <div className={cn('mt-2 text-sm leading-relaxed', !expanded && 'line-clamp-2')}>
              <MathText text={q.snapshotText ?? ''} />
            </div>
            {q.snapshotText && q.snapshotText.length > 120 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-muted-foreground mt-0.5 flex items-center gap-0.5 text-xs hover:underline"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="size-3" /> Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-3" /> Show more
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* MCQ answer display */}
        {isMcq && (
          <div className="ml-11 mt-4 space-y-2">
            {q.selectedOptionId == null ? (
              <p className="text-muted-foreground text-sm italic">No answer selected.</p>
            ) : (
              <div
                className={cn(
                  'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
                  isCorrect && 'border-success/40 bg-success/10 text-success',
                  isWrong && 'border-destructive/40 bg-destructive/10 text-destructive',
                )}
              >
                <span className="mt-0.5 font-medium">{isCorrect ? '✓' : '✗'}</span>
                <span>
                  {selectedOption ? <MathText text={selectedOption.text} /> : q.selectedOptionId}
                </span>
              </div>
            )}
            {/* Correct answer revealed when student was wrong */}
            {isWrong && correctOption && (
              <div className="border-success/40 bg-success/10 text-success flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="mt-0.5 font-medium">✓</span>
                <span>
                  <MathText text={correctOption.text} />
                </span>
              </div>
            )}
          </div>
        )}

        {/* Written answer */}
        {!isMcq && q.writtenText && (
          <div className="bg-muted/40 ml-11 mt-4 rounded-lg border p-3">
            <p className="text-muted-foreground mb-1 text-xs font-medium">Your answer</p>
            <div className="whitespace-pre-wrap text-sm">
              <MathText text={q.writtenText} />
            </div>
          </div>
        )}

        {/* Teacher feedback */}
        {q.feedback && (
          <div className="border-primary/20 bg-primary/5 ml-11 mt-3 rounded-lg border px-3 py-2 text-sm">
            <p className="text-muted-foreground mb-0.5 text-xs font-medium">Teacher feedback</p>
            <div>
              <MathText text={q.feedback} />
            </div>
          </div>
        )}

        {/* Explanation — MCQ only, inline callout, not a modal */}
        {isMcq && q.explanation && (
          <div className="bg-muted/40 ml-11 mt-3 rounded-lg border px-3 py-2 text-sm">
            <p className="text-muted-foreground mb-0.5 text-xs font-medium">Explanation</p>
            <div>
              <MathText text={q.explanation} />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
    >
      <ArrowLeft className="size-4" /> Back
    </button>
  );
}

function ResultSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}
