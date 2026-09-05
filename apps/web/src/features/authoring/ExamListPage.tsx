import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExamDeletionRequest, ExamListItem } from '@exam/types';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { sessionLabel } from '@/lib/utils';
import { ChangesRequestedBanner } from '../shared/ChangesRequestedBanner';
import { StartCountdown, LiveCountdown } from '../shared/ExamCountdown';
import { StatusPill } from '../shared/StatusPill';
import { useServerNow } from '../shared/useServerNow';
import { useSession } from '@/lib/session';
import { publishExam } from '../review/reviewApi';
import {
  approveDeletion,
  deleteExam,
  fetchDeletionRequests,
  fetchExams,
  rejectDeletion,
  requestExamDeletion,
  reviseExam,
} from './authoringApi';

const ADMIN_EDITABLE_STATUSES = ['draft', 'in_review', 'approved', 'changes_requested'];
const PAST_STATUSES = ['ended', 'grading', 'results_published', 'archived'];

// ── Batch → Program → Semester grouping ──────────────────────────────────────
interface SemesterGroup {
  key: string;
  label: string;
  semesterNumber: number;
  items: ExamListItem[];
}
interface ProgramGroup {
  key: string;
  label: string;
  semesters: SemesterGroup[];
}
interface BatchGroup {
  key: string;
  departmentName: string;
  batchLabel: string;
  programs: ProgramGroup[];
}

const NO_BATCH = 'No session assigned yet';
const SEP = '|||';

/**
 * Number every exam within its course part (Exam 1, Exam 2, …) by start time — matching the
 * "Exam N" sequence shown on generated reports. Keyed by exam publicId.
 */
function computeExamNumbers(exams: ExamListItem[]): Map<string, number> {
  const byPart = new Map<string, ExamListItem[]>();
  for (const e of exams) {
    const k = `${e.departmentName}${SEP}${e.batch ?? NO_BATCH}${SEP}${e.courseCode}${SEP}${e.part}`;
    (byPart.get(k) ?? byPart.set(k, []).get(k)!).push(e);
  }
  const numbers = new Map<string, number>();
  for (const list of byPart.values()) {
    list
      .slice()
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
      .forEach((e, i) => numbers.set(e.publicId, i + 1));
  }
  return numbers;
}

/**
 * Nest the flat exam list as (Department + Session) → Program → Semester so staff browse
 * exams by cohort. Sessions sort newest-first (the "No session" bucket last), programmes
 * alphabetically, semesters by number, and exams within a semester newest-first.
 */
function groupByBatch(exams: ExamListItem[]): BatchGroup[] {
  // Top-level key = department + session, so the same session name in two departments stays split.
  const top = new Map<
    string,
    { departmentName: string; batchLabel: string; progs: Map<string, Map<string, ExamListItem[]>> }
  >();
  for (const e of exams) {
    const dept = e.departmentName;
    const batchLabel = e.batch ?? NO_BATCH;
    const key = `${dept}${SEP}${batchLabel}`;
    if (!top.has(key)) top.set(key, { departmentName: dept, batchLabel, progs: new Map() });
    const progs = top.get(key)!.progs;
    const p = e.programName;
    const s = `${e.semesterNumber}::${e.semesterLabel}`;
    if (!progs.has(p)) progs.set(p, new Map());
    const sems = progs.get(p)!;
    if (!sems.has(s)) sems.set(s, []);
    sems.get(s)!.push(e);
  }

  const keys = [...top.keys()].sort((a, b) => {
    const ea = top.get(a)!;
    const eb = top.get(b)!;
    // "No session" bucket last; then newest session first; then department name.
    if (ea.batchLabel === NO_BATCH && eb.batchLabel !== NO_BATCH) return 1;
    if (eb.batchLabel === NO_BATCH && ea.batchLabel !== NO_BATCH) return -1;
    return (
      eb.batchLabel.localeCompare(ea.batchLabel) ||
      ea.departmentName.localeCompare(eb.departmentName)
    );
  });

  return keys.map((key) => {
    const { departmentName, batchLabel, progs } = top.get(key)!;
    const programs: ProgramGroup[] = [...progs.keys()]
      .sort((a, c) => a.localeCompare(c))
      .map((p) => {
        const sems = progs.get(p)!;
        const semesters: SemesterGroup[] = [...sems.entries()]
          .map(([sk, items]) => {
            const sep = sk.indexOf('::');
            const num = sk.slice(0, sep);
            const label = sk.slice(sep + 2);
            return {
              key: sk,
              label,
              semesterNumber: Number(num),
              items: items.sort(
                (x, y) => new Date(y.startAt).getTime() - new Date(x.startAt).getTime(),
              ),
            };
          })
          .sort((x, y) => x.semesterNumber - y.semesterNumber);
        return { key: p, label: p, semesters };
      });
    return { key, departmentName, batchLabel, programs };
  });
}

