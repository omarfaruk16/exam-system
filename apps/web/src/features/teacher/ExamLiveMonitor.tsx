import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExamResultsOverview, LiveExamAttempt } from '@exam/types';
import { ArrowLeft, CircleDot, Loader2, LogOut, Send, ShieldAlert, UserX } from 'lucide-react';
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
import { ApiError } from '@/lib/api';
import { StatusPill } from '../shared/StatusPill';
import { fetchLiveOverview, forceSubmitAttempt, markAttemptAbsent } from './examResultsApi';

type PendingAction = { kind: 'submit' | 'absent'; attempt: LiveExamAttempt };

/**
 * Live invigilation view (shown while the exam is in progress): who is sitting the exam right now,
 * their live progress, and per-student actions — force-submit or mark absent. Polls every 5s.
 */
export function ExamLiveMonitor({
  examPublicId,
  exam,
  enrolled,
}: {
  examPublicId: string;
  exam: ExamResultsOverview['exam'];
  enrolled: number;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pending, setPending] = useState<PendingAction | null>(null);

  const live = useQuery({
    queryKey: ['exam-live', examPublicId],
    queryFn: () => fetchLiveOverview(examPublicId),
    enabled: Boolean(examPublicId),
    refetchInterval: 5000,
  });

  const action = useMutation({
    mutationFn: async ({ kind, attempt }: PendingAction) =>
      kind === 'submit'
        ? forceSubmitAttempt(examPublicId, attempt.attemptPublicId)
        : markAttemptAbsent(examPublicId, attempt.attemptPublicId),
    onSuccess: async (_res, vars) => {
      toast.success(
        vars.kind === 'submit'
          ? `Submitted ${vars.attempt.studentId}'s exam`
          : `Marked ${vars.attempt.studentId} absent`,
      );
      setPending(null);
      await qc.invalidateQueries({ queryKey: ['exam-live', examPublicId] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Action failed'),
  });

  const attempts = live.data?.attempts ?? [];

  return (
    <div className="w-full">
      <button
        onClick={() => navigate('/exam-results')}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Back to results
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{exam.title}</h1>
            <StatusPill status={exam.status} />
            <span className="text-success inline-flex items-center gap-1.5 text-xs font-medium">
              <CircleDot className="size-3.5 animate-pulse" /> Live monitoring
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {exam.courseCode} · {exam.courseName} · {exam.partName} · Semester {exam.semesterNumber}
          </p>
        </div>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          {live.isFetching && <Loader2 className="size-3.5 animate-spin" />}
          Auto-refreshing every 5s
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Enrolled" value={String(enrolled)} />
        <Stat label="Currently taking" value={String(attempts.length)} tone="success" />
        <Stat label="Questions" value={String(live.data?.totalQuestions ?? 0)} />
        <Stat label="Total marks" value={String(exam.totalMarks)} />
      </div>

      <Card className="mt-5 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="px-4 py-2.5 font-medium">Student ID</th>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Started</th>
                <th className="px-4 py-2.5 text-center font-medium">Progress</th>
                <th className="px-4 py-2.5 text-center font-medium">Page minimized attempts</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.attemptPublicId} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-medium tabular-nums">{a.studentId}</td>
                  <td className="px-4 py-2.5">{a.name}</td>
                  <td className="text-muted-foreground px-4 py-2.5 tabular-nums">
                    {new Date(a.startedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-2.5 text-center tabular-nums">
                    {a.answered} / {a.totalQuestions}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {a.proctorViolations > 0 ? (
                      <span
                        className="text-destructive bg-destructive/10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
                        title={`Left the exam window ${a.proctorViolations} time(s)`}
                      >
                        <ShieldAlert className="size-3" />
                        {a.proctorViolations}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5"
                        onClick={() => setPending({ kind: 'submit', attempt: a })}
                      >
                        <Send className="size-3.5" /> Submit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive h-7 gap-1.5"
                        onClick={() => setPending({ kind: 'absent', attempt: a })}
                      >
                        <UserX className="size-3.5" /> Absent
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {attempts.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-muted-foreground px-4 py-12 text-center">
                    {live.isLoading ? (
                      <Loader2 className="mx-auto size-5 animate-spin" />
                    ) : (
                      'No students are taking the exam right now.'
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog
        open={Boolean(pending)}
        onOpenChange={(o) => !o && !action.isPending && setPending(null)}
      >
        <DialogContent className="sm:max-w-[440px]">
          {pending && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {pending.kind === 'submit' ? (
                    <>
                      <LogOut className="size-5" /> Submit this student&apos;s exam?
                    </>
                  ) : (
                    <>
                      <UserX className="text-destructive size-5" /> Mark this student absent?
                    </>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {pending.kind === 'submit' ? (
                    <>
                      <span className="font-medium">
                        {pending.attempt.name} ({pending.attempt.studentId})
                      </span>{' '}
                      will be signed out and their exam submitted for grading with the answers saved
                      so far ({pending.attempt.answered} of {pending.attempt.totalQuestions}).
                    </>
                  ) : (
                    <>
                      <span className="font-medium">
                        {pending.attempt.name} ({pending.attempt.studentId})
                      </span>{' '}
                      will be signed out and recorded as <span className="font-medium">absent</span>
                      . Their current answers will be discarded. This cannot be undone.
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setPending(null)}
                  disabled={action.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant={pending.kind === 'absent' ? 'destructive' : 'default'}
                  onClick={() => action.mutate(pending)}
                  disabled={action.isPending}
                >
                  {action.isPending && <Loader2 className="animate-spin" />}
                  {pending.kind === 'submit' ? 'Submit exam' : 'Mark absent'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <Card className="p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={
          tone === 'success'
            ? 'text-success mt-0.5 text-xl font-semibold tabular-nums'
            : 'mt-0.5 text-xl font-semibold tabular-nums'
        }
      >
        {value}
      </p>
    </Card>
  );
}
