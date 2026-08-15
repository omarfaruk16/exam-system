import { useQuery } from '@tanstack/react-query';
import type { StartAttemptResponse, SubmitResult } from '@exam/types';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Lock, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiError } from '@/lib/api';
import { autosave, startExam, submitAttempt, type AnswerPayload } from './api';
import { idbGetAll, idbPut } from './idb';
import { QuestionNavigator } from './QuestionNavigator';
import { QuestionView } from './QuestionView';
import { useExamClock } from './useExamClock';
import { AutosaveIndicator, Countdown, type SaveState } from './indicators';
import { isAnswered, type AnswerState, type AnswerValue } from './util';

const INSTITUTION =
  (import.meta.env.VITE_INSTITUTION_NAME as string | undefined) ?? 'University of Rajshahi';

export function ExamTakingPage() {
  const { examPublicId } = useParams<{ examPublicId: string }>();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['exam-start', examPublicId],
    queryFn: () => startExam(examPublicId!),
    enabled: Boolean(examPublicId),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 0,
  });

  if (query.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    const msg = query.error instanceof ApiError ? query.error.message : 'Could not start this exam';
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="bg-card w-full max-w-md rounded-xl border p-6 text-center shadow-sm">
          <AlertTriangle className="text-warning mx-auto size-8" />
          <h1 className="mt-3 text-lg font-semibold">Unable to start exam</h1>
          <p className="text-muted-foreground mt-1 text-sm">{msg}</p>
          <Button className="mt-4" variant="outline" onClick={() => navigate('/my-exams')}>
            Back to my exams
          </Button>
        </div>
      </div>
    );
  }
  return <ExamRunner data={query.data} />;
}