// ── Admin: pending deletion-request panel ────────────────────────────────────
function DeletionRequestsPanel() {
  const qc = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const { data: requests = [] } = useQuery<ExamDeletionRequest[]>({
    queryKey: ['exam-deletion-requests'],
    queryFn: fetchDeletionRequests,
    refetchInterval: 30_000,
  });

  const approve = useMutation({
    mutationFn: (id: string) => approveDeletion(id),
    onSuccess: async () => {
      toast.success('Exam deleted');
      await qc.invalidateQueries({ queryKey: ['exam-deletion-requests'] });
      await qc.invalidateQueries({ queryKey: ['authoring-exams'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not approve'),
  });

  const reject = useMutation({
    mutationFn: () => rejectDeletion(rejectingId!, rejectNote.trim() || undefined),
    onSuccess: async () => {
      toast.success('Request rejected');
      setRejectingId(null);
      setRejectNote('');
      await qc.invalidateQueries({ queryKey: ['exam-deletion-requests'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not reject'),
  });

  if (requests.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-amber-400/40 bg-amber-50 p-4 dark:bg-amber-950/20">
      <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
        <AlertTriangle className="size-3.5" /> Deletion requests ({requests.length})
      </h2>
      <ul className="space-y-3">
        {requests.map((req) => (
          <li
            key={req.publicId}
            className="flex flex-wrap items-start justify-between gap-2 text-sm"
          >
            <div className="min-w-0">
              <p className="font-medium">{req.exam.title}</p>
              <p className="text-muted-foreground text-xs">
                Requested by {req.requestedBy.user.displayName} ·{' '}
                {new Date(req.requestedAt).toLocaleDateString('en-GB')}
              </p>
              {req.reason && (
                <p className="text-muted-foreground mt-0.5 text-xs italic">"{req.reason}"</p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => approve.mutate(req.publicId)}
                disabled={approve.isPending}
              >
                {approve.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}{' '}
                Approve & delete
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRejectingId(req.publicId);
                  setRejectNote('');
                }}
              >
                <X className="size-3.5" /> Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={rejectingId !== null} onOpenChange={(o) => !o && setRejectingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject deletion request</DialogTitle>
            <DialogDescription>
              Optionally explain to the teacher why the exam should not be deleted.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Optional note for the teacher…"
            rows={3}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectingId(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => reject.mutate()} disabled={reject.isPending}>
              {reject.isPending && <Loader2 className="size-4 animate-spin" />} Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ExamListPage() {
  const navigate = useNavigate();
  const nowMs = useServerNow();
  const { data, isLoading } = useQuery({
    queryKey: ['authoring-exams'],
    queryFn: fetchExams,
    refetchInterval: 20_000,
  });
  const { data: user } = useSession();
  const isAdmin = (user?.roles ?? []).some((r) => r.role === 'admin' || r.role === 'super_admin');

  const grouped = groupByBatch(data ?? []);
  const examNumbers = computeExamNumbers(data ?? []);

  // "Starting soon" — published exams whose start time is within the next hour
  // (or already due but not yet flipped live), soonest first.
  const SOON_WINDOW_MS = 60 * 60 * 1000;
  const startingSoon = (data ?? [])
    .filter((e) => {
      if (e.status !== 'published' && e.status !== 'live') return false;
      const startMs = new Date(e.startAt).getTime();
      const endMs = new Date(e.endAt).getTime();
      return e.status === 'live' || (startMs - nowMs <= SOON_WINDOW_MS && endMs > nowMs);
    })
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  return (
    <div className="w-full">
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

      {isAdmin && <DeletionRequestsPanel />}

      {startingSoon.length > 0 && (
        <div className="border-primary/30 bg-primary/5 mb-6 rounded-xl border p-4">
          <h2 className="text-primary mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <CalendarClock className="size-3.5" /> Starting soon
          </h2>
          <ul className="space-y-2.5">
            {startingSoon.map((e) => {
              const startMs = new Date(e.startAt).getTime();
              const isLive = e.status === 'live';
              return (
                <li
                  key={e.publicId}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <button
                    className="hover:text-primary text-left font-medium"
                    onClick={() =>
                      navigate(isAdmin ? `/review/${e.publicId}` : `/exams/${e.publicId}/build`)
                    }
                  >
                    {e.title}
                    <span className="text-muted-foreground ml-2 font-normal">
                      {e.courseCode} · {e.part}
                    </span>
                  </button>
                  {isLive ? (
                    <LiveCountdown
                      endAtMs={new Date(e.endAt).getTime()}
                      nowMs={nowMs}
                      className="text-xs"
                    />
                  ) : nowMs < startMs ? (
                    <StartCountdown startAtMs={startMs} nowMs={nowMs} />
                  ) : (
                    <span className="text-warning text-xs">Opening…</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

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
          {grouped.map((batch) => {
            const count = batch.programs.reduce(
              (n, p) => n + p.semesters.reduce((m, s) => m + s.items.length, 0),
              0,
            );
            return (
              <section key={batch.key} className="space-y-4">
                {/* Department — Session header */}
                <div className="flex flex-wrap items-center gap-2">
                  <Users className="text-primary size-4 shrink-0" />
                  <h2 className="text-base font-semibold tracking-tight">
                    {batch.departmentName}
                    <span className="text-muted-foreground font-normal">
                      {' '}
                      —{' '}
                      {batch.batchLabel === NO_BATCH
                        ? NO_BATCH
                        : sessionLabel({ name: batch.batchLabel })}
                    </span>
                  </h2>
                  <span className="text-muted-foreground text-xs">
                    {count} exam{count === 1 ? '' : 's'}
                  </span>
                </div>

                {batch.programs.map((program) => (
                  <div key={program.key} className="border-border/60 space-y-3 border-l-2 pl-4">
                    <h3 className="text-foreground/90 text-sm font-medium">{program.label}</h3>
                    {program.semesters.map((sem) => (
                      <div key={sem.key} className="space-y-2.5">
                        <h4 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                          {sem.label}
                        </h4>
                        {sem.items.map((exam) => (
                          <ExamCard
                            key={exam.publicId}
                            exam={exam}
                            examNumber={examNumbers.get(exam.publicId) ?? null}
                            isAdmin={isAdmin}
                            nowMs={nowMs}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ExamCard({
  exam,
  examNumber,
  isAdmin,
  nowMs,
}: {
  exam: ExamListItem;
  examNumber: number | null;
  isAdmin: boolean;
  nowMs: number;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [requestingDeletion, setRequestingDeletion] = useState(false);
  const [deletionReason, setDeletionReason] = useState('');

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

  const publish = useMutation({
    mutationFn: () => publishExam(exam.publicId),
    onSuccess: async () => {
      toast.success('Exam published — students can now see it');
      await qc.invalidateQueries({ queryKey: ['authoring-exams'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not publish the exam'),
  });

  const requestDeletion = useMutation({
    mutationFn: () => requestExamDeletion(exam.publicId, deletionReason.trim() || undefined),
    onSuccess: () => {
      toast.success('Deletion request sent — admin will review it');
      setRequestingDeletion(false);
      setDeletionReason('');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not send request'),
  });

  const isDraft = exam.status === 'draft';
  const isChanges = exam.status === 'changes_requested';
  const isPast = PAST_STATUSES.includes(exam.status);

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {examNumber != null && (
              <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">
                Exam {examNumber}
              </span>
            )}
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

          {/* Live countdown once the exam is visible to students */}
          {exam.status === 'published' &&
            (nowMs < new Date(exam.startAt).getTime() ? (
              <div className="mt-2 text-xs">
                <StartCountdown startAtMs={new Date(exam.startAt).getTime()} nowMs={nowMs} />
              </div>
            ) : (
              <p className="text-warning mt-2 text-xs">Opening — going live any moment…</p>
            ))}
          {exam.status === 'live' && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <LiveCountdown endAtMs={new Date(exam.endAt).getTime()} nowMs={nowMs} />
              <span className="text-muted-foreground">students can start</span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isAdmin ? (
            <>
              {exam.status === 'approved' && (
                <Button size="sm" onClick={() => publish.mutate()} disabled={publish.isPending}>
                  {publish.isPending && <Loader2 className="size-4 animate-spin" />}
                  Publish
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/review/${exam.publicId}`)}
              >
                {ADMIN_EDITABLE_STATUSES.includes(exam.status) ? 'Edit' : 'View'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                title="Delete exam"
                aria-label="Delete exam"
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          ) : (
            <>
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
                    type="button"
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
              {isPast && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRequestingDeletion(true)}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  title="Request deletion"
                  aria-label="Request deletion"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </>
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
              "{exam.title}" and its questions will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              type="button"
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

      <Dialog open={requestingDeletion} onOpenChange={setRequestingDeletion}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request deletion</DialogTitle>
            <DialogDescription>
              "{exam.title}" will be flagged for admin review. An optional reason helps the admin
              decide.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={deletionReason}
            onChange={(e) => setDeletionReason(e.target.value)}
            placeholder="Optional reason…"
            rows={3}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRequestingDeletion(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => requestDeletion.mutate()}
              disabled={requestDeletion.isPending}
            >
              {requestDeletion.isPending && <Loader2 className="size-4 animate-spin" />}
              Send request
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
