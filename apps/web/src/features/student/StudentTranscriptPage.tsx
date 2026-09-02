import { useQuery } from '@tanstack/react-query';
import type { TranscriptExam } from '@exam/types';
import { BookOpen, GraduationCap, Layers } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/features/shared/StatusPill';
import { cn } from '@/lib/utils';
import { fetchMyTranscript } from './resultsApi';

export function StudentTranscriptPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-transcript'],
    queryFn: fetchMyTranscript,
  });

  if (isLoading) {
    return (
      <div className="w-full space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!data || !data.enrolled || !data.program) {
    return (
      <div className="w-full">
        <h1 className="text-2xl font-semibold tracking-tight">My Academic Record</h1>
        <Card className="mt-4 flex flex-col items-center gap-3 py-16 text-center">
          <GraduationCap className="text-muted-foreground size-7" />
          <p className="font-medium">You are not enrolled in a programme yet</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Once an admin assigns you to a batch, your programme, semesters, courses and exams
            appear here.
          </p>
        </Card>
      </div>
    );
  }

  const { student, program, semesters } = data;
  const totalExams = semesters.reduce(
    (n, s) => n + s.courses.reduce((m, c) => m + c.exams.length, 0),
    0,
  );

  return (
    <div className="w-full">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">My Academic Record</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every programme, semester, course and exam you have attended.
        </p>
      </header>

      {/* Programme summary */}
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <GraduationCap className="text-primary size-5 shrink-0" />
              <h2 className="text-lg font-semibold">{program.name}</h2>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {program.department} · {program.faculty}
            </p>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Session <span className="text-foreground font-medium">{program.batch}</span> ·{' '}
              {program.year}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{student?.name}</p>
            <p className="text-muted-foreground tabular-nums">ID {student?.studentId}</p>
            {student?.rollNumber && (
              <p className="text-muted-foreground tabular-nums">Roll {student.rollNumber}</p>
            )}
            {student?.registrationNumber && (
              <p className="text-muted-foreground tabular-nums">Reg {student.registrationNumber}</p>
            )}
          </div>
        </div>
        <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <Layers className="size-3.5" /> {semesters.length} semester
            {semesters.length === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="size-3.5" /> {totalExams} exam{totalExams === 1 ? '' : 's'}{' '}
            attended
          </span>
        </div>
      </Card>

      {semesters.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="font-medium">No exams attended yet</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            When you sit your first exam, it will appear here under its semester and course.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {semesters.map((sem) => (
            <section key={sem.number} className="space-y-3">
              <div className="flex items-center gap-2">
                <Layers className="text-primary size-4" />
                <h2 className="text-base font-semibold tracking-tight">{sem.label}</h2>
              </div>
              {sem.courses.map((course) => (
                <Card key={course.code} className="overflow-hidden p-0">
                  <div className="border-b px-4 py-2.5">
                    <span className="font-mono text-xs font-semibold">{course.code}</span>
                    <span className="ml-2 text-sm font-medium">{course.name}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-max text-sm">
                      <thead>
                        <tr className="text-muted-foreground border-b text-left text-xs">
                          <th className="px-4 py-2 font-medium">Exam</th>
                          <th className="px-4 py-2 font-medium">Part</th>
                          <th className="px-4 py-2 font-medium">Date</th>
                          <th className="px-4 py-2 font-medium">Status</th>
                          <th className="px-4 py-2 text-right font-medium">Marks</th>
                          <th className="px-4 py-2 text-right font-medium">%</th>
                          <th className="px-4 py-2 text-right font-medium">Rank</th>
                        </tr>
                      </thead>
                      <tbody>
                        {course.exams.map((ex) => (
                          <ExamRow key={ex.publicId} ex={ex} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ExamRow({ ex }: { ex: TranscriptExam }) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-2 font-medium">{ex.title}</td>
      <td className="text-muted-foreground px-4 py-2">{ex.part}</td>
      <td className="text-muted-foreground px-4 py-2 text-xs">
        {new Date(ex.date).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })}
      </td>
      <td className="px-4 py-2">
        {ex.attended ? (
          <StatusPill status={ex.status} />
        ) : (
          <span className="text-destructive bg-destructive/10 rounded-full px-2 py-0.5 text-xs font-medium">
            Absent
          </span>
        )}
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {ex.score != null ? (
          <span className="font-medium">
            {ex.score} / {ex.totalMarks}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">{ex.attended ? '—' : '—'}</span>
        )}
      </td>
      <td
        className={cn(
          'px-4 py-2 text-right tabular-nums',
          ex.percentage == null && 'text-muted-foreground',
        )}
      >
        {ex.percentage != null ? `${Math.round(ex.percentage)}%` : '—'}
      </td>
      <td className="text-muted-foreground px-4 py-2 text-right tabular-nums">{ex.rank ?? '—'}</td>
    </tr>
  );
}
