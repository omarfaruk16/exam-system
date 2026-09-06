import { useQuery } from '@tanstack/react-query';
import { BookOpen, TriangleAlert } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { sessionLabel } from '@/lib/utils';
import { fetchMyCourses, type MyCourse } from './resultsApi';

export function StudentCoursesPage() {
  const { data, isLoading } = useQuery({ queryKey: ['my-courses'], queryFn: fetchMyCourses });

  if (isLoading) {
    return (
      <div className="w-full space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My Courses</h1>
        {data?.semester && (
          <p className="text-muted-foreground mt-1 text-sm">
            {data.semester.programName} · {data.semester.name}
            {data.batchName && (
              <span className="ml-2 opacity-70">({sessionLabel({ name: data.batchName })})</span>
            )}
          </p>
        )}
      </header>

      {data && !data.enrolled && (
        <Card className="flex items-start gap-3 border-amber-400/40 bg-amber-50 p-4 dark:bg-amber-950/20">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Your account is not linked to a student batch yet. Ask an admin to enrol you.
          </p>
        </Card>
      )}

      {data?.enrolled && !data.semester && (
        <Card className="flex items-start gap-3 border-amber-400/40 bg-amber-50 p-4 dark:bg-amber-950/20">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Your batch has no active semester set. Contact your admin to advance the batch to the
            correct semester.
          </p>
        </Card>
      )}

      {data?.courses && data.courses.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.courses.map((c) => (
            <CourseCard key={c.publicId} course={c} />
          ))}
        </div>
      ) : data?.semester ? (
        <Card className="flex flex-col items-center gap-2 py-14 text-center">
          <BookOpen className="text-muted-foreground size-7" />
          <p className="font-medium">No courses in this semester</p>
          <p className="text-muted-foreground text-sm">
            Your teacher hasn't added any courses yet.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

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