function ExamRunner({ data }: { data: StartAttemptResponse }) {
  const navigate = useNavigate();
  const { attempt, sessionId, serverTime, paper } = data;
  const total = paper.questions.length;

  const initialAnswers = useMemo<AnswerState>(() => {
    const map: AnswerState = {};
    for (const a of data.savedAnswers) {
      map[a.questionPublicId] = {
        selectedOptionId: a.selectedOptionId,
        writtenText: a.writtenText,
      };
    }
    return map;
  }, []);

  const [answers, setAnswers] = useState<AnswerState>(initialAnswers);
  const [activeIndex, setActiveIndex] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [locked, setLocked] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [restore, setRestore] = useState<AnswerState | null>(null);

  const clock = useExamClock(attempt.deadline, serverTime);
  const disabled = locked || timeUp || submitting || Boolean(submitted);

  // Idempotency key persists across a refresh so a re-submit is deduped server-side.
  const idemKey = useMemo(() => {
    const k = `exam-idem:${attempt.publicId}`;
    let v = sessionStorage.getItem(k);
    if (!v) {
      v = crypto.randomUUID();
      sessionStorage.setItem(k, v);
    }
    return v;
  }, [attempt.publicId]);

  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  const pendingRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<number | null>(null);
  // Exponential backoff for rate-limit (429) responses on autosave.
  const backoffRef = useRef<number>(2000);

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (locked || Boolean(submitted)) return;
    const ids = [...pendingRef.current];
    if (ids.length === 0) return;
    pendingRef.current.clear();
    const payload: AnswerPayload[] = ids.map((qid) => ({
      questionPublicId: qid,
      selectedOptionId: answersRef.current[qid]?.selectedOptionId ?? null,
      writtenText: answersRef.current[qid]?.writtenText ?? null,
    }));
    setSaveState('saving');
    try {
      await autosave(attempt.publicId, sessionId, payload);
      backoffRef.current = 2000; // reset backoff after a good save
      setSaveState(pendingRef.current.size > 0 ? 'saving' : 'saved');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && e.body?.message === 'SESSION_SUPERSEDED') {
        setLocked(true);
        return;
      }
      if (e instanceof ApiError && e.status === 409) {
        setTimeUp(true);
        return;
      }
      // Rate limited: pause (not a hard error) and retry with exponential backoff.
      if (e instanceof ApiError && e.status === 429) {
        setSaveState('paused');
        ids.forEach((id) => pendingRef.current.add(id));
        const delay = backoffRef.current;
        backoffRef.current = Math.min(delay * 2, 30_000);
        timerRef.current = window.setTimeout(() => void flush(), delay);
        return;
      }
      setSaveState('error');
      // Retry only transient failures (network / 5xx); a 4xx won't fix itself on replay.
      const retryable = !(e instanceof ApiError) || e.status >= 500;
      if (retryable) {
        ids.forEach((id) => pendingRef.current.add(id));
        timerRef.current = window.setTimeout(() => void flush(), 3000);
      }
    }
  }, [attempt.publicId, sessionId, locked, submitted]);

  const scheduleSave = useCallback(
    (qid: string) => {
      pendingRef.current.add(qid);
      setSaveState('saving');
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void flush(), 800);
    },
    [flush],
  );

  const setAnswer = useCallback(
    (qid: string, patch: Partial<AnswerValue>) => {
      setAnswers((prev) => {
        const next = { ...(prev[qid] ?? { selectedOptionId: null, writtenText: null }), ...patch };
        void idbPut(attempt.publicId, qid, { ...next, updatedAt: Date.now() });
        return { ...prev, [qid]: next };
      });
      scheduleSave(qid);
    },
    [attempt.publicId, scheduleSave],
  );

  // Countdown reaching zero locks input; the server sweep auto-submits if the student doesn't.
  useEffect(() => {
    if (clock.expired && !submitted && !timeUp) setTimeUp(true);
  }, [clock.expired, submitted, timeUp]);

  // Warn before leaving an in-progress exam.
  useEffect(() => {
    if (submitted || timeUp) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [submitted, timeUp]);

  // Offer to restore local (IndexedDB) answers that are newer than what the server has.
  useEffect(() => {
    let cancelled = false;
    void idbGetAll(attempt.publicId).then((backup) => {
      if (cancelled) return;
      const diffs: AnswerState = {};
      for (const [qid, b] of Object.entries(backup)) {
        const hasContent = Boolean(b.selectedOptionId) || Boolean(b.writtenText?.trim());
        const server = initialAnswers[qid];
        const differs =
          (server?.selectedOptionId ?? null) !== (b.selectedOptionId ?? null) ||
          (server?.writtenText ?? null) !== (b.writtenText ?? null);
        if (hasContent && differs) {
          diffs[qid] = { selectedOptionId: b.selectedOptionId, writtenText: b.writtenText };
        }
      }
      if (Object.keys(diffs).length > 0) setRestore(diffs);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt.publicId, initialAnswers]);

  const applyRestore = useCallback(() => {
    if (!restore) return;
    setAnswers((prev) => ({ ...prev, ...restore }));
    Object.keys(restore).forEach((qid) => scheduleSave(qid));
    setRestore(null);
    toast.success('Restored your saved answers from this device.');
  }, [restore, scheduleSave]);

  const doSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await flush().catch(() => undefined);
      const res = await submitAttempt(attempt.publicId, sessionId, idemKey);
      setSubmitted(res);
      setShowSubmit(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && e.body?.message === 'SESSION_SUPERSEDED') {
        setLocked(true);
      } else {
        toast.error('Submission failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [attempt.publicId, sessionId, idemKey, flush, submitting]);

  const answeredCount = paper.questions.filter((q) =>
    isAnswered(answers[q.questionPublicId]),
  ).length;
  const unanswered = total - answeredCount;

  // Smooth-scroll to a question by its anchor id (no page navigation).
  const scrollToQuestion = useCallback((index: number) => {
    document
      .getElementById(`question-${index + 1}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Scroll-spy: highlight the navigator button for the question nearest the top of the viewport.
  useEffect(() => {
    if (submitted) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) {
          const n = Number(visible.target.id.replace('question-', ''));
          if (Number.isFinite(n)) setActiveIndex(n - 1);
        }
      },
      { rootMargin: '-96px 0px -55% 0px', threshold: 0 },
    );
    for (let i = 1; i <= total; i++) {
      const el = document.getElementById(`question-${i}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [total, submitted]);

  if (submitted) {
    return (
      <SubmittedScreen
        result={submitted}
        title={paper.title}
        answered={answeredCount}
        total={total}
      />
    );
  }

  return (
    <div className="bg-muted/30 flex min-h-screen flex-col">
      {/* Fixed top bar */}
      <header className="bg-card sticky top-0 z-30 border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
          <span className="text-muted-foreground hidden truncate text-sm font-medium sm:block sm:w-1/4">
            {INSTITUTION}
          </span>
          <h1 className="flex-1 truncate text-center text-sm font-semibold sm:text-base">
            {paper.title}
          </h1>
          <div className="flex w-1/4 justify-end">
            <Countdown remainingMs={clock.remainingMs} />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col-reverse gap-6 px-4 py-6 md:flex-row md:px-6">
        {/* All questions on one scrollable page */}
        <main className="min-w-0 flex-1 space-y-6">
          {paper.questions.map((q, i) => (
            <QuestionView
              key={q.questionPublicId}
              question={q}
              index={i}
              value={answers[q.questionPublicId]}
              disabled={disabled}
              onChange={(patch) => setAnswer(q.questionPublicId, patch)}
            />
          ))}
          <div className="flex justify-end pt-2">
            <Button size="lg" onClick={() => setShowSubmit(true)} disabled={disabled}>
              Submit exam
            </Button>
          </div>
        </main>

        <aside className="w-full shrink-0 md:w-60">
          <div className="bg-card rounded-xl border p-4 shadow-sm md:sticky md:top-20">
            <QuestionNavigator
              questions={paper.questions}
              activeIndex={activeIndex}
              answers={answers}
              onNavigate={scrollToQuestion}
            />
            <Button className="mt-4 w-full" onClick={() => setShowSubmit(true)} disabled={disabled}>
              Submit exam
            </Button>
          </div>
        </aside>
      </div>

      <AutosaveIndicator state={saveState} />

      {/* Submit confirmation (no pre-submit answer review) */}
      <Dialog open={showSubmit} onOpenChange={(o) => !submitting && setShowSubmit(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit exam?</DialogTitle>
            <DialogDescription>
              You have answered {answeredCount} of {total} {total === 1 ? 'question' : 'questions'}.
              {unanswered > 0
                ? ` ${unanswered} ${unanswered === 1 ? 'question is' : 'questions are'} unanswered.`
                : ' Every question is answered.'}
            </DialogDescription>
          </DialogHeader>
          {unanswered > 0 && (
            <p className="text-warning text-sm">
              Once submitted, your answers are final and cannot be changed.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmit(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={doSubmit} disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Submit exam
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore-from-device prompt */}
      <Dialog open={Boolean(restore)} onOpenChange={(o) => !o && setRestore(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="size-5" /> Restore saved answers?
            </DialogTitle>
            <DialogDescription>
              We found {restore ? Object.keys(restore).length : 0} answer(s) saved on this device
              from a previous session. Restore them and re-sync to the server?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestore(null)}>
              Discard
            </Button>
            <Button onClick={applyRestore}>Restore answers</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Session superseded — non-dismissible */}
      <Dialog open={locked}>
        <DialogContent
          showClose={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Lock className="size-5" /> Session locked
            </DialogTitle>
            <DialogDescription>
              This exam was opened on another device. To protect your answers, this session is now
              locked. Continue on the other device, or contact your invigilator.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => navigate('/my-exams')}>
              Back to my exams
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Time-up overlay */}
      {timeUp && !locked && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="bg-card w-full max-w-md rounded-xl border p-6 text-center shadow-lg">
            <Clock className="text-warning mx-auto size-10" />
            <h2 className="mt-3 text-xl font-semibold">Time&apos;s up</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              The exam window has closed. Submit now to finalize — everything already saved is kept.
            </p>
            <Button className="mt-4 w-full" onClick={doSubmit} disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Submit exam
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SubmittedScreen({
  result,
  title,
  answered,
  total,
}: {
  result: SubmitResult;
  title: string;
  answered: number;
  total: number;
}) {
  const navigate = useNavigate();
  return (
    <div className="bg-muted/30 flex min-h-screen items-center justify-center p-4">
      <div className="bg-card w-full max-w-md rounded-xl border p-8 text-center shadow-sm">
        <div className="bg-success/10 mx-auto flex size-14 items-center justify-center rounded-full">
          <CheckCircle2 className="text-success size-8" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Exam submitted</h1>
        <p className="text-muted-foreground mt-1 text-sm">{title}</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {result.autoSubmitted
            ? 'Your exam was submitted automatically when the time ended.'
            : 'Your answers have been recorded.'}
        </p>
        <dl className="bg-muted/40 mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border text-left">
          <div className="bg-card p-3">
            <dt className="text-muted-foreground text-xs">Questions answered</dt>
            <dd className="font-semibold tabular-nums">
              {answered} / {total}
            </dd>
          </div>
          <div className="bg-card p-3">
            <dt className="text-muted-foreground text-xs">Submitted at</dt>
            <dd className="font-semibold">
              {result.submittedAt ? new Date(result.submittedAt).toLocaleTimeString() : '—'}
            </dd>
          </div>
        </dl>
        {/* No answer breakdown here — results are released by the teacher and viewed from My Exams. */}
        <p className="text-muted-foreground mt-6 text-sm">
          Your results will be available once your teacher releases them. You can check back from{' '}
          <span className="font-medium">My Exams</span>.
        </p>
        <Button className="mt-6 w-full" onClick={() => navigate('/my-exams')}>
          Back to my exams
        </Button>
      </div>
    </div>
  );
}
