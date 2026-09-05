import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TeacherRow } from '@exam/types';
import { KeyRound, Loader2, Pencil, Plus, Search, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
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
import {
  createTeacher,
  deleteTeacher,
  fetchDepartments,
  fetchTeachersAdmin,
  setTeacherPassword,
  updateTeacher,
} from './orgApi';
import { ImportExportBar } from './ImportExportBar';

export function TeachersPage() {
  const qc = useQueryClient();
  const [deptFilter, setDeptFilter] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['org-teachers-admin', deptFilter || undefined],
    queryFn: () => fetchTeachersAdmin(deptFilter || undefined),
  });
  const deptQuery = useQuery({
    queryKey: ['org-departments-all'],
    queryFn: () => fetchDepartments(),
  });
  const allTeachers = data ?? [];
  const teachers = search.trim()
    ? allTeachers.filter((t) => {
        const s = search.toLowerCase();
        return (
          t.user.displayName.toLowerCase().includes(s) ||
          (t.user.email?.toLowerCase().includes(s) ?? false) ||
          t.department.name.toLowerCase().includes(s) ||
          (t.designation?.toLowerCase().includes(s) ?? false)
        );
      })
    : allTeachers;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Teachers</h2>
          <p className="text-muted-foreground text-sm">
            Teachers sign in with their email. Initial password is{' '}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">Teacher@12345</code> (they change
            it on first login).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportExportBar
            entity="teachers"
            label="teachers"
            exportFilter={deptFilter || undefined}
            onImported={() => qc.invalidateQueries({ queryKey: ['org-teachers-admin'] })}
          />
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="size-4" /> Add teacher
          </Button>
        </div>
      </div>

      {adding && (
        <AddTeacherForm
          departments={deptQuery.data ?? []}
          onClose={() => setAdding(false)}
          onCreated={() => {
            void qc.invalidateQueries({ queryKey: ['org-teachers-admin'] });
            setAdding(false);
          }}
        />
      )}

      {/* Filters */}
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, dept…"
            className="h-9 w-64 pl-8"
          />
        </div>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="border-input bg-card focus-visible:ring-ring h-9 rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2"
        >
          <option value="">All departments</option>
          {(deptQuery.data ?? []).map((d) => (
            <option key={d.publicId} value={d.publicId}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : allTeachers.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-14 text-center">
          <Users className="text-muted-foreground size-7" />
          <p className="font-medium">No teachers yet</p>
          <p className="text-muted-foreground text-sm">
            Add teachers manually, or use Import above.
          </p>
        </Card>
      ) : teachers.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <Search className="text-muted-foreground size-6" />
          <p className="text-muted-foreground text-sm">No teachers match your search.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Designation</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {teachers.map((t) => (
                  <TeacherRow
                    key={t.publicId}
                    teacher={t}
                    departments={deptQuery.data ?? []}
                    onMutated={() => qc.invalidateQueries({ queryKey: ['org-teachers-admin'] })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function TeacherRow({
  teacher,
  departments,
  onMutated,
}: {
  teacher: TeacherRow;
  departments: { publicId: string; name: string }[];
  onMutated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('Teacher@12345');
  const [designation, setDesignation] = useState(teacher.designation ?? '');
  const [displayName, setDisplayName] = useState(teacher.user.displayName);

  const setPassword = useMutation({
    mutationFn: () => setTeacherPassword(teacher.publicId, newPassword.trim() || undefined),
    onSuccess: () => {
      toast.success('Password set — the teacher changes it on next login');
      setSettingPassword(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not set password'),
  });

  const update = useMutation({
    mutationFn: () =>
      updateTeacher(teacher.publicId, {
        designation: designation.trim() || undefined,
        displayName: displayName.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Teacher updated');
      onMutated();
      setEditing(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update'),
  });

  const remove = useMutation({
    mutationFn: () => deleteTeacher(teacher.publicId),
    onSuccess: () => {
      toast.success('Teacher removed');
      onMutated();
      setConfirmDelete(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete'),
  });

  void departments;

  if (editing) {
    return (
      <tr className="bg-muted/30 border-b last:border-0">
        <td className="px-4 py-2" colSpan={5}>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate();
            }}
          >
            <div className="min-w-[160px]">
              <Label className="text-xs">Display name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 h-8"
              />
            </div>
            <div className="min-w-[160px]">
              <Label className="text-xs">Designation</Label>
              <Input
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="e.g. Associate Professor"
                className="mt-1 h-8"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={update.isPending}>
                {update.isPending && <Loader2 className="size-4 animate-spin" />} Save
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="border-b last:border-0">
        <td className="px-4 py-3 font-medium">{teacher.user.displayName}</td>
        <td className="text-muted-foreground px-4 py-3">{teacher.user.email ?? '—'}</td>
        <td className="px-4 py-3">{teacher.department.name}</td>
        <td className="text-muted-foreground px-4 py-3">{teacher.designation ?? '—'}</td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              title="Set password"
              onClick={() => {
                setNewPassword('Teacher@12345');
                setSettingPassword(true);
              }}
            >
              <KeyRound className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7 px-2"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </td>
      </tr>

      <Dialog open={settingPassword} onOpenChange={setSettingPassword}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" /> Set password
            </DialogTitle>
            <DialogDescription>
              Set a sign-in password for <strong>{teacher.user.displayName}</strong> (
              {teacher.user.email ?? 'no email'}). They will be prompted to change it on next login.
              The default is <code>Teacher@12345</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`tpw-${teacher.publicId}`} className="text-xs">
              New password
            </Label>
            <Input
              id={`tpw-${teacher.publicId}`}
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingPassword(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => setPassword.mutate()}
              disabled={setPassword.isPending || newPassword.trim().length < 8}
            >
              {setPassword.isPending && <Loader2 className="size-4 animate-spin" />} Set password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove teacher?</DialogTitle>
            <DialogDescription>
              "{teacher.user.displayName}" will be deactivated. This cannot be undone from the UI.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              {remove.isPending && <Loader2 className="size-4 animate-spin" />} Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddTeacherForm({
  departments,
  onClose,
  onCreated,
}: {
  departments: { publicId: string; name: string; faculty?: { name: string } }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [dept, setDept] = useState('');
  const [designation, setDesignation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      if (!dept) throw new Error('Select a department');
      if (!displayName.trim()) throw new Error('Display name is required');
      if (!email.trim()) throw new Error('Email is required');
      return createTeacher({
        displayName: displayName.trim(),
        email: email.trim(),
        departmentPublicId: dept,
        designation: designation.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Teacher created');
      onCreated();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not create teacher'),
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
        <p className="text-sm font-medium">New teacher</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="t-name" className="text-xs">
              Display name
            </Label>
            <Input
              id="t-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Dr. John Doe"
              className="mt-1 h-9"
            />
          </div>
          <div>
            <Label htmlFor="t-email" className="text-xs">
              Email
            </Label>
            <Input
              id="t-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-9"
            />
          </div>
          <div>
            <Label htmlFor="t-dept" className="text-xs">
              Department
            </Label>
            <select
              id="t-dept"
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="border-input bg-card focus-visible:ring-ring mt-1 flex h-9 w-full rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2"
            >
              <option value="">Select…</option>
              {departments.map((d) => (
                <option key={d.publicId} value={d.publicId}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="t-desig" className="text-xs">
              Designation (optional)
            </Label>
            <Input
              id="t-desig"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="e.g. Associate Professor"
              className="mt-1 h-9"
            />
          </div>
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
