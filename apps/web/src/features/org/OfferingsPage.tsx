import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CourseOffering } from '@exam/types';
import { BookOpen, ChevronDown, ChevronRight, Loader2, Plus, UserCog } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  assignTeacher,
  createOffering,
  fetchBatches,
  fetchCourses,
  fetchOfferingParts,
  fetchOfferings,
  fetchTerms,
} from './orgApi';
import { TeacherSelector } from './TeacherSelector';

export function OfferingsPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['org-offerings'], queryFn: fetchOfferings });
  const offerings = data ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Course offerings</h2>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="size-4" /> New offering
        </Button>
      </div>

      {creating && (
        <CreateOfferingForm
          onClose={() => setCreating(false)}
          onCreated={() => {
            void qc.invalidateQueries({ queryKey: ['org-offerings'] });
            setCreating(false);
          }}
        />
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : offerings.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-14 text-center">
          <BookOpen className="text-muted-foreground size-7" />
          <p className="font-medium">No offerings yet</p>
          <p className="text-muted-foreground text-sm">
            Create an offering to link a course, batch, and term.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {offerings.map((o) => (
            <OfferingRow key={o.publicId} offering={o} />
          ))}
        </div>
      )}
    </div>
  );
}

function OfferingRow({ offering }: { offering: CourseOffering }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted/40 flex w-full items-center gap-3 p-4 text-left transition-colors"
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {offering.course.code} — {offering.course.name}
          </p>
          <p className="text-muted-foreground text-xs">
            {offering.batch.name} · {offering.term.name} ·{' '}
            {offering.course.semester.program.department.name}
          </p>
        </div>
      </button>
      {open && (
        <div className="border-t p-4">
          <OfferingParts
            offeringId={offering.publicId}
            departmentPublicId={offering.course.semester.program.department.publicId}
          />
        </div>
      )}
    </Card>
  );
}

function OfferingParts({
  offeringId,
  departmentPublicId,
}: {
  offeringId: string;
  departmentPublicId: string;
}) {
  const qc = useQueryClient();
  const [assigning, setAssigning] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['org-offering-parts', offeringId],
    queryFn: () => fetchOfferingParts(offeringId),
  });

  const assign = useMutation({
    mutationFn: ({ partId, teacherPublicId }: { partId: string; teacherPublicId: string | null }) =>
      assignTeacher(partId, teacherPublicId),
    onSuccess: async () => {
      toast.success('Teacher assignment updated');
      await qc.invalidateQueries({ queryKey: ['org-offering-parts', offeringId] });
      setAssigning(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not assign teacher'),
  });

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading parts…</p>;
  const parts = data ?? [];
  if (parts.length === 0) {
    return <p className="text-muted-foreground text-sm">No parts for this offering.</p>;
  }

  return (
    <div className="space-y-2">
      {parts.map((p) => (
        <div key={p.publicId} className="rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{p.coursePart.name}</p>
              <p className="text-muted-foreground text-xs">
                {p.assignedTeacher
                  ? `Assigned to ${p.assignedTeacher.user.displayName}`
                  : 'Unassigned'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAssigning(assigning === p.publicId ? null : p.publicId)}
            >
              <UserCog className="size-4" /> Assign teacher
            </Button>
          </div>
          {assigning === p.publicId && (
            <TeacherSelector
              departmentPublicId={departmentPublicId}
              currentTeacherPublicId={p.assignedTeacher?.publicId ?? null}
              pending={assign.isPending}
              onPick={(teacherPublicId) => assign.mutate({ partId: p.publicId, teacherPublicId })}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function CreateOfferingForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const coursesQuery = useQuery({ queryKey: ['org-courses-all'], queryFn: () => fetchCourses() });
  const batchesQuery = useQuery({ queryKey: ['org-batches-all'], queryFn: () => fetchBatches() });
  const termsQuery = useQuery({ queryKey: ['org-terms'], queryFn: fetchTerms });

  const [course, setCourse] = useState('');
  const [batch, setBatch] = useState('');
  const [term, setTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      if (!course || !batch || !term) throw new Error('Select a course, batch, and term');
      return createOffering({ coursePublicId: course, batchPublicId: batch, termPublicId: term });
    },
    onSuccess: () => {
      toast.success('Offering created');
      onCreated();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not create offering'),
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
        <Select
          id="off-course"
          label="Course"
          value={course}
          onChange={setCourse}
          options={(coursesQuery.data ?? []).map((c) => ({
            value: c.publicId,
            label: `${c.code} — ${c.name}`,
          }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            id="off-batch"
            label="Batch"
            value={batch}
            onChange={setBatch}
            options={(batchesQuery.data ?? []).map((b) => ({ value: b.publicId, label: b.name }))}
          />
          <Select
            id="off-term"
            label="Term"
            value={term}
            onChange={setTerm}
            options={(termsQuery.data ?? []).map((t) => ({ value: t.publicId, label: t.name }))}
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

function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-input bg-card focus-visible:ring-ring mt-1 flex h-9 w-full rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2"
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
