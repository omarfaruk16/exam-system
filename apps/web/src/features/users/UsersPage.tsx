import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminUserRow } from '@exam/types';
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
import { fetchDepartments, fetchFaculties } from '@/features/org/orgApi';
import {
  createAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  setAdminUserPassword,
  updateAdminUser,
} from './adminUsersApi';

const ROLE_LABELS = {
  admin: 'Admin',
  department_head: 'Department Admin',
} as const;

export function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | 'admin' | 'department_head'>('');
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: fetchAdminUsers,
  });
  const deptQuery = useQuery({
    queryKey: ['org-departments-all'],
    queryFn: () => fetchDepartments(),
  });
  const facQuery = useQuery({ queryKey: ['org-faculties-all'], queryFn: fetchFaculties });

  const allUsers = data ?? [];
  const users = allUsers.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.displayName.toLowerCase().includes(q) ||
      (u.email?.toLowerCase().includes(q) ?? false) ||
      (u.scopeDepartment?.name.toLowerCase().includes(q) ?? false) ||
      (u.scopeFaculty?.name.toLowerCase().includes(q) ?? false)
    );
  });

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['admin-users'] });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Admin &amp; Department Admin accounts</h2>
          <p className="text-muted-foreground text-sm">
            Manage admin and department admin accounts. A temporary password is emailed on creation.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="size-4" /> Add user
        </Button>
      </div>

      {adding && (
        <AddUserForm
          faculties={facQuery.data ?? []}
          departments={deptQuery.data ?? []}
          onClose={() => setAdding(false)}
          onCreated={() => {
            invalidate();
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
            placeholder="Search by name, email…"
            className="h-9 w-60 pl-8"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as '' | 'admin' | 'department_head')}
          className="border-input bg-card focus-visible:ring-ring h-9 rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2"
        >
          <option value="">All roles</option>
          <option value="admin">Admin</option>
          <option value="department_head">Department Admin</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : allUsers.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-14 text-center">
          <Users className="text-muted-foreground size-7" />
          <p className="font-medium">No admin accounts yet</p>
          <p className="text-muted-foreground text-sm">
            Add admins or department heads using the button above.
          </p>
        </Card>
      ) : users.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <Search className="text-muted-foreground size-6" />
          <p className="text-muted-foreground text-sm">No users match your search.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Scope</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <UserRow key={u.publicId} user={u} onMutated={invalidate} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function UserRow({ user, onMutated }: { user: AdminUserRow; onMutated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: () =>
      updateAdminUser(user.publicId, {
        displayName: displayName.trim() || undefined,
        email: email.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('User updated');
      onMutated();
      setEditing(false);
      setEditError(null);
    },
    onError: (e) => setEditError(e instanceof Error ? e.message : 'Could not update'),
  });

  const setPassword = useMutation({
    mutationFn: () => setAdminUserPassword(user.publicId, newPassword),
    onSuccess: () => {
      toast.success('Password updated — user will be prompted to change it on next login');
      onMutated();
      setSettingPassword(false);
      setNewPassword('');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not set password'),
  });

  const remove = useMutation({
    mutationFn: () => deleteAdminUser(user.publicId),
    onSuccess: () => {
      toast.success('User removed');
      onMutated();
      setConfirmDelete(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete'),
  });

  const scope = user.scopeDepartment?.name ?? user.scopeFaculty?.name ?? '—';

  if (editing) {
    return (
      <tr className="bg-muted/30 border-b last:border-0">
        <td className="px-4 py-2" colSpan={5}>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setEditError(null);
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
            <div className="min-w-[200px]">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 h-8"
              />
            </div>
            {editError && <p className="text-destructive w-full text-xs">{editError}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={update.isPending}>
                {update.isPending && <Loader2 className="size-4 animate-spin" />} Save
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setEditError(null);
                  setDisplayName(user.displayName);
                  setEmail(user.email ?? '');
                }}
              >
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
        <td className="px-4 py-3 font-medium">
          {user.displayName}
          {user.mustChangePassword && (
            <span className="text-muted-foreground ml-2 text-xs">(temp pw)</span>
          )}
        </td>
        <td className="text-muted-foreground px-4 py-3">{user.email ?? '—'}</td>
        <td className="px-4 py-3">
          <span
            className={
              user.role === 'admin'
                ? 'bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium'
                : 'bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium'
            }
          >
            {ROLE_LABELS[user.role]}
          </span>
        </td>
        <td className="text-muted-foreground px-4 py-3 text-xs">{scope}</td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              title="Edit"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              title="Set password"
              onClick={() => setSettingPassword(true)}
            >
              <KeyRound className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7 px-2"
              title="Remove"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </td>
      </tr>

      {/* Set password dialog */}
      <Dialog open={settingPassword} onOpenChange={setSettingPassword}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" /> Set password
            </DialogTitle>
            <DialogDescription>
              Set a new password for <strong>{user.displayName}</strong>. They will be prompted to
              change it on next login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-pw" className="text-xs">
              New password
            </Label>
            <Input
              id="new-pw"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSettingPassword(false);
                setNewPassword('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => setPassword.mutate()}
              disabled={setPassword.isPending || newPassword.length < 8}
            >
              {setPassword.isPending && <Loader2 className="size-4 animate-spin" />} Set password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove user?</DialogTitle>
            <DialogDescription>
              "{user.displayName}" will be deactivated. This cannot be undone from the UI.
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

function AddUserForm({
  faculties,
  departments,
  onClose,
  onCreated,
}: {
  faculties: { publicId: string; name: string }[];
  departments: { publicId: string; name: string; faculty?: { name: string } }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [role, setRole] = useState<'admin' | 'department_head'>('admin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [scopeFacultyPublicId, setScopeFacultyPublicId] = useState('');
  const [scopeDepartmentPublicId, setScopeDepartmentPublicId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      if (!displayName.trim()) throw new Error('Display name is required');
      if (!email.trim()) throw new Error('Email is required');
      if (password.trim() && password.trim().length < 8) {
        throw new Error('Password must be at least 8 characters');
      }
      if (role === 'department_head' && !scopeDepartmentPublicId) {
        throw new Error('Select a department for a department admin');
      }
      return createAdminUser({
        displayName: displayName.trim(),
        email: email.trim(),
        role,
        scopeFacultyPublicId: role === 'admin' ? scopeFacultyPublicId || undefined : undefined,
        scopeDepartmentPublicId:
          role === 'department_head' ? scopeDepartmentPublicId || undefined : undefined,
        password: password.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('User created');
      onCreated();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not create user'),
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
        <p className="text-sm font-medium">New admin / department admin</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="au-role" className="text-xs">
              Role
            </Label>
            <select
              id="au-role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'department_head')}
              className="border-input bg-card focus-visible:ring-ring mt-1 flex h-9 w-full rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2"
            >
              <option value="admin">Admin</option>
              <option value="department_head">Department Admin</option>
            </select>
          </div>
          <div>
            <Label htmlFor="au-name" className="text-xs">
              Display name
            </Label>
            <Input
              id="au-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Dr. Jane Smith"
              className="mt-1 h-9"
            />
          </div>
          <div className="col-span-2">
            <Label htmlFor="au-email" className="text-xs">
              Email *
            </Label>
            <Input
              id="au-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="mt-1 h-9"
            />
          </div>

          {role === 'admin' && (
            <div className="col-span-2">
              <Label htmlFor="au-faculty" className="text-xs">
                Faculty scope (optional — leave blank for global admin)
              </Label>
              <select
                id="au-faculty"
                value={scopeFacultyPublicId}
                onChange={(e) => setScopeFacultyPublicId(e.target.value)}
                className="border-input bg-card focus-visible:ring-ring mt-1 flex h-9 w-full rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2"
              >
                <option value="">Global (all faculties)</option>
                {faculties.map((f) => (
                  <option key={f.publicId} value={f.publicId}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {role === 'department_head' && (
            <div className="col-span-2">
              <Label htmlFor="au-dept" className="text-xs">
                Department *
              </Label>
              <select
                id="au-dept"
                value={scopeDepartmentPublicId}
                onChange={(e) => setScopeDepartmentPublicId(e.target.value)}
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
          )}

          <div className="col-span-2">
            <Label htmlFor="au-pw" className="text-xs">
              Initial password (optional)
            </Label>
            <Input
              id="au-pw"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to email a temporary password"
              className="mt-1 h-9"
            />
          </div>
        </div>

        {error && <p className="text-destructive text-xs">{error}</p>}
        <p className="text-muted-foreground text-xs">
          {password.trim()
            ? 'This password will be set now; the user must change it on first login.'
            : 'Leave the password blank to email a temporary password instead.'}
        </p>
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
