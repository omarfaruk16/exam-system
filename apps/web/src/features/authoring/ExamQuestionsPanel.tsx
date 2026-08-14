import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ExamDetail, ExamQuestionItem } from '@exam/types';
import { ClipboardList, Loader2, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { removeExamQuestion, reorderExamQuestions, submitExam } from './authoringApi';
import { SortableQuestionRow } from './SortableQuestionRow';

export function ExamQuestionsPanel({
  examPublicId,
  exam,
  questions,
  loading,
  readOnly = false,
}: {
  examPublicId: string;
  exam: ExamDetail;
  questions: ExamQuestionItem[];
  loading: boolean;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [items, setItems] = useState<ExamQuestionItem[]>(questions);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  // Keep local order in sync with the server whenever the query refetches.
  useEffect(() => setItems(questions), [questions]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reorder = useMutation({
    mutationFn: (order: string[]) => reorderExamQuestions(examPublicId, order),
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Could not save the new order');
      void qc.invalidateQueries({ queryKey: ['exam-questions', examPublicId] });
    },
    onSuccess: (fresh) => qc.setQueryData(['exam-questions', examPublicId], fresh),
  });

  const remove = useMutation({
    mutationFn: (examQuestionPublicId: string) =>
      removeExamQuestion(examPublicId, examQuestionPublicId),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['exam-questions', examPublicId] }),
        qc.invalidateQueries({ queryKey: ['authoring-exam', examPublicId] }),
      ]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not remove the question'),
  });

  const submit = useMutation({
    mutationFn: () => submitExam(examPublicId),
    onSuccess: async () => {
      toast.success('Exam submitted for review');
      await qc.invalidateQueries({ queryKey: ['authoring-exams'] });
      navigate('/exams');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not submit the exam'),
  });

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((q) => q.publicId === active.id);
    const newIndex = items.findIndex((q) => q.publicId === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next); // optimistic
    reorder.mutate(next.map((q) => q.publicId));
  }

  const typeOf = (q: ExamQuestionItem) => q.snapshotType ?? q.question.type;
  const mcqCount = items.filter((q) => typeOf(q) === 'mcq').length;
  const writtenCount = items.filter((q) => typeOf(q) === 'written').length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Exam summary</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Questions" value={items.length} />
          <Stat label="Total marks" value={exam.totalMarks} />
          <Stat label="MCQ" value={mcqCount} />
          <Stat label="Written" value={writtenCount} />
        </div>
        <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span>Duration: {exam.durationMinutes} min</span>
          {settingSummary(exam).map((s) => (
            <span key={s}>· {s}</span>
          ))}
        </div>

        {!readOnly && (
          <div className="mt-4 flex justify-end border-t pt-4">
            <Button
              onClick={() => setConfirmSubmit(true)}
              disabled={items.length === 0 || submit.isPending}
            >
              {submit.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Submit for review
            </Button>
          </div>
        )}
      </Card>

      {/* Questions list */}
      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold">
          Questions{' '}
          {items.length > 0 && <span className="text-muted-foreground">({items.length})</span>}
        </h2>

        {loading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="bg-muted h-16 animate-pulse rounded-md" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <ClipboardList className="text-muted-foreground size-7" />
            <p className="text-sm font-medium">No questions yet</p>
            <p className="text-muted-foreground max-w-xs text-xs">
              Add questions from the bank on the left. Drag to reorder them.
            </p>
          </div>
        ) : readOnly ? (
          <ol className="space-y-2">
            {items.map((q, i) => (
              <SortableQuestionRow key={q.publicId} q={q} index={i} readOnly />
            ))}
          </ol>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={items.map((q) => q.publicId)}
              strategy={verticalListSortingStrategy}
            >
              <ol className="space-y-2">
                {items.map((q, i) => (
                  <SortableQuestionRow
                    key={q.publicId}
                    q={q}
                    index={i}
                    onRemove={() => remove.mutate(q.publicId)}
                    removing={remove.isPending && remove.variables === q.publicId}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </Card>

      <Dialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit this exam for admin review?</DialogTitle>
            <DialogDescription>
              You will not be able to edit it until it has been reviewed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSubmit(false)}>
              Cancel
            </Button>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending && <Loader2 className="size-4 animate-spin" />}
              Submit for review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/40 rounded-lg px-3 py-2">
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

function settingSummary(exam: ExamDetail): string[] {
  const s = exam.settings;
  const on: string[] = [];
  if (s.shuffleQuestions) on.push('Shuffle questions');
  if (s.shuffleOptions) on.push('Shuffle options');
  if (s.showMarksAfterSubmit) on.push('Show marks');
  if (s.showExplanation) on.push('Show explanations');
  if (s.negativeMarking) on.push(`Negative marking (−${s.negativeMarkValue})`);
  return on;
}
