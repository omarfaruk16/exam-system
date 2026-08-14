import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ExamQuestionItem } from '@exam/types';
import { GripVertical, Loader2, X } from 'lucide-react';
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-card flex items-start gap-3 rounded-md border p-3',
        isDragging && 'z-10 opacity-80 shadow-lg',
      )}
    >
      {!readOnly && (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground mt-0.5 cursor-grab touch-none active:cursor-grabbing"
          aria-label={`Reorder question ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}

      <span className="bg-muted mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums">
        {index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
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
          <span className="text-muted-foreground text-xs tabular-nums">{marks} marks</span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm">{text}</p>
      </div>

      {!readOnly && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Remove question ${index + 1}`}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive mt-0.5 rounded p-1 transition-colors disabled:opacity-50"
        >
          {removing ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
        </button>
      )}
    </li>
  );
}
