import type { PaperQuestion } from '@exam/types';
import { cn } from '@/lib/utils';
import { isAnswered, type AnswerState } from './util';

interface Props {
  questions: PaperQuestion[];
  activeIndex: number;
  answers: AnswerState;
  onNavigate: (index: number) => void;
  className?: string;
}

/** Answered/unanswered map. Clicking a number smooth-scrolls to that question (no page nav). */
export function QuestionNavigator({
  questions,
  activeIndex,
  answers,
  onNavigate,
  className,
}: Props) {
  const answeredCount = questions.filter((q) => isAnswered(answers[q.questionPublicId])).length;

  return (
    <nav aria-label="Question navigator" className={className}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Questions</h2>
        <span className="text-muted-foreground text-xs">
          {answeredCount}/{questions.length} answered
        </span>
      </div>
      <div className="grid grid-cols-6 gap-2 md:grid-cols-5">
        {questions.map((q, i) => {
          const answered = isAnswered(answers[q.questionPublicId]);
          const active = i === activeIndex;
          return (
            <button
              key={q.questionPublicId}
              type="button"
              onClick={() => onNavigate(i)}
              aria-current={active ? 'true' : undefined}
              aria-label={`Question ${i + 1}${answered ? ', answered' : ', unanswered'}`}
              className={cn(
                'focus-visible:ring-ring relative flex h-10 items-center justify-center rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : answered
                    ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
                    : 'bg-card hover:bg-accent',
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <ul className="text-muted-foreground mt-4 space-y-1.5 text-xs">
        <li className="flex items-center gap-2">
          <span className="bg-primary/10 border-primary/30 inline-block size-3 rounded-sm border" />{' '}
          Answered
        </li>
        <li className="flex items-center gap-2">
          <span className="bg-card inline-block size-3 rounded-sm border" /> Unanswered
        </li>
      </ul>
    </nav>
  );
}
