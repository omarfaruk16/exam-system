import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StudentRow } from '@exam/types';
import { GraduationCap, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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
  changeStudentBatch,
  createStudent,
  deleteStudent,
  fetchBatches,
  fetchStudents,
  updateStudent,
} from './orgApi';
import { ImportExportBar } from './ImportExportBar';

export function StudentsPage() {
  const qc = useQueryClient();
  const [batchFilter, setBatchFilter] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const batchQuery = useQuery({ queryKey: ['org-batches-all'], queryFn: () => fetchBatches() });
  const { data, isLoading } = useQuery({
    queryKey: ['org-students', batchFilter || undefined],
    queryFn: () => fetchStudents(batchFilter || undefined),
  });
  const allStudents = data ?? [];
  const students = search.trim()
    ? allStudents.filter((s) => {
        const q = search.toLowerCase();
        return (
          s.studentId.toLowerCase().includes(q) ||
          s.user.displayName.toLowerCase().includes(q) ||
          (s.registrationNumber?.toLowerCase().includes(q) ?? false) ||
          (s.rollNumber?.toLowerCase().includes(q) ?? false) ||
          s.batch.name.toLowerCase().includes(q)
        );
      })
    : allStudents;

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['org-students'] });
    void qc.invalidateQueries({ queryKey: ['org-batches-all'] });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Students</h2>
          <p className="text-muted-foreground text-sm">
            Manage student accounts across all batches. Temp password on creation:
            studentId@Exam123.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportExportBar
            entity="students"
            label="students"
            batchPublicId={batchFilter || undefined}
            exportFilter={batchFilter || undefined}
            disabledReason={batchFilter ? undefined : 'Pick a batch (filter) to import into'}
            onImported={invalidate}
          />
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="size-4" /> Add student
          </Button>
        </div>
      </div>

      {adding && (
        <AddStudentForm
          batches={batchQuery.data ?? []}
          defaultBatchId={batchFilter}
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
            placeholder="Search by ID, name, reg no…"
            className="h-9 w-64 pl-8"
          />
        </div>
        <select
          value={batchFilter}
          onChange={(e) => setBatchFilter(e.target.value)}
          className="border-input bg-card focus-visible:ring-ring h-9 rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2"
        >
          <option value="">All batches</option>
          {(batchQuery.data ?? []).map((b) => (
            <option key={b.publicId} value={b.publicId}>
              {b.name} ({b.year})
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : allStudents.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-14 text-center">
          <GraduationCap className="text-muted-foreground size-7" />
          <p className="font-medium">No students yet</p>
          <p className="text-muted-foreground text-sm">Add students manually or use Bulk import.</p>
        </Card>
      ) : students.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <Search className="text-muted-foreground size-6" />
          <p className="text-muted-foreground text-sm">No students match your search.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="px-4 py-3 font-medium">Student ID</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Reg. no.</th>
                  <th className="px-4 py-3 font-medium">Roll</th>
                  <th className="px-4 py-3 font-medium">Batch</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <StudentRowItem
                    key={s.publicId}
                    student={s}
                    allBatches={batchQuery.data ?? []}
                    onMutated={invalidate}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground border-t px-4 py-2 text-xs">
            {students.length} of {allStudents.length} student{allStudents.length === 1 ? '' : 's'}
          </p>
        </Card>
      )}
    </div>
  );
}

