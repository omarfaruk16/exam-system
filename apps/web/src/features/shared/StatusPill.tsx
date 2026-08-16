import { cn } from '@/lib/utils';

// Muted tint background + dark-family text (: never black text on a color).
const STYLE: Record<string, string> = {
  draft: 'bg-slate-500/10 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300',
  in_review: 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300',
  changes_requested: 'bg-orange-500/15 text-orange-800 dark:bg-orange-400/10 dark:text-orange-300',
  rejected: 'bg-red-500/15 text-red-800 dark:bg-red-400/10 dark:text-red-300',
  approved: 'bg-teal-500/15 text-teal-800 dark:bg-teal-400/10 dark:text-teal-300',
  published: 'bg-indigo-500/15 text-indigo-800 dark:bg-indigo-400/10 dark:text-indigo-300',
  live: 'bg-blue-500/15 text-blue-800 dark:bg-blue-400/10 dark:text-blue-300',
  ended: 'bg-slate-500/10 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300',
  grading: 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300',
  results_published:
    'bg-emerald-500/15 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300',
  archived: 'bg-slate-500/10 text-slate-600 dark:bg-slate-400/10 dark:text-slate-400',
  // attempt statuses
  in_progress: 'bg-blue-500/15 text-blue-800 dark:bg-blue-400/10 dark:text-blue-300',
  submitted: 'bg-indigo-500/15 text-indigo-800 dark:bg-indigo-400/10 dark:text-indigo-300',
  graded: 'bg-emerald-500/15 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300',
};

const LABEL: Record<string, string> = {
  draft: 'Draft',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  rejected: 'Rejected',
  approved: 'Approved',
  published: 'Published',
  live: 'Live',
  ended: 'Ended',
  grading: 'Grading',
  results_published: 'Results published',
  archived: 'Archived',
  in_progress: 'In progress',
  submitted: 'Submitted',
  graded: 'Graded',
  awaiting_manual: 'Awaiting grading',
  pending: 'Pending',
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        STYLE[status] ?? 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {LABEL[status] ?? status}
    </span>
  );
}
