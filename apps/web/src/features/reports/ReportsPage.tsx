import { useQuery } from '@tanstack/react-query';
import type { ExamListItem } from '@exam/types';
import { BarChart3, User } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchExams } from '../authoring/authoringApi';
import { StatusPill } from '../shared/StatusPill';
import { ReportJob } from './ReportJob';
import { StudentSelector } from './StudentSelector';

export function ReportsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['authoring-exams'], queryFn: fetchExams });
  const exams = data ?? [];
  const published = exams.filter((e) => e.status === 'results_published');
  const others = exams.filter((e) => e.status !== 'results_published');

  return (
    <div className="w-full">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Download overall and individual mark sheets once results are published.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : exams.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <BarChart3 className="text-muted-foreground size-8" />
          <p className="font-medium">No exams yet</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {published.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                Results published
              </h2>
              {published.map((e) => (
                <ExamReportCard key={e.publicId} exam={e} />
              ))}
            </section>
          )}
          {others.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                Not yet available
              </h2>
              {others.map((e) => (
                <ExamReportCard key={e.publicId} exam={e} />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ExamReportCard({ exam }: { exam: ExamListItem }) {
  const published = exam.status === 'results_published';
  const [showIndividual, setShowIndividual] = useState(false);
  const [student, setStudent] = useState<{ publicId: string; name: string } | null>(null);

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">{exam.title}</h3>
            <StatusPill status={exam.status} />
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {exam.courseCode} · {exam.part}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {published ? (
            <>
              <ReportJob examPublicId={exam.publicId} type="overall" label="Overall mark sheet" />
              <Button variant="outline" size="sm" onClick={() => setShowIndividual((v) => !v)}>
                <User className="size-4" /> Individual
              </Button>
            </>
          ) : (
            <span title="Available after results are published">
              <Button variant="outline" size="sm" disabled>
                Overall mark sheet
              </Button>
            </span>
          )}
        </div>
      </div>

      {published && showIndividual && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <p className="text-sm font-medium">Individual mark sheet</p>
          <StudentSelector
            examPublicId={exam.publicId}
            selectedPublicId={student?.publicId ?? null}
            onSelect={(publicId, name) => setStudent({ publicId, name })}
          />
          {student && (
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <span className="text-sm font-medium">{student.name}</span>
              <ReportJob
                key={student.publicId}
                examPublicId={exam.publicId}
                type="individual"
                studentPublicId={student.publicId}
                label="Generate"
              />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
