import { AlertTriangle } from 'lucide-react';

/** Amber "changes requested" banner — shared by the teacher exam list and the admin review view. */
export function ChangesRequestedBanner({ note }: { note: string | null }) {
  return (
    <div className="rounded-r-md border-l-2 border-amber-500 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
      <p className="flex items-center gap-1.5 font-medium">
        <AlertTriangle className="size-4" /> Changes requested
      </p>
      <p className="mt-1">
        {note ?? 'The reviewer asked for changes before this exam can be approved.'}
      </p>
    </div>
  );
}
