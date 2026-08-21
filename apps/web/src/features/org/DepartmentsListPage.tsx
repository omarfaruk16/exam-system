import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Department, Faculty } from '@exam/types';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Loader2,
  Plus,
  Search,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/session';
import { createDepartment, createFaculty, fetchDepartments, fetchFaculties } from './orgApi';

export function DepartmentsListPage() {
  const navigate = useNavigate();
  const { data: user } = useSession();
  const canManage = (user?.roles ?? []).some((r) => r.role === 'admin' || r.role === 'super_admin');

  const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);
  const [search, setSearch] = useState('');
  const [addingFaculty, setAddingFaculty] = useState(false);
  const [addingDept, setAddingDept] = useState(false);

  const facQuery = useQuery({ queryKey: ['org-faculties'], queryFn: fetchFaculties });
  const deptQuery = useQuery({ queryKey: ['org-departments'], queryFn: () => fetchDepartments() });

  const faculties = facQuery.data ?? [];
  const allDepts = deptQuery.data ?? [];
  const isLoading = facQuery.isLoading;

  // ── Faculty list view ────────────────────────────────────────────────────────
  if (!selectedFaculty) {
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Faculties</h2>
            <p className="text-muted-foreground text-sm">
              Select a faculty to view and manage its departments.
            </p>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setAddingFaculty((v) => !v)}>
              <Plus className="size-4" /> Add faculty
            </Button>
          )}
        </div>

        {addingFaculty && canManage && (
          <AddFacultyForm
            onClose={() => setAddingFaculty(false)}
            onCreated={() => setAddingFaculty(false)}
          />
        )}

        {isLoading ? (
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
                onClick={() => {
                  setSelectedFaculty(f);
                  setSearch('');
                  setAddingDept(false);
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Department list view (inside a faculty) ──────────────────────────────────
  const depts = allDepts.filter((d) => d.faculty.publicId === selectedFaculty.publicId);
  const filtered = search.trim()
    ? depts.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
    : depts;

  return (
    <div>
      {/* Breadcrumb */}
      <button
        onClick={() => {
          setSelectedFaculty(null);
          setSearch('');
          setAddingDept(false);
        }}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm font-medium"
      >
        <ChevronLeft className="size-4" /> All faculties
      </button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-muted-foreground mb-0.5 flex items-center gap-1.5 text-xs font-medium">
            <GraduationCap className="size-3.5" /> {selectedFaculty.name}
          </div>
          <h2 className="text-sm font-semibold">Departments</h2>
          <p className="text-muted-foreground text-sm">
            Open a department to manage its degrees, courses, sessions, students, and exams.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setAddingDept((v) => !v)}>
            <Plus className="size-4" /> New department
          </Button>
        )}
      </div>

      {addingDept && canManage && (
        <AddDepartmentForm
          preselectedFacultyId={selectedFaculty.publicId}
          onClose={() => setAddingDept(false)}
          onCreated={() => setAddingDept(false)}
        />
      )}

      {deptQuery.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : depts.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <Building2 className="text-muted-foreground size-8" />
          <p className="font-medium">No departments in this faculty</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Create a department to start building its academic structure.
          </p>
        </Card>
      ) : (
        <>
          {depts.length > 4 && (
            <div className="relative mb-3">
              <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search departments…"
                className="h-9 w-64 pl-8"
              />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((d) => (
              <DepartmentCard
                key={d.publicId}
                dept={d}
                onOpen={() => navigate(`/org/departments/${d.publicId}`)}
              />
            ))}
          </div>
        </>
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

// ── Department card ───────────────────────────────────────────────────────────

function DepartmentCard({ dept, onOpen }: { dept: Department; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="text-left">
      <Card className="hover:border-primary/40 group flex h-full flex-col gap-3 p-5 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
            <Building2 className="size-5" />
          </div>
          <ChevronRight className="text-muted-foreground group-hover:text-foreground size-5 transition-colors" />
        </div>
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{dept.name}</h3>
        </div>
        <p className="text-muted-foreground mt-auto text-xs">
          {dept._count.programs} degree{dept._count.programs === 1 ? '' : 's'} offered
        </p>
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

// ── Add department form ───────────────────────────────────────────────────────

function AddDepartmentForm({
  preselectedFacultyId,
  onClose,
  onCreated,
}: {
  preselectedFacultyId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error('Department name is required');
      return createDepartment({ facultyPublicId: preselectedFacultyId, name: name.trim() });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-departments'] });
      await qc.invalidateQueries({ queryKey: ['org-faculties'] });
      toast.success('Department created');
      onCreated();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not create department'),
  });

  return (
    <Card className="mb-4 p-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
      >
        <div>
          <Label className="text-xs">Department name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Computer Science And Engineering"
            className="mt-1 h-9"
            autoFocus
          />
        </div>
        {error && <p className="text-destructive text-xs">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={create.isPending}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />} Create
          </Button>
        </div>
      </form>
    </Card>
  );
}