function StudentRowItem({
  student,
  allBatches,
  onMutated,
}: {
  student: StudentRow;
  allBatches: { publicId: string; name: string; year: number }[];
  onMutated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [eName, setEName] = useState(student.user.displayName);
  const [eEmail, setEEmail] = useState(student.user.email ?? '');
  const [eReg, setEReg] = useState(student.registrationNumber ?? '');
  const [eRoll, setERoll] = useState(student.rollNumber ?? '');

  function startEdit() {
    setEName(student.user.displayName);
    setEEmail(student.user.email ?? '');
    setEReg(student.registrationNumber ?? '');
    setERoll(student.rollNumber ?? '');
    setEditing(true);
  }

  const update = useMutation({
    mutationFn: () =>
      updateStudent(student.publicId, {
        displayName: eName.trim() || undefined,
        email: eEmail.trim() || undefined,
        registrationNumber: eReg.trim() || undefined,
        rollNumber: eRoll.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Student updated');
      setEditing(false);
      onMutated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update'),
  });

  const move = useMutation({
    mutationFn: (batchPublicId: string) => changeStudentBatch(student.publicId, batchPublicId),
    onSuccess: () => {
      toast.success('Batch updated');
      onMutated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not change batch'),
  });

  const remove = useMutation({
    mutationFn: () => deleteStudent(student.publicId),
    onSuccess: () => {
      toast.success('Student removed');
      onMutated();
      setConfirmDelete(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete'),
  });

  if (editing) {
    return (
      <tr className="bg-muted/30 border-b last:border-0">
        <td className="px-4 py-2" colSpan={7}>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate();
            }}
          >
            <div>
              <Label className="mb-1 block text-xs">Name</Label>
              <Input
                value={eName}
                onChange={(e) => setEName(e.target.value)}
                className="h-8 w-44 text-sm"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Email</Label>
              <Input
                type="email"
                value={eEmail}
                onChange={(e) => setEEmail(e.target.value)}
                className="h-8 w-44 text-sm"
                placeholder="—"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Reg. number</Label>
              <Input
                value={eReg}
                onChange={(e) => setEReg(e.target.value)}
                className="h-8 w-40 text-sm"
                placeholder="—"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Roll</Label>
              <Input
                value={eRoll}
                onChange={(e) => setERoll(e.target.value)}
                className="h-8 w-24 text-sm"
                placeholder="—"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={update.isPending}>
                {update.isPending && <Loader2 className="size-3.5 animate-spin" />} Save
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
        <td className="px-4 py-3 font-medium tabular-nums">{student.studentId}</td>
        <td className="px-4 py-3">{student.user.displayName}</td>
        <td className="text-muted-foreground px-4 py-3">{student.user.email ?? '—'}</td>
        <td className="text-muted-foreground px-4 py-3">{student.registrationNumber ?? '—'}</td>
        <td className="text-muted-foreground px-4 py-3">{student.rollNumber ?? '—'}</td>
        <td className="px-4 py-3">
          {allBatches.length > 1 ? (
            <select
              className="border-input bg-card h-8 rounded-md border px-2 text-xs"
              value={student.batch.publicId}
              disabled={move.isPending}
              onChange={(e) => {
                if (e.target.value !== student.batch.publicId) {
                  move.mutate(e.target.value);
                }
              }}
            >
              {allBatches.map((b) => (
                <option key={b.publicId} value={b.publicId}>
                  {b.name} ({b.year})
                </option>
              ))}
            </select>
          ) : (
            student.batch.name
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1">
            {move.isPending && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={startEdit}>
              <Pencil className="size-3.5" />
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

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove student?</DialogTitle>
            <DialogDescription>
              "{student.user.displayName}" ({student.studentId}) will be deactivated. This cannot be
              undone from the UI.
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

function AddStudentForm({
  batches,
  defaultBatchId,
  onClose,
  onCreated,
}: {
  batches: { publicId: string; name: string; year: number }[];
  defaultBatchId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [batchPublicId, setBatchPublicId] = useState(defaultBatchId || batches[0]?.publicId || '');
  const [studentId, setStudentId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [regNo, setRegNo] = useState('');
  const [roll, setRoll] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      if (!batchPublicId) throw new Error('Select a batch');
      if (!studentId.trim()) throw new Error('Student ID is required');
      if (!displayName.trim()) throw new Error('Name is required');
      return createStudent({
        studentId: studentId.trim(),
        displayName: displayName.trim(),
        email: email.trim() || undefined,
        batchPublicId,
        registrationNumber: regNo.trim() || undefined,
        rollNumber: roll.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Student created');
      onCreated();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not create student'),
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
        <p className="text-sm font-medium">New student</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="s-batch" className="text-xs">
              Batch
            </Label>
            <select
              id="s-batch"
              value={batchPublicId}
              onChange={(e) => setBatchPublicId(e.target.value)}
              className="border-input bg-card focus-visible:ring-ring mt-1 flex h-9 w-full rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2"
            >
              <option value="">Select…</option>
              {batches.map((b) => (
                <option key={b.publicId} value={b.publicId}>
                  {b.name} ({b.year})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="s-id" className="text-xs">
              Student ID
            </Label>
            <Input
              id="s-id"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="e.g. 2024001"
              className="mt-1 h-9"
            />
          </div>
          <div>
            <Label htmlFor="s-name" className="text-xs">
              Display name
            </Label>
            <Input
              id="s-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Full name"
              className="mt-1 h-9"
            />
          </div>
          <div>
            <Label htmlFor="s-email" className="text-xs">
              Email (optional)
            </Label>
            <Input
              id="s-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-9"
            />
          </div>
          <div>
            <Label htmlFor="s-reg" className="text-xs">
              Reg. number (optional)
            </Label>
            <Input
              id="s-reg"
              value={regNo}
              onChange={(e) => setRegNo(e.target.value)}
              placeholder="e.g. RU-2024-CSE-001"
              className="mt-1 h-9"
            />
          </div>
          <div>
            <Label htmlFor="s-roll" className="text-xs">
              Roll (optional)
            </Label>
            <Input
              id="s-roll"
              value={roll}
              onChange={(e) => setRoll(e.target.value)}
              placeholder="e.g. 01"
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
