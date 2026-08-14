import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { createQuestion } from './authoringApi';

type QType = 'mcq' | 'written';
const EMPTY_OPTIONS = ['', '', '', ''];

export function QuestionCreateForm({ bankPublicId }: { bankPublicId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<QType>('mcq');
  const [text, setText] = useState('');
  const [marks, setMarks] = useState('1');
  const [explanation, setExplanation] = useState('');
  const [modelAnswer, setModelAnswer] = useState('');
  const [options, setOptions] = useState<string[]>(EMPTY_OPTIONS);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [attempted, setAttempted] = useState(false);

  const reset = () => {
    setText('');
    setMarks('1');
    setExplanation('');
    setModelAnswer('');
    setOptions(EMPTY_OPTIONS);
    setCorrectIndex(0);
    setAttempted(false);
  };

  const marksNum = Number(marks);
  const filledOptions = options.map((t) => t.trim());
  const nonEmptyCount = filledOptions.filter(Boolean).length;

  const errors: Record<string, string | undefined> = {
    text: text.trim().length === 0 ? 'Question text is required' : undefined,
    marks: !(marksNum > 0) ? 'Marks must be greater than 0' : undefined,
    options: type === 'mcq' && nonEmptyCount < 2 ? 'Provide at least two options' : undefined,
    correct:
      type === 'mcq' && !filledOptions[correctIndex]
        ? 'The correct option must have text'
        : undefined,
  };
  const hasError = Object.values(errors).some(Boolean);

  const create = useMutation({
    mutationFn: () => {
      const payload =
        type === 'mcq'
          ? {
              bankPublicId,
              type: 'mcq' as const,
              text: text.trim(),
              marks: marksNum,
              explanation: explanation.trim() || undefined,
              options: filledOptions
                .map((t, i) => ({ text: t, isCorrect: i === correctIndex, order: i }))
                .filter((o) => o.text.length > 0),
            }
          : {
              bankPublicId,
              type: 'written' as const,
              text: text.trim(),
              marks: marksNum,
              modelAnswer: modelAnswer.trim() || undefined,
            };
      return createQuestion(payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['bank-questions', bankPublicId] });
      toast.success('Question added to the bank');
      reset();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not create the question'),
  });

  const submit = () => {
    setAttempted(true);
    if (hasError) return;
    create.mutate();
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New question
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">New question</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          Cancel
        </button>
      </div>

      {/* Type toggle */}
      <div className="flex items-center gap-1 rounded-md border p-0.5">
        {(['mcq', 'written'] as QType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              'flex-1 rounded px-2 py-1 text-xs font-medium transition-colors',
              type === t
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t === 'mcq' ? 'MCQ' : 'Written'}
          </button>
        ))}
      </div>

      <div>
        <Label
          htmlFor="q-text"
          className={cn('text-xs', attempted && errors.text && 'text-destructive')}
        >
          Question text
        </Label>
        <Textarea
          id="q-text"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-1 min-h-[60px]"
          aria-invalid={attempted && errors.text ? 'true' : 'false'}
        />
        {attempted && errors.text && <p className="text-destructive mt-1 text-xs">{errors.text}</p>}
      </div>

      <div className="flex items-end gap-3">
        <div>
          <Label
            htmlFor="q-marks"
            className={cn('text-xs', attempted && errors.marks && 'text-destructive')}
          >
            Marks
          </Label>
          <Input
            id="q-marks"
            type="number"
            min={0.25}
            step="0.25"
            value={marks}
            onChange={(e) => setMarks(e.target.value)}
            className="mt-1 h-9 w-24"
            aria-invalid={attempted && errors.marks ? 'true' : 'false'}
          />
        </div>
        {attempted && errors.marks && (
          <p className="text-destructive pb-2 text-xs">{errors.marks}</p>
        )}
      </div>

      {type === 'mcq' ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium">Options (select the correct one)</legend>
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct-option"
                checked={correctIndex === i}
                onChange={() => setCorrectIndex(i)}
                aria-label={`Mark option ${i + 1} correct`}
                className="accent-primary size-4 shrink-0"
              />
              <Input
                value={opt}
                onChange={(e) =>
                  setOptions((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))
                }
                placeholder={`Option ${i + 1}`}
                className="h-9"
                aria-label={`Option ${i + 1} text`}
              />
            </div>
          ))}
          {attempted && (errors.options || errors.correct) && (
            <p className="text-destructive text-xs">{errors.options ?? errors.correct}</p>
          )}
          <div>
            <Label htmlFor="q-expl" className="text-xs">
              Explanation (optional)
            </Label>
            <Textarea
              id="q-expl"
              rows={2}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              className="mt-1 min-h-[48px]"
            />
          </div>
        </fieldset>
      ) : (
        <div>
          <Label htmlFor="q-model" className="text-xs">
            Model answer (optional)
          </Label>
          <Textarea
            id="q-model"
            rows={3}
            value={modelAnswer}
            onChange={(e) => setModelAnswer(e.target.value)}
            className="mt-1 min-h-[60px]"
          />
        </div>
      )}

      <Button size="sm" className="w-full" onClick={submit} disabled={create.isPending}>
        {create.isPending && <Loader2 className="size-4 animate-spin" />}
        Add to bank
      </Button>
    </div>
  );
}
