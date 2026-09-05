import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Faculty } from '@exam/types';
import { ChevronRight, GraduationCap, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/session';
import { createFaculty, fetchFaculties } from './orgApi';
import { ImportExportBar } from './ImportExportBar';

export function DepartmentsListPage() {
  const navigate = useNavigate();
  const { data: user } = useSession();
  const canManage = (user?.roles ?? []).some((r) => r.role === 'admin' || r.role === 'super_admin');

  const [addingFaculty, setAddingFaculty] = useState(false);

  const qc = useQueryClient();
  const facQuery = useQuery({ queryKey: ['org-faculties'], queryFn: fetchFaculties });
  const faculties = facQuery.data ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Faculties</h2>
          <p className="text-muted-foreground text-sm">
            Open a faculty to manage its departments, programs, students and exams.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setAddingFaculty((v) => !v)}>
            <Plus className="size-4" /> Add faculty
          </Button>
        )}
      </div>

      {canManage && (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-24 text-xs font-medium">Faculties</span>
            <ImportExportBar
              entity="faculties"
              label="faculties"
              onImported={() => void qc.invalidateQueries({ queryKey: ['org-faculties'] })}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-24 text-xs font-medium">Departments</span>
            <ImportExportBar
              entity="departments"
              label="departments"
              onImported={() => void qc.invalidateQueries({ queryKey: ['org-faculties'] })}
            />
          </div>
        </div>
      )}

      {addingFaculty && canManage && (
        <AddFacultyForm
          onClose={() => setAddingFaculty(false)}
          onCreated={() => setAddingFaculty(false)}
        />
      )}

      {facQuery.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : faculties.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <GraduationCap className="text-muted-foreground size-8" />
          <p className="font-medium">No faculties yet</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Add a faculty first, then create departments under it.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {faculties.map((f) => (
            <FacultyCard
              key={f.publicId}
              faculty={f}
              onClick={() => navigate(`/org/faculties/${f.publicId}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Faculty card ──────────────────────────────────────────────────────────────

function FacultyCard({ faculty, onClick }: { faculty: Faculty; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card className="hover:border-primary/40 group flex h-full flex-col gap-3 p-5 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
            <GraduationCap className="size-5" />
          </div>
          <ChevronRight className="text-muted-foreground group-hover:text-foreground size-5 transition-colors" />
        </div>
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{faculty.name}</h3>
          <p className="text-muted-foreground text-xs">
            {faculty._count.departments} department{faculty._count.departments === 1 ? '' : 's'}
          </p>
        </div>
      </Card>
    </button>
  );
}

// ── Add faculty form ──────────────────────────────────────────────────────────

function AddFacultyForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error('Faculty name is required');
      return createFaculty({ name: name.trim() });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-faculties'] });
      toast.success('Faculty created');
      setName('');
      onCreated();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not create faculty'),
  });

  return (
    <Card className="mb-4 p-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
      >
        <div className="min-w-[200px] flex-1">
          <Label className="text-xs">Faculty name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Faculty of Engineering"
            className="mt-1 h-9"
            autoFocus
          />
        </div>
        {error && <p className="text-destructive w-full text-xs">{error}</p>}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setName('');
              setError(null);
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={create.isPending || !name.trim()}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />} Create
          </Button>
        </div>
      </form>
    </Card>
  );
}
