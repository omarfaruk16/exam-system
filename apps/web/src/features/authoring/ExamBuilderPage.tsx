import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '../shared/StatusPill';
import { fetchExam, fetchExamQuestions } from './authoringApi';
import { ExamQuestionsPanel } from './ExamQuestionsPanel';
import { QuestionBankPanel } from './QuestionBankPanel';

export function ExamBuilderPage() {
  const { examPublicId } = useParams<{ examPublicId: string }>();
  const navigate = useNavigate();

  const examQuery = useQuery({
    queryKey: ['authoring-exam', examPublicId],
    queryFn: () => fetchExam(examPublicId!),
    enabled: Boolean(examPublicId),
  });
  const questionsQuery = useQuery({
    queryKey: ['exam-questions', examPublicId],
    queryFn: () => fetchExamQuestions(examPublicId!),
    enabled: Boolean(examPublicId),
  });

  if (examQuery.isLoading || !examPublicId) return <BuilderSkeleton />;
  if (examQuery.error || !examQuery.data) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="font-medium">Exam not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/exams')}>
          Back to exams
        </Button>
      </div>
    );
  }

  const exam = examQuery.data;
  const examQuestions = questionsQuery.data ?? [];
  const readOnly = exam.status !== 'draft';
  const addedQuestionIds = new Set(examQuestions.map((eq) => eq.question.publicId));

  return (
    <div className="w-full">
      <button
        onClick={() => navigate('/exams')}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Back to exams
      </button>

      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{exam.title}</h1>
            <StatusPill status={exam.status} />
          </div>
          <p className="text-muted-foreground mt-1 text-sm">{exam.coursePart.name}</p>
        </div>
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/exams/${exam.publicId}/edit`)}
          >
            <Pencil className="size-4" />
            Edit details
          </Button>
        )}
      </header>

      {readOnly ? (
        // Locked exams: no bank browser — just the (snapshot-or-live) question list, read-only.
        <ExamQuestionsPanel
          examPublicId={exam.publicId}
          exam={exam}
          questions={examQuestions}
          loading={questionsQuery.isLoading}
          readOnly
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(340px,380px)_1fr] lg:items-start">
          <QuestionBankPanel
            examPublicId={exam.publicId}
            coursePartPublicId={exam.coursePart.publicId}
            addedQuestionIds={addedQuestionIds}
            nextOrder={examQuestions.length + 1}
          />
          <ExamQuestionsPanel
            examPublicId={exam.publicId}
            exam={exam}
            questions={examQuestions}
            loading={questionsQuery.isLoading}
          />
        </div>
      )}
    </div>
  );
}

function BuilderSkeleton() {
  return (
    <div className="w-full space-y-6">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Skeleton className="h-96 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    </div>
  );
}
