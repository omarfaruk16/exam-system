import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  ChevronRight,
  GraduationCap,
  Loader2,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/session';
import { createDepartment, deleteFaculty, fetchFacultyStats, updateFaculty } from './orgApi';

export function FacultyDashboardPage() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: user } = useSession();
  const isAdmin = (user?.roles ?? []).some((r) => r.role === 'admin' || r.role === 'super_admin');

  const [addingDept, setAddingDept] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [facultyName, setFacultyName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deleteFacultyMut = useMutation({
    mutationFn: () => deleteFaculty(publicId!),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-faculties'] });
      toast.success('Faculty deleted');
      navigate('/org');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete faculty'),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['faculty-stats', publicId],
    queryFn: () => fetchFacultyStats(publicId!),
    enabled: Boolean(publicId),
  });

  const updateFacultyMut = useMutation({
    mutationFn: () => updateFaculty(publicId!, { name: facultyName.trim() }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['faculty-stats', publicId] });
      await qc.invalidateQueries({ queryKey: ['org-faculties'] });
      toast.success('Faculty name updated');
      setEditingName(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update'),
  });

  if (isLoading) {
    return (
      <div className="w-full space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="font-medium">Faculty not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/org')}>
          Back to organization
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <button
        onClick={() => navigate('/org')}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> All faculties
      </button>

      {/* Faculty header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          {editingName && isAdmin ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                updateFacultyMut.mutate();
              }}
            >
              <Input
                value={facultyName}
                onChange={(e) => setFacultyName(e.target.value)}
                className="h-9 w-72 text-lg font-semibold"
                autoFocus
              />
              <Button type="submit" size="sm" disabled={updateFacultyMut.isPending}>
                {updateFacultyMut.isPending && <Loader2 className="size-3.5 animate-spin" />} Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditingName(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setFacultyName(data.name);
                    setEditingName(true);
                  }}
                  className="text-muted-foreground hover:text-foreground text-xs underline"
                >
                  Edit
                </button>
              )}
            </div>
          )}
          <p className="text-muted-foreground mt-1 text-sm">Faculty dashboard</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setAddingDept((v) => !v)}>
              <Plus className="size-4" /> New department
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete faculty"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Delete faculty confirmation */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this faculty?</DialogTitle>
            <DialogDescription>
              “{data.name}” will be removed. A faculty that still has departments cannot be deleted
              — remove or move its departments first. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteFacultyMut.mutate()}
              disabled={deleteFacultyMut.isPending}
            >
              {deleteFacultyMut.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete faculty
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Building2} label="Departments" value={data.stats.departmentCount} />
        <StatCard icon={BookOpen} label="Programs" value={data.stats.programCount} />
        <StatCard icon={Users} label="Students" value={data.stats.studentCount} />
        <StatCard icon={GraduationCap} label="Teachers" value={data.stats.teacherCount} />
      </div>

      {/* Add department form */}
      {addingDept && isAdmin && (
        <AddDepartmentForm
          facultyPublicId={publicId!}
          onClose={() => setAddingDept(false)}
          onCreated={() => {
            setAddingDept(false);
            void qc.invalidateQueries({ queryKey: ['faculty-stats', publicId] });
            void qc.invalidateQueries({ queryKey: ['org-faculties'] });
            void qc.invalidateQueries({ queryKey: ['org-departments'] });
          }}
        />
      )}

      {/* Department list */}
      {data.departments.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <Building2 className="text-muted-foreground size-8" />
          <p className="font-medium">No departments yet</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Add a department to start building the academic structure.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.departments.map((dept) => (
            <DeptCard
              key={dept.publicId}
              name={dept.name}
              programCount={dept.programCount}
              onOpen={() => navigate(`/org/departments/${dept.publicId}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-md">
          <Icon className="size-4" />
        </div>
        <div>
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function DeptCard({
  name,
  programCount,
  onOpen,
}: {
  name: string;
  programCount: number;
  onOpen: () => void;
}) {
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
          <h3 className="truncate font-semibold">{name}</h3>
          <p className="text-muted-foreground mt-auto text-xs">
            {programCount} degree{programCount === 1 ? '' : 's'} offered
          </p>
        </div>
      </Card>
    </button>
  );
}

function AddDepartmentForm({
  facultyPublicId,
  onClose,
  onCreated,
}: {
  facultyPublicId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error('Department name is required');
      return createDepartment({ facultyPublicId, name: name.trim() });
    },
    onSuccess: () => {
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
            placeholder="e.g. Computer Science and Engineering"
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
