import { useQuery } from '@tanstack/react-query';
import type { PartOption } from '@exam/types';
import { BookOpen, FileCheck2, Plus, TableProperties, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchMyParts } from '@/features/authoring/authoringApi';

export function MyCoursesPage() {
  const navigate = useNavigate();
  const { data: parts, isLoading } = useQuery({
    queryKey: ['my-offering-parts'],
    queryFn: fetchMyParts,
  });

  return (
    <div className="w-full">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">My Courses</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Course parts you are assigned to teach. Create exams from here or from the Exams page.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : !parts || parts.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="bg-muted flex size-14 items-center justify-center rounded-full">
            <BookOpen className="text-muted-foreground size-7" />
          </div>
          <p className="font-medium">No course parts assigned yet</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Ask an admin or department head to assign you to a course part.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {parts.map((part) => (
            <CoursePartCard
              key={part.publicId}
              part={part}
              onCreateExam={() => navigate('/exams/new')}
              onViewExams={() => navigate('/exams')}
              onViewMarks={() => navigate(`/courses/${part.publicId}/marks`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CoursePartCard({
  part,
  onCreateExam,
  onViewExams,
  onViewMarks,
}: {
  part: PartOption;
  onCreateExam: () => void;
  onViewExams: () => void;
  onViewMarks: () => void;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="bg-primary/10 text-primary rounded px-2 py-0.5 font-mono text-xs font-semibold">
              {part.courseCode}
            </span>
            <h3 className="truncate font-semibold">{part.courseTitle}</h3>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Part: <span className="text-foreground font-medium">{part.partName}</span>
            {part.semesterLabel && (
              <>
                {' · '}
                <span className="text-foreground font-medium">{part.semesterLabel}</span>
              </>
            )}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm">
            <Users className="text-muted-foreground size-3.5 shrink-0" />
            {part.currentBatch ? (
              <span className="text-foreground">
                Current batch: <span className="font-medium">{part.currentBatch}</span>
              </span>
            ) : (
              <span className="text-muted-foreground italic">No batch in this semester yet</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onViewMarks}>
            <TableProperties className="size-4" />
            Marks sheet
          </Button>
          <Button variant="outline" size="sm" onClick={onViewExams}>
            <FileCheck2 className="size-4" />
            View exams
          </Button>
          <Button size="sm" onClick={onCreateExam}>
            <Plus className="size-4" />
            New exam
          </Button>
        </div>
      </div>
    </Card>
  );
}
