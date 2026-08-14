import type { PaperQuestion } from '@exam/types';
import { Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isAnswered, type AnswerState } from './util';

interface Props {
  questions: PaperQuestion[];
  currentIndex: number;
  answers: AnswerState;
  flagged: Set<string>;
  onNavigate: (index: number) => void;
  className?: string;
}

export function QuestionNavigator({
  questions,
  currentIndex,
  answers,
  flagged,
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
          const isFlagged = flagged.has(q.questionPublicId);
          const current = i === currentIndex;
          return (
            <button
              key={q.questionPublicId}
              type="button"
              onClick={() => onNavigate(i)}
              aria-current={current ? 'true' : undefined}
              aria-label={`Question ${i + 1}${answered ? ', answered' : ', unanswered'}${isFlagged ? ', flagged' : ''}`}
              className={cn(
                'focus-visible:ring-ring relative flex h-10 items-center justify-center rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2',
                current
                  ? 'border-primary bg-primary text-primary-foreground'
                  : answered
                    ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
                    : 'bg-card hover:bg-accent',
                isFlagged && !current && 'ring-2 ring-amber-400/70',
              )}
            >
              {i + 1}
              {isFlagged && (
                <Flag className="absolute -right-1.5 -top-1.5 size-3 fill-amber-400 text-amber-500" />
              )}
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
        <li className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-sm ring-2 ring-amber-400/70" /> Flagged
        </li>
      </ul>
    </nav>
  );
}
