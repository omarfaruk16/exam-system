import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { fetchRoster } from './reportsApi';

/** Searchable enrolled-student picker for an exam's individual mark sheet. */
export function StudentSelector({
  examPublicId,
  selectedPublicId,
  onSelect,
}: {
  examPublicId: string;
  selectedPublicId: string | null;
  onSelect: (studentPublicId: string, name: string) => void;
}) {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['exam-roster', examPublicId],
    queryFn: () => fetchRoster(examPublicId),
  });
  const roster = (data ?? []).filter((s) => {
    const t = q.trim().toLowerCase();
    return !t || s.name.toLowerCase().includes(t) || s.studentId.toLowerCase().includes(t);
  });

  return (
    <div className="bg-muted/40 rounded-md border p-3">
      <div className="relative">
        <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or student ID…"
          className="h-9 pl-8"
        />
      </div>
      <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
        {isLoading ? (
          <p className="text-muted-foreground flex items-center gap-2 py-3 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading roster…
          </p>
        ) : roster.length === 0 ? (
          <p className="text-muted-foreground py-3 text-sm">No students found.</p>
        ) : (
          roster.map((s) => (
            <button
              key={s.publicId}
              type="button"
              onClick={() => onSelect(s.publicId, s.name)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                s.publicId === selectedPublicId ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
              )}
            >
              <span className="truncate font-medium">{s.name}</span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {s.studentId}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
