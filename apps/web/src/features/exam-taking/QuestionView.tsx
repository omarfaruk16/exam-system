import type { PaperQuestion } from '@exam/types';
import { Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { AnswerValue } from './util';

interface Props {
  question: PaperQuestion;
  index: number;
  total: number;
  value: AnswerValue | undefined;
  flagged: boolean;
  disabled: boolean;
  onChange: (patch: Partial<AnswerValue>) => void;
  onToggleFlag: () => void;
}

export function QuestionView({
  question,
  index,
  total,
  value,
  flagged,
  disabled,
  onChange,
  onToggleFlag,
}: Props) {
  const written = question.type === 'written';
  return (
    <div className="bg-card rounded-xl border p-6 shadow-sm md:p-8">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Question {index + 1} of {total} · {question.marks}{' '}
            {question.marks === 1 ? 'mark' : 'marks'} · {written ? 'Written' : 'Multiple choice'}
          </p>
        </div>
        <Button
          type="button"
          variant={flagged ? 'secondary' : 'ghost'}
          size="sm"
          onClick={onToggleFlag}
          aria-pressed={flagged}
          className={cn(flagged && 'text-amber-700 dark:text-amber-300')}
        >
          <Flag className={cn('size-4', flagged && 'fill-amber-400 text-amber-500')} />
          {flagged ? 'Flagged' : 'Flag for review'}
        </Button>
      </div>

      <p className="text-foreground mb-6 text-lg leading-relaxed md:text-xl">{question.text}</p>

      {written ? (
        <div>
          <Textarea
            value={value?.writtenText ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ writtenText: e.target.value })}
            placeholder="Type your answer here…"
            aria-label={`Answer to question ${index + 1}`}
          />
          <p className="text-muted-foreground mt-2 text-xs">
            {(value?.writtenText ?? '').length.toLocaleString()} characters
          </p>
        </div>
      ) : (
        <fieldset disabled={disabled}>
          <legend className="sr-only">Select one option</legend>
          <div className="space-y-3">
            {question.options?.map((opt, i) => {
              const selected = value?.selectedOptionId === opt.id;
              return (
                <label
                  key={opt.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-4 text-base transition-colors',
                    selected
                      ? 'border-primary bg-primary/5 ring-primary ring-1'
                      : 'hover:bg-accent/50',
                    disabled && 'cursor-not-allowed opacity-70',
                  )}
                >
                  <input
                    type="radio"
                    name={question.questionPublicId}
                    value={opt.id}
                    checked={selected}
                    disabled={disabled}
                    onChange={() => onChange({ selectedOptionId: opt.id })}
                    className="mt-1 size-4 shrink-0"
                    style={{ accentColor: 'hsl(var(--primary))' }}
                  />
                  <span className="flex gap-2">
                    <span className="text-muted-foreground font-semibold">
                      {String.fromCharCode(65 + i)}.
                    </span>
                    <span>{opt.text}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
}
