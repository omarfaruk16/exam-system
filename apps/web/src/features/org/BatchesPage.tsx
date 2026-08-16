import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Batch } from '@exam/types';
import { ChevronDown, ChevronRight, GraduationCap, Loader2, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  assignBatchSemester,
  changeStudentBatch,
  createBatch,
  fetchBatches,
  fetchPrograms,
  fetchSemesters,
  fetchStudents,
} from './orgApi';

export function BatchesPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['org-batches-all'],
    queryFn: () => fetchBatches(),
  });
  const batches = data ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Batches</h2>
          <p className="text-muted-foreground text-sm">
            Assign a batch to the semester it is currently studying. Its students then see that
            semester’s courses and exams.
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

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : batches.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-14 text-center">
          <GraduationCap className="text-muted-foreground size-7" />
          <p className="font-medium">No batches yet</p>
          <p className="text-muted-foreground text-sm">Create a batch to enrol students.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {batches.map((b) => (
            <BatchRow key={b.publicId} batch={b} allBatches={batches} />
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

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <div className="min-w-0">
            <p className="truncate font-medium">
              {batch.name} <span className="text-muted-foreground font-normal">· {batch.year}</span>
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
              <span className="text-muted-foreground">Not assigned to a semester</span>
            )}
          </span>
          <Button variant="outline" size="sm" onClick={() => setAssigning((v) => !v)}>
            {batch.currentSemester ? 'Change semester' : 'Assign semester'}
          </Button>
        </div>
      </div>

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

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading students…</p>;
  const students = data ?? [];
  if (students.length === 0) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Users className="size-4" /> No students in this batch.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th className="pb-2 font-medium">Student ID</th>
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2 font-medium">Reg. no.</th>
            <th className="pb-2 font-medium">Roll</th>
            <th className="pb-2 font-medium">Move to batch</th>
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
            </tr>
          ))}
        </tbody>
      </table>
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
