import { useQuery } from '@tanstack/react-query';
import type { MyExamListItem } from '@exam/types';
import {
  Award,
  BookOpen,
  Clock,
  GraduationCap,
  Loader2,
  PenLine,
  TriangleAlert,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '../shared/StatusPill';
import { StartCountdown } from '../shared/ExamCountdown';
import { useServerNow } from '../shared/useServerNow';
import { fetchMyCourses, fetchMyExams } from './resultsApi';
import type { MyCourse } from './resultsApi';

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

  const coursesQuery = useQuery({
    queryKey: ['my-courses'],
    queryFn: fetchMyCourses,
  });

  const examsQuery = useQuery({
    queryKey: ['my-exams'],
    queryFn: fetchMyExams,
    refetchInterval: 20_000,
  });

  const isLoading = coursesQuery.isLoading || examsQuery.isLoading;
  const coursesData = coursesQuery.data;
  const exams = examsQuery.data ?? [];

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const { upcoming, inProgress, completed } = groupExams(exams);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      {/* ── Header ── */}
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My Exams</h1>
        {coursesData?.semester && (
          <p className="text-muted-foreground mt-1 text-sm">
            {coursesData.semester.programName} · {coursesData.semester.name}
            {coursesData.batchName && (
              <span className="ml-2 opacity-70">({coursesData.batchName})</span>
            )}
          </p>
        )}
      </header>

      {/* ── No enrollment warning ── */}
      {coursesData && !coursesData.enrolled && (
        <Card className="flex items-start gap-3 border-amber-400/40 bg-amber-50 p-4 dark:bg-amber-950/20">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Your account is not linked to a student batch yet. Ask an admin to enrol you.
          </p>
        </Card>
      )}

      {/* ── No semester set warning ── */}
      {coursesData?.enrolled && !coursesData.semester && (
        <Card className="flex items-start gap-3 border-amber-400/40 bg-amber-50 p-4 dark:bg-amber-950/20">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Your batch has no active semester set. Contact your admin to advance the batch to the
            correct semester — exams will appear here once that is done.
          </p>
        </Card>
      )}

      {/* ── Running Courses ── */}
      {coursesData?.courses && coursesData.courses.length > 0 && (
        <section>
          <h2 className="text-muted-foreground mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <GraduationCap className="size-3.5" />
            Running Courses — {coursesData.semester?.name}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {coursesData.courses.map((c) => (
              <CourseCard key={c.publicId} course={c} />
            ))}
          </div>
        </section>
      )}

      {/* ── Exams ── */}
      {coursesData?.semester && exams.length === 0 ? (
        <section>
          <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wide">
            Exams
          </h2>
          <Card className="flex flex-col items-center gap-2 py-14 text-center">
            <BookOpen className="text-muted-foreground size-8" />
            <p className="font-medium">No exams yet</p>
            <p className="text-muted-foreground max-w-xs text-sm">
              When your teacher publishes an exam for your batch, it will appear here.
            </p>
          </Card>
        </section>
      ) : (
        <div className="space-y-8">
          {inProgress.length > 0 && (
            <ExamSection title="In Progress">
              {inProgress.map((e) => (
                <ExamCard
                  key={e.examPublicId}
                  exam={e}
                  nowMs={nowMs}
                  onAction={() => navigate(`/exam/${e.examPublicId}`)}
                />
              ))}
            </ExamSection>
          )}
          {upcoming.length > 0 && (
            <ExamSection title="Upcoming">
              {upcoming.map((e) => (
                <ExamCard key={e.examPublicId} exam={e} nowMs={nowMs} />
              ))}
            </ExamSection>
          )}
          {completed.length > 0 && (
            <ExamSection title="Completed">
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
            </ExamSection>
          )}
        </div>
      )}
    </div>
  );
}

// ── Course card ───────────────────────────────────────────────────────────────

function CourseCard({ course }: { course: MyCourse }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-start gap-2">
        <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
          <BookOpen className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            {course.code}
          </p>
          <p className="truncate text-sm font-medium">{course.name}</p>
        </div>
      </div>
      {course.parts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-10">
          {course.parts.map((p) => (
            <span
              key={p.publicId}
              className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px]"
            >
              {p.name}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Exam section + card ───────────────────────────────────────────────────────

function ExamSection({ title, children }: { title: string; children: React.ReactNode }) {
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

        {isLive && !submitted && (
          <p className="text-success mt-3 flex items-center gap-1.5 text-sm font-medium">
            <Clock className="size-3.5" />
            The exam is open — you can start now.
          </p>
        )}

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
