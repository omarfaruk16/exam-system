import { useQuery } from '@tanstack/react-query';
import type { MyExamListItem, StudentExamResult, StudentSemesterResult } from '@exam/types';
import {
  Award,
  BookOpen,
  ChevronDown,
  Clock,
  GraduationCap,
  Loader2,
  PenLine,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { StatusPill } from '../shared/StatusPill';
import { StartCountdown } from '../shared/ExamCountdown';
import { useServerNow } from '../shared/useServerNow';
import { fetchMyCourses, fetchMyExams, fetchMyResults } from './resultsApi';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Group exams by courseCode
function groupByCourse<T extends { courseCode: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const e of items) {
    if (!map.has(e.courseCode)) map.set(e.courseCode, []);
    map.get(e.courseCode)!.push(e);
  }
  return map;
}

export function MyExamsPage() {
  const navigate = useNavigate();
  const nowMs = useServerNow();

  const coursesQuery = useQuery({ queryKey: ['my-courses'], queryFn: fetchMyCourses });
  const examsQuery = useQuery({
    queryKey: ['my-exams'],
    queryFn: fetchMyExams,
    refetchInterval: 20_000,
  });
  const resultsQuery = useQuery({ queryKey: ['my-results'], queryFn: fetchMyResults });

  const isLoading = coursesQuery.isLoading || examsQuery.isLoading;
  const coursesData = coursesQuery.data;
  const currentSemNum = coursesData?.semester?.number ?? null;
  const currentSemLabel = coursesData?.semester?.name
    ? `Semester ${currentSemNum} — ${coursesData.semester.name}`
    : currentSemNum != null
      ? `Semester ${currentSemNum}`
      : 'Current Semester';

  const exams = examsQuery.data ?? [];

  // Past = semesters BEFORE the current one (exclude current to avoid duplication)
  const pastSemesters: StudentSemesterResult[] = (resultsQuery.data ?? [])
    .filter((s) => currentSemNum === null || s.semester.number < currentSemNum)
    .sort((a, b) => b.semester.number - a.semester.number);

  // Split current semester exams
  const activeExams = exams.filter((e) => e.status === 'live' || e.status === 'published');
  const completedCurrentExams = exams.filter(
    (e) => e.status !== 'live' && e.status !== 'published',
  );

  // Group completed current exams by course
  const currentByCourse = groupByCourse(completedCurrentExams);

  // Accordion state — current semester open by default
  const [openSems, setOpenSems] = useState<Set<string>>(new Set(['current']));
  const toggleSem = (key: string) => {
    setOpenSems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="w-full space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My Exams</h1>
        {coursesData?.semester && (
          <p className="text-muted-foreground mt-1 text-sm">
            {coursesData.semester.programName} · {coursesData.semester.name}
          </p>
        )}
      </header>

      {/* Enrollment warnings */}
      {coursesData && !coursesData.enrolled && (
        <Card className="flex items-start gap-3 border-amber-400/40 bg-amber-50 p-4 dark:bg-amber-950/20">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Your account is not linked to a student batch yet. Ask an admin to enrol you.
          </p>
        </Card>
      )}
      {coursesData?.enrolled && !coursesData.semester && (
        <Card className="flex items-start gap-3 border-amber-400/40 bg-amber-50 p-4 dark:bg-amber-950/20">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Your batch has no active semester set. Contact your admin — exams appear here once
            that's done.
          </p>
        </Card>
      )}

      {/* ── Upcoming & Live strip ── */}
      {activeExams.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <GraduationCap className="size-3.5" /> Upcoming &amp; Live
          </h2>
          {activeExams.map((e) => (
            <ActiveExamCard
              key={e.examPublicId}
              exam={e}
              nowMs={nowMs}
              onStart={e.status === 'live' ? () => navigate(`/exam/${e.examPublicId}`) : undefined}
            />
          ))}
        </section>
      )}

      {/* ── Semester Accordions ── */}
      <div className="space-y-3">
        {/* Current semester */}
        {coursesData?.semester && (
          <SemesterAccordion
            label={currentSemLabel}
            isCurrent
            open={openSems.has('current')}
            onToggle={() => toggleSem('current')}
            examCount={completedCurrentExams.length}
          >
            {completedCurrentExams.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                No completed exams in this semester yet.
              </p>
            ) : (
              <div className="space-y-4">
                {[...currentByCourse.entries()].map(([code, courseExams]) => (
                  <CourseGroup key={code} code={code} exams={courseExams}>
                    {courseExams.map((e) => (
                      <ExamCard
                        key={e.examPublicId}
                        exam={e}
                        onResult={
                          e.attempt ? () => navigate(`/results/${e.attempt!.publicId}`) : undefined
                        }
                      />
                    ))}
                  </CourseGroup>
                ))}
              </div>
            )}
          </SemesterAccordion>
        )}

        {/* Past semesters */}
        {pastSemesters.map((sem) => {
          const semKey = String(sem.semester.number);
          const semLabel = sem.semester.name
            ? `Semester ${sem.semester.number} — ${sem.semester.name}`
            : `Semester ${sem.semester.number}`;
          const byCourse = groupByCourse(sem.exams);
          return (
            <SemesterAccordion
              key={semKey}
              label={semLabel}
              open={openSems.has(semKey)}
              onToggle={() => toggleSem(semKey)}
              examCount={sem.exams.length}
            >
              <div className="space-y-4">
                {[...byCourse.entries()].map(([code, courseExams]) => (
                  <CourseGroup key={code} code={code} exams={courseExams}>
                    {courseExams.map((e) => (
                      <PastExamCard
                        key={e.attemptPublicId}
                        exam={e}
                        onResult={() => navigate(`/results/${e.attemptPublicId}`)}
                      />
                    ))}
                  </CourseGroup>
                ))}
              </div>
            </SemesterAccordion>
          );
        })}

        {/* Empty state */}
        {!coursesData?.semester && pastSemesters.length === 0 && (
          <Card className="flex flex-col items-center gap-2 py-14 text-center">
            <BookOpen className="text-muted-foreground size-7" />
            <p className="font-medium">No exams yet</p>
            <p className="text-muted-foreground max-w-xs text-sm">
              When your teacher publishes an exam, it will appear here.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Semester accordion ────────────────────────────────────────────────────────

function SemesterAccordion({
  label,
  isCurrent,
  open,
  onToggle,
  examCount,
  children,
}: {
  label: string;
  isCurrent?: boolean;
  open: boolean;
  onToggle: () => void;
  examCount: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border">
      <button
        type="button"
        onClick={onToggle}
        className="hover:bg-muted/40 flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium">{label}</span>
          {isCurrent && (
            <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-semibold">
              Current
            </span>
          )}
          <span className="text-muted-foreground text-xs">
            {examCount} exam{examCount === 1 ? '' : 's'}
          </span>
        </div>
        <ChevronDown
          className={cn('text-muted-foreground size-4 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && <div className="border-t px-4 py-4">{children}</div>}
    </div>
  );
}

// ── Course group ──────────────────────────────────────────────────────────────

function CourseGroup({
  code,
  exams,
  children,
}: {
  code: string;
  exams: { courseCode: string; courseName?: string; partName?: string; part?: string }[];
  children: React.ReactNode;
}) {
  const first = exams[0];
  const courseName = (first as { courseName?: string }).courseName ?? '';
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          {code}
        </span>
        {courseName && <span className="text-muted-foreground text-xs">{courseName}</span>}
      </div>
      <div className="space-y-2 pl-0 sm:pl-2">{children}</div>
    </div>
  );
}

// ── Active exam card (upcoming/live) ──────────────────────────────────────────

function ActiveExamCard({
  exam,
  nowMs,
  onStart,
}: {
  exam: MyExamListItem;
  nowMs: number;
  onStart?: () => void;
}) {
  const isLive = exam.status === 'live';
  const startAtMs = new Date(exam.startAt).getTime();
  const beforeStart = nowMs < startAtMs;

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{exam.title}</h3>
          <StatusPill status={exam.status} />
        </div>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {exam.courseCode} · {exam.part}
        </p>
        <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs">
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" /> {formatDate(exam.startAt)}
          </span>
          <span>
            {exam.durationMinutes} min · {exam.totalMarks} marks
          </span>
        </div>
        {isLive && (
          <p className="text-success mt-1.5 flex items-center gap-1.5 text-sm font-medium">
            <Clock className="size-3.5" /> The exam is open — you can start now.
          </p>
        )}
        {!isLive && beforeStart && (
          <div className="mt-1.5 text-sm">
            <StartCountdown startAtMs={startAtMs} nowMs={nowMs} />
          </div>
        )}
        {!isLive && !beforeStart && (
          <p className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-sm">
            <Loader2 className="size-3.5 animate-spin" /> Opening — any moment now…
          </p>
        )}
      </div>
      {isLive && (
        <Button size="sm" onClick={onStart}>
          {exam.attempt?.status === 'in_progress' ? 'Resume' : 'Start exam'}
        </Button>
      )}
      {!isLive && (
        <Button size="sm" disabled>
          Start exam
        </Button>
      )}
    </Card>
  );
}

// ── Completed current-semester exam card ──────────────────────────────────────

function ExamCard({ exam, onResult }: { exam: MyExamListItem; onResult?: () => void }) {
  const { attempt, status, showMarksAfterSubmit } = exam;
  const isResultsPublished = status === 'results_published';
  const examOver = ['ended', 'grading', 'results_published'].includes(status);
  const submitted = attempt !== null && attempt.status !== 'in_progress';

  const completionState = (() => {
    if (!attempt && examOver) return 'did-not-attempt';
    if (!submitted) return null;
    if (!examOver) return 'awaiting-release';
    if (!showMarksAfterSubmit && !isResultsPublished) return 'awaiting-release';
    if (attempt?.gradingStatus === 'awaiting_manual') return 'awaiting-grading';
    if (attempt?.gradingStatus === 'grading') return 'grading-in-progress';
    return 'results-available';
  })();

  return (
    <Card className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{exam.title}</span>
          <StatusPill status={exam.status} />
        </div>
        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <span>{exam.part}</span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" /> {formatDate(exam.startAt)}
          </span>
          <span>{exam.totalMarks} marks</span>
        </div>
        {completionState === 'results-available' && (
          <p className="mt-1 text-sm font-medium">
            {attempt!.totalScore ?? 0} / {exam.totalMarks}
            {exam.totalMarks > 0 && (
              <span className="text-muted-foreground ml-1.5 text-xs">
                ({Math.round(((attempt!.totalScore ?? 0) / exam.totalMarks) * 100)}%)
              </span>
            )}
          </p>
        )}
        {completionState === 'did-not-attempt' && (
          <p className="text-muted-foreground mt-1 text-xs italic">Not attempted</p>
        )}
        {completionState === 'awaiting-release' && (
          <p className="text-muted-foreground mt-1 text-xs">Results pending</p>
        )}
        {completionState === 'awaiting-grading' && (
          <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
            <PenLine className="size-3" /> Being graded
          </p>
        )}
        {completionState === 'grading-in-progress' && (
          <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
            <Loader2 className="size-3 animate-spin" /> Grading in progress
          </p>
        )}
      </div>
      {completionState === 'results-available' && onResult && (
        <Button size="sm" variant="outline" onClick={onResult} className="shrink-0">
          <Award className="size-3.5" /> Result
        </Button>
      )}
    </Card>
  );
}

// ── Past semester exam card ───────────────────────────────────────────────────

function PastExamCard({ exam, onResult }: { exam: StudentExamResult; onResult: () => void }) {
  const hasScore = exam.showMarks && exam.score !== null;
  return (
    <Card className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{exam.title}</span>
          <StatusPill status={exam.examStatus} />
        </div>
        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <span>{exam.partName}</span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" /> {formatDate(exam.startAt)}
          </span>
          <span>{exam.totalMarks} marks</span>
        </div>
        {hasScore && (
          <p className="mt-1 text-sm font-medium">
            {exam.score} / {exam.totalMarks}
            {exam.percentage != null && (
              <span className="text-muted-foreground ml-1.5 text-xs">
                ({Math.round(exam.percentage)}%)
              </span>
            )}
            {exam.rank != null && (
              <span className="text-muted-foreground ml-1.5 text-xs">Rank #{exam.rank}</span>
            )}
          </p>
        )}
        {!hasScore && exam.gradingStatus === 'awaiting_manual' && (
          <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
            <PenLine className="size-3" /> Being graded
          </p>
        )}
        {!hasScore && exam.gradingStatus === null && (
          <p className="text-muted-foreground mt-1 text-xs">Results pending</p>
        )}
      </div>
      <Button size="sm" variant="outline" onClick={onResult} className="shrink-0">
        <Award className="size-3.5" /> Result
      </Button>
    </Card>
  );
}
