import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Batch } from '@exam/types';
import {
  ChevronDown,
  ChevronRight,
  Download,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
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
  assignBatchSemester,
  changeStudentBatch,
  createBatch,
  createStudent,
  deleteBatch,
  deleteStudent,
  downloadExport,
  fetchBatches,
  fetchPrograms,
  fetchSemesters,
  fetchStudents,
  updateBatch,
} from './orgApi';

export function BatchesPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [batchSearch, setBatchSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['org-batches-all'],
    queryFn: () => fetchBatches(),
  });
  const allBatches = data ?? [];
  const batches = batchSearch.trim()
    ? allBatches.filter((b) => {
        const s = batchSearch.toLowerCase();
        return b.name.toLowerCase().includes(s) || String(b.year).includes(s);
      })
    : allBatches;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Batches</h2>
          <p className="text-muted-foreground text-sm">
            Assign a batch to the semester it is currently studying. Its students then see that
            semester's courses and exams.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="size-4" /> New batch
        </Button>
      </div>

      {creating && (
        <CreateBatchForm
          onClose={() => setCreating(false)}
          onCreated={() => {
            void qc.invalidateQueries({ queryKey: ['org-batches-all'] });
            setCreating(false);
          }}
        />
      )}

      {!isLoading && allBatches.length > 0 && (
        <div className="relative mb-3">
          <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={batchSearch}
            onChange={(e) => setBatchSearch(e.target.value)}
            placeholder="Search batches…"
            className="h-9 w-56 pl-8"
          />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : allBatches.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-14 text-center">
          <GraduationCap className="text-muted-foreground size-7" />
          <p className="font-medium">No batches yet</p>
          <p className="text-muted-foreground text-sm">Create a batch to enrol students.</p>
        </Card>
      ) : batches.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <Search className="text-muted-foreground size-6" />
          <p className="text-muted-foreground text-sm">No batches match your search.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {batches.map((b) => (
            <BatchRow key={b.publicId} batch={b} allBatches={allBatches} />
          ))}
        </div>
      )}
    </div>
  );
}

