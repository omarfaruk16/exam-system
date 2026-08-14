import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PendingWrittenGroup } from '@exam/types';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { fetchPending, gradeAnswer } from './gradingApi';

interface QueueItem {
  questionPublicId: string;
  questionText: string;
  maxMarks: number;
  answerPublicId: string;
  studentId: string;
  studentName: string;
  writtenText: string | null;
}

function buildQueue(groups: PendingWrittenGroup[]): QueueItem[] {
  const items: QueueItem[] = [];
  for (const g of groups) {
    for (const a of g.pending) {
      items.push({
        questionPublicId: g.questionPublicId,
        questionText: g.text ?? '',
        maxMarks: g.maxMarks ?? 0,
        answerPublicId: a.answerPublicId,
        studentId: a.studentId,
        studentName: a.studentName,
        writtenText: a.writtenText,
      });
    }
  }
  return items;
}

export function GradingWorkspace() {
  const { examPublicId } = useParams<{ examPublicId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['pending', examPublicId],
    queryFn: () => fetchPending(examPublicId!),
    enabled: Boolean(examPublicId),
    refetchOnWindowFocus: false,
  });

  const queue = useMemo(() => (data ? buildQueue(data) : []), [data]);
  const total = queue.length;

  const [index, setIndex] = useState(0);
  const [graded, setGraded] = useState(0);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');

  const current = queue[index];
  const max = current?.maxMarks ?? 0;
  const scoreNum = Number(score);
  const valid =
    score.trim() !== '' && Number.isFinite(scoreNum) && scoreNum >= 0 && scoreNum <= max;
  const showError = score.trim() !== '' && !valid;

  const mutation = useMutation({
    mutationFn: () =>
      gradeAnswer(current!.answerPublicId, {
        manualScore: scoreNum,
        feedback: feedback.trim() || undefined,
      }),
    onSuccess: () => {
      setGraded((g) => g + 1);
      setScore('');
      setFeedback('');
      setIndex((i) => i + 1);
      void qc.invalidateQueries({ queryKey: ['exams-to-grade'] });
    },
    onError: (e) => {
      toast.error(e instanceof ApiError ? e.message : 'Could not save the grade');
    },
  });

  const submit = () => {
    if (!valid || mutation.isPending) return;
    mutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const done = total === 0 || index >= total;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <button
        onClick={() => navigate('/grading')}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Back to exams
      </button>

      {/* Progress */}
      <div className="mb-6">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="font-medium">Written grading</span>
          <span className="text-muted-foreground tabular-nums">
            {graded} of {total} graded
          </span>
        </div>
        <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${total === 0 ? 100 : (graded / total) * 100}%` }}
          />
        </div>
      </div>

      {done ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <div className="bg-success/10 flex size-14 items-center justify-center rounded-full">
            <CheckCircle2 className="text-success size-8" />
          </div>
          <p className="text-lg font-semibold">All answers graded</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Results will be published automatically once every attempt in this exam is fully graded.
          </p>
          <Button className="mt-2" onClick={() => navigate('/grading')}>
            Back to exams
          </Button>
        </Card>
      ) : current ? (
        <Card className="p-6">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {current.studentName} · {current.studentId}
          </p>
          <h2 className="text-foreground mb-4 mt-1 text-lg leading-relaxed">
            {current.questionText}
          </h2>

          <div className="bg-muted/40 mb-6 rounded-lg border p-4">
            <p className="text-muted-foreground mb-1 text-xs font-medium">Student's answer</p>
            <p className="whitespace-pre-wrap">
              {current.writtenText || <span className="text-muted-foreground italic">(blank)</span>}
            </p>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="score">Score (0–{max})</Label>
              <Input
                id="score"
                type="number"
                inputMode="decimal"
                min={0}
                max={max}
                step="0.5"
                value={score}
                autoFocus
                onChange={(e) => setScore(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                  }
                }}
                aria-invalid={showError}
                className="w-32"
              />
              {showError && (
                <p className="text-destructive text-sm">Enter a score between 0 and {max}.</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="feedback">Feedback (optional)</Label>
              <Textarea
                id="feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Optional note for the student…"
                className="min-h-[96px]"
              />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs">
                Press <kbd className="bg-muted rounded border px-1.5 py-0.5">Enter</kbd> in the
                score field to save &amp; advance.
              </p>
              <Button onClick={submit} disabled={!valid || mutation.isPending}>
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Save &amp; next
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
