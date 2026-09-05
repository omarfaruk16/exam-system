import { useQuery } from '@tanstack/react-query';
import type { TeacherConductedExam } from '@exam/types';
import {
  BarChart3,
  BookOpen,
  CalendarClock,
  ChevronRight,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { sessionLabel, sessionRange } from '@/lib/utils';
import { StatusPill } from '../shared/StatusPill';
import { fetchConductedResults } from './examResultsApi';

const CURRENT = '__current__';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface CourseGroup {
  key: string;
  courseCode: string;
  courseName: string;
  part: string;
  batchName: string | null;
  isCurrentBatch: boolean;
  exams: (TeacherConductedExam & { seq: number })[];
}

/** Group a batch's exams by course part and number them (Exam 1, 2, …) by start time. */
function groupByCourse(exams: TeacherConductedExam[]): CourseGroup[] {
  const map = new Map<string, TeacherConductedExam[]>();
  for (const e of exams) {
    const k = `${e.batchPublicId ?? 'none'}::${e.courseCode}::${e.part}`;
    (map.get(k) ?? map.set(k, []).get(k)!).push(e);
  }
  return [...map.entries()]
    .map(([key, list]) => {
      const ordered = [...list].sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      );
      const withSeq = ordered.map((e, i) => ({ ...e, seq: i + 1 }));
      const first = ordered[0]!;
      return {
        key,
        courseCode: first.courseCode,
        courseName: first.courseName,
        part: first.part,
        batchName: first.batchName,
        isCurrentBatch: first.isCurrentBatch,
        // Show newest exam first within a course.
        exams: withSeq.sort((a, b) => b.seq - a.seq),
      };
    })
    .sort((a, b) => a.courseCode.localeCompare(b.courseCode) || a.part.localeCompare(b.part));
}

export function ResultsPortalPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['conducted-results'],
    queryFn: fetchConductedResults,
  });
  const exams = useMemo(() => data ?? [], [data]);

  const [batch, setBatch] = useState<string>(CURRENT);
  const [semester, setSemester] = useState<string>('');

  // Distinct batches (sessions) present, newest-first, flagged if current.
  const batches = useMemo(() => {
    const m = new Map<string, { publicId: string; name: string; isCurrent: boolean }>();
    for (const e of exams) {
      if (!e.batchPublicId || !e.batchName) continue;
      const prev = m.get(e.batchPublicId);
      m.set(e.batchPublicId, {
        publicId: e.batchPublicId,
        name: e.batchName,
        isCurrent: (prev?.isCurrent ?? false) || e.isCurrentBatch,
      });
    }
    return [...m.values()].sort((a, b) => b.name.localeCompare(a.name));
  }, [exams]);

  const hasPrevious = batches.some((b) => !b.isCurrent);

  // Exams for the chosen session (Current = every current-batch exam).
  const sessionExams = useMemo(
    () =>
      batch === CURRENT
        ? exams.filter((e) => e.isCurrentBatch)
        : exams.filter((e) => e.batchPublicId === batch),
    [exams, batch],
  );

  // Semesters available within the chosen session.
  const semesters = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of sessionExams) m.set(e.semesterNumber, e.semesterLabel);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [sessionExams]);

  const visible = semester
    ? sessionExams.filter((e) => String(e.semesterNumber) === semester)
    : sessionExams;
  const groups = useMemo(() => groupByCourse(visible), [visible]);

  const selectClass =
    'border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="w-full">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Results</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The current session’s courses by default. Use the filter to open a previous session’s
          results.
        </p>
      </header>

      {/* Session + semester filter */}
      <Card className="mb-5 flex flex-wrap items-end gap-3 p-4">
        <div className="flex items-center gap-1.5 self-center">
          <SlidersHorizontal className="text-muted-foreground size-3.5" />
          <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            Filter
          </span>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Session</span>
          <select
            value={batch}
            onChange={(e) => {
              setBatch(e.target.value);
              setSemester('');
            }}
            className={selectClass}
          >
            <option value={CURRENT}>Current session</option>
            {batches.map((b) => (
              <option key={b.publicId} value={b.publicId}>
                {sessionRange({ name: b.name })}
                {b.isCurrent ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Semester</span>
          <select
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            disabled={semesters.length === 0}
            className={selectClass}
          >
            <option value="">All semesters</option>
            {semesters.map(([num, label]) => (
              <option key={num} value={String(num)}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {!hasPrevious && (
          <span className="text-muted-foreground self-center text-xs">
            Previous sessions appear here once a batch advances past these courses.
          </span>
        )}
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <BarChart3 className="text-muted-foreground size-8" />
          <p className="font-medium">
            {batch === CURRENT
              ? 'No conducted exams this session'
              : 'No results for this selection'}
          </p>
          <p className="text-muted-foreground max-w-sm text-sm">
            {batch === CURRENT
              ? 'Once an exam goes live and students sit it, it appears here with the full mark sheet.'
              : 'Try another session or semester.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <BookOpen className="text-primary size-4 shrink-0" />
                <h2 className="text-sm font-semibold tracking-tight">
                  <span className="font-mono">{g.courseCode}</span> · {g.courseName} · {g.part}
                </h2>
                {g.batchName && (
                  <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                    <Users className="size-3" /> {sessionLabel({ name: g.batchName })}
                    {g.isCurrentBatch && (
                      <span className="text-success ml-0.5 font-medium">· current</span>
                    )}
                  </span>
                )}
              </div>
              <div className="space-y-2.5">
                {g.exams.map((exam) => (
                  <ExamRow
                    key={exam.publicId}
                    exam={exam}
                    onOpen={() => navigate(`/exam-results/${exam.publicId}`)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ExamRow({
  exam,
  onOpen,
}: {
  exam: TeacherConductedExam & { seq: number };
  onOpen: () => void;
}) {
  return (
    <button type="button" onClick={onOpen} className="w-full text-left">
      <Card className="hover:border-primary/40 flex items-center justify-between gap-4 p-5 transition-colors">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">{exam.title}</h3>
            <StatusPill status={exam.status} />
          </div>
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-3.5" />
              {formatDate(exam.startAt)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" />
              {exam.attempted} sat · {exam.totalMarks} marks · {exam.durationMinutes} min
            </span>
          </div>
        </div>
        <ChevronRight className="text-muted-foreground size-5 shrink-0" />
      </Card>
    </button>
  );
}