function BatchRow({ batch, allBatches }: { batch: Batch; allBatches: Batch[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editName, setEditName] = useState(batch.name);
  const [editYear, setEditYear] = useState(String(batch.year));

  const semestersQuery = useQuery({
    queryKey: ['org-semesters', batch.program.publicId],
    queryFn: () => fetchSemesters(batch.program.publicId),
    enabled: assigning,
  });

  const assign = useMutation({
    mutationFn: (semesterPublicId: string | null) =>
      assignBatchSemester(batch.publicId, semesterPublicId),
    onSuccess: async () => {
      toast.success('Batch semester updated');
      await qc.invalidateQueries({ queryKey: ['org-batches-all'] });
      setAssigning(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update'),
  });

  const update = useMutation({
    mutationFn: () =>
      updateBatch(batch.publicId, { name: editName.trim(), year: Number(editYear) }),
    onSuccess: async () => {
      toast.success('Batch updated');
      await qc.invalidateQueries({ queryKey: ['org-batches-all'] });
      setEditing(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update batch'),
  });

  const remove = useMutation({
    mutationFn: () => deleteBatch(batch.publicId),
    onSuccess: async () => {
      toast.success('Batch deleted');
      await qc.invalidateQueries({ queryKey: ['org-batches-all'] });
      setConfirmDelete(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete batch'),
  });

  return (
    <Card className="overflow-hidden">
      {editing ? (
        <form
          className="flex flex-wrap items-end gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate();
          }}
        >
          <div>
            <Label className="text-xs">Batch name</Label>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="mt-1 h-9 w-44"
            />
          </div>
          <div>
            <Label className="text-xs">Year</Label>
            <Input
              type="number"
              value={editYear}
              onChange={(e) => setEditYear(e.target.value)}
              className="mt-1 h-9 w-24"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={update.isPending}>
              {update.isPending && <Loader2 className="size-4 animate-spin" />} Save
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditName(batch.name);
                setEditYear(String(batch.year));
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex min-w-0 items-center gap-2 text-left"
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            <div className="min-w-0">
              <p className="truncate font-medium">
                {batch.name}{' '}
                <span className="text-muted-foreground font-normal">· {batch.year}</span>
              </p>
              <p className="text-muted-foreground text-xs">
                {batch.program.name} · {batch._count.students} student
                {batch._count.students === 1 ? '' : 's'}
              </p>
            </div>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs">
              {batch.currentSemester ? (
                <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
                  Semester {batch.currentSemester.number}
                </span>
              ) : (
                <span className="text-muted-foreground">Not assigned</span>
              )}
            </span>
            <Button variant="outline" size="sm" onClick={() => setAssigning((v) => !v)}>
              {batch.currentSemester ? 'Change semester' : 'Assign semester'}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 px-2"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {assigning && (
        <div className="bg-muted/40 border-t p-3">
          <Label className="text-xs">Current semester</Label>
          <div className="mt-1 flex gap-2">
            <select
              className="border-input bg-card focus-visible:ring-ring h-9 flex-1 rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2"
              defaultValue={batch.currentSemester?.publicId ?? ''}
              disabled={assign.isPending}
              onChange={(e) => assign.mutate(e.target.value || null)}
            >
              <option value="">— Not assigned —</option>
              {(semestersQuery.data ?? []).map((s) => (
                <option key={s.publicId} value={s.publicId}>
                  Semester {s.number}
                </option>
              ))}
            </select>
            {assign.isPending && <Loader2 className="size-5 animate-spin self-center" />}
          </div>
        </div>
      )}

      {open && (
        <div className="border-t p-4">
          <StudentList batchPublicId={batch.publicId} allBatches={allBatches} />
        </div>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete batch?</DialogTitle>
            <DialogDescription>
              "{batch.name} ({batch.year})" and its {batch._count.students} student link
              {batch._count.students === 1 ? '' : 's'} will be removed. This is a soft delete.
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
              {remove.isPending && <Loader2 className="size-4 animate-spin" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function StudentList({
  batchPublicId,
  allBatches,
}: {
  batchPublicId: string;
  allBatches: Batch[];
}) {
  const qc = useQueryClient();
  const [addingStudent, setAddingStudent] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['org-students', batchPublicId],
    queryFn: () => fetchStudents(batchPublicId),
  });

  const move = useMutation({
    mutationFn: ({ studentId, batch }: { studentId: string; batch: string }) =>
      changeStudentBatch(studentId, batch),
    onSuccess: async () => {
      toast.success('Student moved');
      await qc.invalidateQueries({ queryKey: ['org-students'] });
      await qc.invalidateQueries({ queryKey: ['org-batches-all'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not move student'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteStudent(id),
    onSuccess: async () => {
      toast.success('Student removed');
      await qc.invalidateQueries({ queryKey: ['org-students'] });
      await qc.invalidateQueries({ queryKey: ['org-batches-all'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not remove student'),
  });

  async function handleExport() {
    setExporting(true);
    try {
      await downloadExport(`/org/students/export?batch=${batchPublicId}`, 'students.xlsx');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  }

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading students…</p>;
  const allStudents = data ?? [];
  const students = search.trim()
    ? allStudents.filter((s) => {
        const q = search.toLowerCase();
        return (
          s.studentId.toLowerCase().includes(q) ||
          s.user.displayName.toLowerCase().includes(q) ||
          (s.registrationNumber?.toLowerCase().includes(q) ?? false) ||
          (s.rollNumber?.toLowerCase().includes(q) ?? false)
        );
      })
    : allStudents;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-muted-foreground text-xs">
            <Users className="mr-1 inline size-3.5" />
            {allStudents.length} student{allStudents.length === 1 ? '' : 's'}
          </p>
          {allStudents.length > 0 && (
            <div className="relative">
              <Search className="text-muted-foreground absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="h-7 w-44 pl-6 text-xs"
              />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Download className="size-3" />
            )}{' '}
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setAddingStudent((v) => !v)}
          >
            <UserPlus className="size-3" /> Add student
          </Button>
        </div>
      </div>

      {addingStudent && (
        <AddStudentForm
          batchPublicId={batchPublicId}
          onClose={() => setAddingStudent(false)}
          onCreated={() => {
            void qc.invalidateQueries({ queryKey: ['org-students', batchPublicId] });
            void qc.invalidateQueries({ queryKey: ['org-batches-all'] });
            setAddingStudent(false);
          }}
        />
      )}

      {allStudents.length === 0 ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          No students in this batch.
        </p>
      ) : students.length === 0 ? (
        <p className="text-muted-foreground text-sm">No students match your search.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="pb-2 font-medium">Student ID</th>
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Reg. no.</th>
                <th className="pb-2 font-medium">Roll</th>
                <th className="pb-2 font-medium">Move to batch</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.publicId} className="border-b last:border-0">
                  <td className="py-2 font-medium tabular-nums">{s.studentId}</td>
                  <td className="py-2">{s.user.displayName}</td>
                  <td className="text-muted-foreground py-2">{s.registrationNumber ?? '—'}</td>
                  <td className="text-muted-foreground py-2">{s.rollNumber ?? '—'}</td>
                  <td className="py-2">
                    <select
                      className="border-input bg-card h-8 rounded-md border px-2 text-xs"
                      value={s.batch.publicId}
                      disabled={move.isPending}
                      onChange={(e) =>
                        e.target.value !== s.batch.publicId &&
                        move.mutate({ studentId: s.publicId, batch: e.target.value })
                      }
                    >
                      {allBatches.map((b) => (
                        <option key={b.publicId} value={b.publicId}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7 px-2"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(s.publicId)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddStudentForm({
  batchPublicId,
  onClose,
  onCreated,
}: {
  batchPublicId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [studentId, setStudentId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [regNo, setRegNo] = useState('');
  const [roll, setRoll] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
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
      toast.success('Student added');
      onCreated();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not add student'),
  });

  return (
    <div className="bg-muted/40 mb-3 rounded-md border p-3">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
      >
        <p className="text-xs font-medium">Add student</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Student ID *</Label>
            <Input
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="e.g. 2024001"
              className="mt-1 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Name *</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Full name"
              className="mt-1 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Reg. number</Label>
            <Input
              value={regNo}
              onChange={(e) => setRegNo(e.target.value)}
              placeholder="e.g. RU-2024-CSE-001"
              className="mt-1 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Roll</Label>
            <Input
              value={roll}
              onChange={(e) => setRoll(e.target.value)}
              placeholder="e.g. 01"
              className="mt-1 h-8"
            />
          </div>
        </div>
        {error && <p className="text-destructive text-xs">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={create.isPending}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />} Add
          </Button>
        </div>
      </form>
    </div>
  );
}

function CreateBatchForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const programsQuery = useQuery({
    queryKey: ['org-programs-all'],
    queryFn: () => fetchPrograms(),
  });
  const [program, setProgram] = useState('');
  const [name, setName] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      if (!program) throw new Error('Select a program');
      return createBatch({ programPublicId: program, name: name.trim(), year: Number(year) });
    },
    onSuccess: () => {
      toast.success('Batch created');
      onCreated();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not create batch'),
  });

  return (
    <Card className="mb-3 p-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
      >
        <div>
          <Label htmlFor="b-program" className="text-xs">
            Program
          </Label>
          <select
            id="b-program"
            value={program}
            onChange={(e) => setProgram(e.target.value)}
            className="border-input bg-card focus-visible:ring-ring mt-1 flex h-9 w-full rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2"
          >
            <option value="">Select…</option>
            {(programsQuery.data ?? []).map((p) => (
              <option key={p.publicId} value={p.publicId}>
                {p.department.name} · {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="b-name" className="text-xs">
              Batch name
            </Label>
            <Input
              id="b-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 2024 Batch"
              className="mt-1 h-9"
            />
          </div>
          <div>
            <Label htmlFor="b-year" className="text-xs">
              Year
            </Label>
            <Input
              id="b-year"
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
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
