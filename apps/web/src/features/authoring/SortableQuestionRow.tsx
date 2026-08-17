import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ExamQuestionItem } from '@exam/types';
import { GripVertical, Loader2, X } from 'lucide-react';
import { MathText } from '@/components/ui/math-text';
import { cn } from '@/lib/utils';

export function SortableQuestionRow({
  q,
  index,
  onRemove,
  removing,
  readOnly = false,
}: {
  q: ExamQuestionItem;
  index: number;
  onRemove?: () => void;
  removing?: boolean;
  readOnly?: boolean;
}) {
  const sortable = useSortable({ id: q.publicId, disabled: readOnly });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;

  const type = q.snapshotType ?? q.question.type;
  const text = q.snapshotText ?? q.question.text;
  const marks = q.marksOverride ?? q.snapshotMarks ?? q.question.marks;

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-card grid items-start rounded-lg border',
        readOnly ? 'grid-cols-[2rem_1fr_4rem]' : 'grid-cols-[2rem_1.5rem_1fr_4rem_2rem]',
        isDragging && 'z-10 opacity-80 shadow-lg',
      )}
    >
      {/* Drag handle */}
      {!readOnly && (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex h-full cursor-grab touch-none items-start justify-center pt-3 active:cursor-grabbing"
          aria-label={`Reorder question ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}

      {/* Number badge */}
      <div className="flex items-start justify-center pt-3">
        <span className="bg-muted flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums">
          {index + 1}
        </span>
      </div>

      {/* Question body */}
      <div className="min-w-0 py-3 pr-2">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase',
              type === 'mcq'
                ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
                : 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
            )}
          >
            {type}
          </span>
        </div>
        <p className="text-sm leading-snug">
          <MathText text={text} />
        </p>

        {/* MCQ options preview (read-only, collapsed) */}
        {type === 'mcq' && q.question.options.length > 0 && (
          <ul className="mt-2 space-y-1">
            {q.question.options.map((o) => (
              <li
                key={o.publicId}
                className={cn(
                  'rounded px-2 py-0.5 text-xs',
                  o.isCorrect ? 'bg-success/10 text-success font-medium' : 'text-muted-foreground',
                )}
              >
                <MathText text={o.text} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Marks */}
      <div className="pr-3 pt-3 text-right">
        <span className="text-muted-foreground text-xs tabular-nums">{marks} mk</span>
      </div>

      {/* Remove button */}
      {!readOnly && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Remove question ${index + 1}`}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex h-full items-start justify-center rounded-r-lg pt-2.5 transition-colors disabled:opacity-50"
        >
          {removing ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
        </button>
      )}
    </li>
  );
}
