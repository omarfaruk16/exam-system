import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExamQuestionItem } from '@exam/types';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Loader2,
  Pencil,
  Send,
  ThumbsDown,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { fetchExam, fetchExamQuestions } from '../authoring/authoringApi';
import { MathText } from '@/components/ui/math-text';
import { ChangesRequestedBanner } from '../shared/ChangesRequestedBanner';
import { StatusPill } from '../shared/StatusPill';
import { ExamMetadataEdit } from './ExamMetadataEdit';
import { approveExam, publishExam, rejectExam, requestChanges } from './reviewApi';

export function ReviewDetailPage() {
  const { examPublicId } = useParams<{ examPublicId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: user } = useSession();
  const isAdmin = (user?.roles ?? []).some((r) => r.role === 'admin' || r.role === 'super_admin');

  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<null | 'approve' | 'changes' | 'reject'>(null);
  const [note, setNote] = useState('');

  const examQuery = useQuery({
    queryKey: ['authoring-exam', examPublicId],
    queryFn: () => fetchExam(examPublicId!),
    enabled: Boolean(examPublicId),
  });
  const questionsQuery = useQuery({
    queryKey: ['exam-questions', examPublicId],
    queryFn: () => fetchExamQuestions(examPublicId!),
    enabled: Boolean(examPublicId),
  });

  const afterAction = async () => {
    await qc.invalidateQueries({ queryKey: ['authoring-exams'] });
    navigate('/review');
  };

  const approve = useMutation({
    mutationFn: () => approveExam(examPublicId!),
    onSuccess: async () => {
      toast.success('Exam approved');
      await afterAction();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not approve'),
  });
  const changes = useMutation({
    mutationFn: () => requestChanges(examPublicId!, note.trim()),
    onSuccess: async () => {
      toast.success('Changes requested');
      await afterAction();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not request changes'),
  });
  const reject = useMutation({
    mutationFn: () => rejectExam(examPublicId!, note.trim() || undefined),
    onSuccess: async () => {
      toast.success('Exam rejected');
      await afterAction();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not reject'),
  });
  const publish = useMutation({
    mutationFn: () => publishExam(examPublicId!),
    onSuccess: async () => {
      toast.success('Exam published — students can now see it');
      await afterAction();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not publish'),
  });

  if (examQuery.isLoading || !examPublicId) return <DetailSkeleton />;
  if (examQuery.error || !examQuery.data) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="font-medium">Exam not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/review')}>
          Back to queue
        </Button>
      </div>
    );
  }

  const exam = examQuery.data;
  const questions = questionsQuery.data ?? [];
  const canAct = isAdmin && (exam.status === 'in_review' || exam.status === 'changes_requested');
  const canEdit =
    isAdmin && ['draft', 'in_review', 'approved', 'changes_requested'].includes(exam.status);
  const canPublish = isAdmin && exam.status === 'approved';

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <button
        onClick={() => navigate('/review')}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Back to queue
      </button>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{exam.title}</h1>
        <StatusPill status={exam.status} />
      </div>

      {exam.status === 'changes_requested' && <ChangesRequestedBanner note={exam.reviewNote} />}

      {/* Metadata */}
      {editing ? (
        <ExamMetadataEdit exam={exam} onDone={() => setEditing(false)} />
      ) : (
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <h2 className="text-sm font-semibold">Exam details</h2>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
            )}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Detail
              label="Course part"
              value={`${exam.coursePart.course.code} · ${exam.coursePart.name}`}
            />
            <Detail label="Duration" value={`${exam.durationMinutes} min`} />
            <Detail label="Starts" value={fmt(exam.startAt)} />
            <Detail label="Ends" value={fmt(exam.endAt)} />
            <Detail label="Total marks" value={String(exam.totalMarks)} />
            <Detail label="Created by" value={exam.createdBy.user.displayName} />
          </dl>
          {exam.instructions && (
            <div className="mt-4">
              <p className="text-muted-foreground text-xs">Instructions</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm">{exam.instructions}</p>
            </div>
          )}
          <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {settingSummary(exam.settings).map((s) => (
              <span key={s}>· {s}</span>
            ))}
          </div>
        </Card>
      )}

      {/* Questions with correct answers visible */}
      <div className="space-y-3">
        <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Questions ({questions.length})
        </h2>
        {questionsQuery.isLoading ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : (
          questions.map((q, i) => <ReviewQuestion key={q.publicId} q={q} index={i} />)
        )}
      </div>

      {/* Publish — approved exams are invisible to students until published */}
      {canPublish && !editing && (
        <div className="bg-card sticky bottom-0 flex flex-col gap-3 border-t py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            This exam is approved but{' '}
            <span className="font-medium">not yet visible to students</span>. Publish it so it
            appears in their exam list.
          </p>
          <Button onClick={() => publish.mutate()} disabled={publish.isPending}>
            {publish.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Publish to students
          </Button>
        </div>
      )}

      {/* Actions */}
      {canAct && !editing && (
        <div className="bg-card sticky bottom-0 flex flex-wrap justify-end gap-2 border-t py-4">
          <Button
            variant="outline"
            onClick={() => {
              setNote('');
              setDialog('reject');
            }}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <XCircle className="size-4" /> Reject
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setNote('');
              setDialog('changes');
            }}
          >
            <ThumbsDown className="size-4" /> Request changes
          </Button>
          <Button onClick={() => setDialog('approve')}>
            <CheckCircle2 className="size-4" /> Approve
          </Button>
        </div>
      )}

      {/* Approve confirm */}
      <Dialog open={dialog === 'approve'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve this exam?</DialogTitle>
            <DialogDescription>
              It will move to “approved” and become ready to publish.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
              {approve.isPending && <Loader2 className="size-4 animate-spin" />} Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request changes note */}
      <Dialog open={dialog === 'changes'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request changes</DialogTitle>
            <DialogDescription>
              Leave a note for the teacher explaining what needs to change.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Question 3 has two correct options — please fix."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={() => changes.mutate()} disabled={changes.isPending || !note.trim()}>
              {changes.isPending && <Loader2 className="size-4 animate-spin" />} Send to teacher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject confirm + optional reason */}
      <Dialog open={dialog === 'reject'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this exam?</DialogTitle>
            <DialogDescription>
              Rejection is final — the teacher cannot resubmit this exam. Add an optional reason.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional reason…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => reject.mutate()}
              disabled={reject.isPending}
            >
              {reject.isPending && <Loader2 className="size-4 animate-spin" />} Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReviewQuestion({ q, index }: { q: ExamQuestionItem; index: number }) {
  const isMcq = q.question.type === 'mcq';
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="bg-muted mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase',
                isMcq
                  ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
                  : 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
              )}
            >
              {q.question.type}
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {q.question.marks} marks
            </span>
          </div>
          <p className="mt-2 text-sm">
            <MathText text={q.question.text} />
          </p>

          {isMcq && (
            <ul className="mt-3 space-y-1.5">
              {q.question.options.map((o) => (
                <li
                  key={o.publicId}
                  className={cn(
                    'flex items-start gap-2 rounded-md border px-3 py-1.5 text-sm',
                    o.isCorrect
                      ? 'border-success/40 bg-success/10 text-success'
                      : 'border-transparent',
                  )}
                >
                  {o.isCorrect ? (
                    <Check className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <span className="mt-0.5 w-4 shrink-0" />
                  )}
                  <MathText text={o.text} />
                </li>
              ))}
            </ul>
          )}

          {q.question.explanation && (
            <div className="bg-muted/40 mt-3 rounded-md border px-3 py-2 text-sm">
              <p className="text-muted-foreground mb-0.5 text-xs font-medium">Explanation</p>
              <p>
                <MathText text={q.question.explanation} />
              </p>
            </div>
          )}
          {!isMcq && q.question.modelAnswer && (
            <div className="bg-muted/40 mt-3 rounded-md border px-3 py-2 text-sm">
              <p className="text-muted-foreground mb-0.5 text-xs font-medium">Model answer</p>
              <p className="whitespace-pre-wrap">
                <MathText text={q.question.modelAnswer} />
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function settingSummary(s: import('@exam/types').ExamSettings): string[] {
  const on: string[] = [];
  if (s.shuffleQuestions) on.push('Shuffle questions');
  if (s.shuffleOptions) on.push('Shuffle options');
  if (s.showMarksAfterSubmit) on.push('Show marks');
  if (s.showExplanation) on.push('Show explanations');
  if (s.negativeMarking) on.push(`Negative marking (−${s.negativeMarkValue})`);
  return on.length ? on : ['No special settings'];
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}
