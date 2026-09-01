import type { PaperQuestion } from '@exam/types';
import { MathText } from '@/components/ui/math-text';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { AnswerValue } from './util';

interface Props {
  question: PaperQuestion;
  index: number;
  value: AnswerValue | undefined;
  disabled: boolean;
  onChange: (patch: Partial<AnswerValue>) => void;
}

/** A single question, rendered in the vertical all-on-one-page list. Anchored as #question-{n}. */
export function QuestionView({ question, index, value, disabled, onChange }: Props) {
  const written = question.type === 'written';
  const number = index + 1;
  return (
    <section
      id={`question-${number}`}
      aria-label={`Question ${number}`}
      className="bg-card scroll-mt-24 rounded-xl border p-6 shadow-sm md:p-8"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Question {number}</h2>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase',
            written
              ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300'
              : 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
          )}
        >
          {written ? 'Written' : 'MCQ'}
        </span>
        <span className="text-muted-foreground text-xs">
          {question.marks} {question.marks === 1 ? 'mark' : 'marks'}
        </span>
      </div>

      <div className="text-foreground mb-6 text-lg leading-relaxed">
        <MathText text={question.text} />
      </div>

      {written ? (
        <div>
          <Textarea
            value={value?.writtenText ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ writtenText: e.target.value })}
            placeholder="Type your answer here…"
            aria-label={`Answer to question ${number}`}
          />
          <p className="text-muted-foreground mt-2 text-xs">
            {(value?.writtenText ?? '').length.toLocaleString()} characters
          </p>
        </div>
      ) : (
        <fieldset disabled={disabled}>
          <legend className="sr-only">Select one option for question {number}</legend>
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
                    <span>
                      <MathText text={opt.text} />
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
    </section>
  );
}
