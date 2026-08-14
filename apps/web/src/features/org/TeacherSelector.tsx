import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, X } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { fetchTeachers } from './orgApi';

/** Searchable teacher picker scoped to a department. Calls onPick with a publicId, or null to unassign. */
export function TeacherSelector({
  departmentPublicId,
  currentTeacherPublicId,
  onPick,
  pending,
}: {
  departmentPublicId: string;
  currentTeacherPublicId: string | null;
  onPick: (teacherPublicId: string | null) => void;
  pending: boolean;
}) {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['org-teachers', departmentPublicId],
    queryFn: () => fetchTeachers(departmentPublicId),
  });
  const teachers = (data ?? []).filter((t) => {
    const s = q.trim().toLowerCase();
    return !s || t.displayName.toLowerCase().includes(s) || t.username.toLowerCase().includes(s);
  });

  return (
    <div className="bg-muted/40 mt-3 rounded-md border p-3">
      <div className="relative">
        <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or username…"
          className="h-9 pl-8"
          autoFocus
        />
      </div>

      <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
        {isLoading ? (
          <p className="text-muted-foreground flex items-center gap-2 py-3 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading teachers…
          </p>
        ) : teachers.length === 0 ? (
          <p className="text-muted-foreground py-3 text-sm">
            No teachers found in this department.
          </p>
        ) : (
          teachers.map((t) => {
            const active = t.publicId === currentTeacherPublicId;
            return (
              <button
                key={t.publicId}
                type="button"
                disabled={pending}
                onClick={() => onPick(t.publicId)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                  active ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{t.displayName}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {t.username}
                    {t.designation ? ` · ${t.designation}` : ''}
                  </span>
                </span>
                {active && <span className="text-primary shrink-0 text-xs">Assigned</span>}
              </button>
            );
          })
        )}
      </div>

      {currentTeacherPublicId && (
        <button
          type="button"
          disabled={pending}
          onClick={() => onPick(null)}
          className="text-destructive mt-2 inline-flex items-center gap-1 text-xs hover:underline"
        >
          <X className="size-3" /> Unassign current teacher
        </button>
      )}
    </div>
  );
}
