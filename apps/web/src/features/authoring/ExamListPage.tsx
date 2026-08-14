import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExamListItem } from '@exam/types';
import { CalendarClock, FileText, Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { ChangesRequestedBanner } from '../shared/ChangesRequestedBanner';
import { StatusPill } from '../shared/StatusPill';
import { deleteExam, fetchExams, reviseExam } from './authoringApi';

interface Bucket {
  key: string;
  label: string;
  statuses: string[];
}

// Order matters — actionable buckets first, terminal ones last.
const BUCKETS: Bucket[] = [
  { key: 'changes', label: 'Needs changes', statuses: ['changes_requested'] },
  { key: 'draft', label: 'Drafts', statuses: ['draft'] },
  { key: 'review', label: 'In review', statuses: ['in_review'] },
  { key: 'approved', label: 'Approved', statuses: ['approved'] },
  { key: 'live', label: 'Published & live', statuses: ['published', 'live'] },
  {
    key: 'done',
    label: 'Ended & archived',
    statuses: ['ended', 'grading', 'results_published', 'archived', 'rejected'],
  },
];

export function ExamListPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['authoring-exams'], queryFn: fetchExams });

  const grouped = BUCKETS.map((b) => ({
    ...b,
    items: (data ?? []).filter((e) => b.statuses.includes(e.status)),
  })).filter((b) => b.items.length > 0);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Exams</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Create, edit, and submit your examinations for review.
          </p>
        </div>
        <Button onClick={() => navigate('/exams/new')}>
          <Plus className="size-4" />
          New Exam
        </Button>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState onCreate={() => navigate('/exams/new')} />
      ) : (
        <div className="space-y-8">
          {grouped.map((b) => (
            <section key={b.key} className="space-y-3">
              <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                {b.label}
              </h2>
              {b.items.map((exam) => (
                <ExamCard key={exam.publicId} exam={exam} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ExamCard({ exam }: { exam: ExamListItem }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const revise = useMutation({
    mutationFn: () => reviseExam(exam.publicId),
    onSuccess: () => navigate(`/exams/${exam.publicId}/build`),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not reopen the exam'),
  });

  const remove = useMutation({
    mutationFn: () => deleteExam(exam.publicId),
    onSuccess: async () => {
      toast.success('Exam deleted');
      setConfirmDelete(false);
      await qc.invalidateQueries({ queryKey: ['authoring-exams'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete the exam'),
  });

  const isDraft = exam.status === 'draft';
  const isChanges = exam.status === 'changes_requested';

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
              {formatRange(exam.startAt, exam.endAt)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FileText className="size-3.5" />
              {exam.questionCount} question{exam.questionCount === 1 ? '' : 's'} · {exam.totalMarks}{' '}
              marks · {exam.durationMinutes} min
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isDraft && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/exams/${exam.publicId}/build`)}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                aria-label="Delete exam"
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
          {isChanges && (
            <Button size="sm" onClick={() => revise.mutate()} disabled={revise.isPending}>
              {revise.isPending && <Loader2 className="size-4 animate-spin" />}
              Revise & edit
            </Button>
          )}
          {!isDraft && !isChanges && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/exams/${exam.publicId}/build`)}
            >
              View
            </Button>
          )}
        </div>
      </div>

      {/* Status hints */}
      {exam.status === 'in_review' && (
        <p className="text-muted-foreground mt-3 text-xs">Awaiting admin review.</p>
      )}
      {exam.status === 'approved' && (
        <p className="text-muted-foreground mt-3 text-xs">Ready to publish.</p>
      )}
      {isChanges && (
        <div className="mt-3">
          <ChangesRequestedBanner note={exam.reviewNote} />
        </div>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this exam?</DialogTitle>
            <DialogDescription>
              “{exam.title}” and its questions will be removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              {remove.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="bg-muted flex size-14 items-center justify-center rounded-full">
        <FileText className="text-muted-foreground size-7" />
      </div>
      <p className="font-medium">No exams yet</p>
      <p className="text-muted-foreground max-w-sm text-sm">
        Create your first exam, add questions from your bank, and submit it for review.
      </p>
      <Button onClick={onCreate} className="mt-1">
        <Plus className="size-4" />
        New Exam
      </Button>
    </Card>
  );
}

function formatRange(startAt: string, endAt: string): string {
  const s = new Date(startAt);
  const e = new Date(endAt);
  const opts: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  };
  const sameDay = s.toDateString() === e.toDateString();
  const start = s.toLocaleString('en-GB', { ...opts, year: 'numeric' });
  const end = sameDay
    ? e.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : e.toLocaleString('en-GB', { ...opts, year: 'numeric' });
  return `${start} → ${end}`;
}
