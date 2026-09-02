import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Batch, CoursePart, Department, Program, Semester } from '@exam/types';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ClipboardList,
  Download,
  FileText,
  GraduationCap,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react';
import { Fragment, useState } from 'react';
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
import { cn } from '@/lib/utils';
import { fetchDeptBankSummary, fetchDeptExams } from '../authoring/authoringApi';
import {
  assignBatchSemester,
  assignTeacher,
  createBatch,
  createCourse,
  createCoursePart,
  createProgram,
  createSemester,
  createStudent,
  createTeacher,
  deleteBatch,
  deleteCourse,
  deleteCoursePart,
  deleteDepartment,
  deleteProgram,
  deleteSemester,
  deleteStudent,
  downloadExport,
  fetchBatches,
  fetchCourseParts,
  fetchCourses,
  fetchDepartments,
  fetchPrograms,
  fetchSemesters,
  fetchStudents,
  fetchTeacherAssignments,
  deleteTeacher,
  fetchTeachersAdmin,
  updateBatch,
  updateCourse,
  updateCoursePart,
  updateDepartment,
  updateProgram,
  updateSemester,
  updateStudent,
  updateTeacher,
  type TeacherAssignment,
} from './orgApi';
import { TeacherSelector } from './TeacherSelector';
import { ImportModal } from './ImportModal';
import { DEGREE_TYPES } from './orgLevelConfig';

type TabKey =
  'info' | 'degrees' | 'courses' | 'batches' | 'enrollments' | 'students' | 'teachers' | 'exams';

const TABS: { key: TabKey; label: string; icon: typeof BookOpen }[] = [
  { key: 'info', label: 'Info', icon: FileText },
  { key: 'degrees', label: 'Offered Degrees', icon: GraduationCap },
  { key: 'courses', label: 'Courses', icon: BookOpen },
  { key: 'batches', label: 'Sessions', icon: Layers },
  { key: 'enrollments', label: 'Enrollments & Retakes', icon: ClipboardList },
  { key: 'students', label: 'Students', icon: Users },
  { key: 'teachers', label: 'Teachers & Faculty', icon: UserCog },
  { key: 'exams', label: 'Exams & Question Bank', icon: FileText },
];

export function DepartmentProfilePage() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('info');

  const deptsQuery = useQuery({ queryKey: ['org-departments'], queryFn: () => fetchDepartments() });
  const dept = (deptsQuery.data ?? []).find((d) => d.publicId === publicId);

  const programsQuery = useQuery({
    queryKey: ['org-programs', publicId],
    queryFn: () => fetchPrograms(publicId!),
    enabled: Boolean(publicId),
  });
  const teachersQuery = useQuery({
    queryKey: ['org-teachers', publicId],
    queryFn: () => fetchTeachersAdmin(publicId!),
    enabled: Boolean(publicId),
  });
  const batchesQuery = useQuery({
    queryKey: ['org-batches', publicId],
    queryFn: () => fetchBatches(undefined, publicId!),
    enabled: Boolean(publicId),
  });

  if (deptsQuery.isLoading) {
    return (
      <div className="w-full space-y-4">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!dept) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="font-medium">Department not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/org')}>
          Back to departments
        </Button>
      </div>
    );
  }

  const programs = programsQuery.data ?? [];
  const deptBatches = batchesQuery.data ?? [];
  const studentCount = deptBatches.reduce((sum, b) => sum + b._count.students, 0);
  const facultyCount = teachersQuery.data?.length ?? 0;

  return (
    <div className="w-full">
      {/* Header banner */}
      <div className="from-primary/25 relative overflow-hidden rounded-2xl border bg-gradient-to-br to-transparent p-6">
        <button
          onClick={() => navigate('/org')}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium"
        >
          <ChevronLeft className="size-4" /> Back to Departments
          <span className="text-muted-foreground/60 ml-2 uppercase tracking-wide">
            · Academic Department Profile
          </span>
        </button>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="bg-background/60 rounded-md border px-2 py-0.5 text-xs font-medium">
                {dept.faculty.name}
              </span>
              <span className="text-success bg-success/10 rounded-md px-2 py-0.5 text-xs font-medium">
                Active Department
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">{dept.name}</h1>
          </div>

          <div className="bg-background/50 flex gap-6 rounded-xl border px-5 py-3">
            <Stat value={programs.length} label="Degrees" />
            <Stat value={facultyCount} label="Faculty" />
            <Stat value={studentCount} label="Students" />
          </div>
        </div>
      </div>

      {/* Tab menu */}
      <nav className="mt-4 flex flex-wrap gap-x-1 gap-y-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              tab === t.key
                ? 'border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {tab === 'info' && <InfoTab dept={dept} />}
        {tab === 'degrees' && <DegreesTab deptPublicId={dept.publicId} programs={programs} />}
        {tab === 'courses' && <CoursesTab programs={programs} deptPublicId={dept.publicId} />}
        {tab === 'batches' && <BatchesTab programs={programs} batches={deptBatches} />}
        {tab === 'enrollments' && <EnrollmentsTab batches={deptBatches} />}
        {tab === 'students' && <StudentsTab batches={deptBatches} />}
        {tab === 'teachers' && <TeachersTab deptPublicId={dept.publicId} deptName={dept.name} />}
        {tab === 'exams' && <ExamsTab deptPublicId={dept.publicId} />}
      </div>
    </div>
  );
}

/** Only admins may create/edit structure; department heads get a read-only view of their dept. */
function useCanManage() {
  const { data } = useSession();
  return (data?.roles ?? []).some((r) => r.role === 'admin' || r.role === 'super_admin');
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

function SectionHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-sm font-semibold">{title}</h2>
      {action}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-muted-foreground py-8 text-center text-sm">{text}</p>;
}

// ───────────────────────────── Info ─────────────────────────────
function InfoTab({ dept }: { dept: Department }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const canManage = useCanManage();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dept.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useMutation({
    mutationFn: () => updateDepartment(dept.publicId, { name: name.trim() }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-departments'] });
      toast.success('Department updated');
      setEditing(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update'),
  });

  const remove = useMutation({
    mutationFn: () => deleteDepartment(dept.publicId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-departments'] });
      toast.success('Department deleted');
      navigate('/org');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete'),
  });

  return (
    <Card className="p-6">
      <SectionHeading title="Department Information" />
      <div className="max-w-lg space-y-4">
        <div>
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">
            Department name
          </Label>
          <Input
            value={editing ? name : dept.name}
            onChange={(e) => setName(e.target.value)}
            readOnly={!editing}
            className={cn('mt-1.5', !editing && 'text-muted-foreground')}
          />
        </div>
        <div>
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">Faculty</Label>
          <Input value={dept.faculty.name} readOnly className="text-muted-foreground mt-1.5" />
        </div>
      </div>

      <div className={cn('mt-6 flex justify-end gap-2 border-t pt-5', !canManage && 'hidden')}>
        {editing ? (
          <>
            <Button
              variant="outline"
              onClick={() => {
                setName(dept.name);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />} Save
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit Department
            </Button>
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete Department
            </Button>
          </>
        )}
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this department?</DialogTitle>
            <DialogDescription>
              “{dept.name}” and its {dept._count.programs} program
              {dept._count.programs === 1 ? '' : 's'} will be removed (soft delete).
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

// ─────────────────────────── Offered Degrees ───────────────────────────
function DegreesTab({ deptPublicId, programs }: { deptPublicId: string; programs: Program[] }) {
  const qc = useQueryClient();
  const canManage = useCanManage();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [degreeType, setDegreeType] = useState<string>(DEGREE_TYPES[0] ?? 'bachelor');
  const [duration, setDuration] = useState('4');

  const create = useMutation({
    mutationFn: () =>
      createProgram({
        departmentPublicId: deptPublicId,
        name: name.trim(),
        degreeType,
        durationYears: Number(duration),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-programs', deptPublicId] });
      toast.success('Degree added');
      setName('');
      setAdding(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not add degree'),
  });

  return (
    <Card className="p-6">
      <SectionHeading
        title="Offered Degrees"
        action={
          canManage ? (
            <Button size="sm" onClick={() => setAdding((v) => !v)}>
              <Plus className="size-4" /> New degree
            </Button>
          ) : undefined
        }
      />
      {adding && (
        <form
          className="bg-muted/40 mb-4 grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_auto_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Degree name, e.g. B.Sc in CSE"
            className="h-9"
          />
          <select
            value={degreeType}
            onChange={(e) => setDegreeType(e.target.value)}
            className="border-input bg-card h-9 rounded-md border px-2 text-sm capitalize"
          >
            {DEGREE_TYPES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <Input
            type="number"
            min={1}
            max={12}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="h-9 w-24"
            placeholder="Years"
          />
          <Button
            type="submit"
            size="sm"
            className="h-9"
            disabled={create.isPending || !name.trim()}
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />} Add
          </Button>
        </form>
      )}

      {programs.length === 0 ? (
        <Empty text="No degrees offered yet." />
      ) : (
        <ul className="divide-y">
          {programs.map((p) => (
            <ProgramRow
              key={p.publicId}
              program={p}
              deptPublicId={deptPublicId}
              canManage={canManage}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ProgramRow({
  program,
  deptPublicId,
  canManage,
}: {
  program: Program;
  deptPublicId: string;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(program.name);
  const [degreeType, setDegreeType] = useState(program.degreeType);
  const [duration, setDuration] = useState(String(program.durationYears));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      updateProgram(program.publicId, {
        name: name.trim(),
        degreeType,
        durationYears: Number(duration),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-programs', deptPublicId] });
      toast.success('Degree updated');
      setEditing(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update degree'),
  });

  const remove = useMutation({
    mutationFn: () => deleteProgram(program.publicId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-programs', deptPublicId] });
      toast.success('Degree deleted');
      setConfirmDelete(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete degree'),
  });

  if (editing) {
    return (
      <li className="py-3">
        <form
          className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save.mutate();
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" autoFocus />
          <select
            value={degreeType}
            onChange={(e) => setDegreeType(e.target.value)}
            className="border-input bg-card h-9 rounded-md border px-2 text-sm capitalize"
          >
            {DEGREE_TYPES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <Input
            type="number"
            min={1}
            max={12}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="h-9 w-20"
          />
          <div className="flex gap-1">
            <Button type="submit" size="sm" className="h-9" disabled={save.isPending}>
              {save.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => {
                setEditing(false);
                setName(program.name);
                setDegreeType(program.degreeType);
                setDuration(String(program.durationYears));
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <p className="font-medium">{program.name}</p>
        <p className="text-muted-foreground text-xs capitalize">
          {program.degreeType} · {program.durationYears} year
          {program.durationYears === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground hidden text-xs sm:inline">
          {program._count.semesters} semester{program._count.semesters === 1 ? '' : 's'} ·{' '}
          {program._count.batches} session{program._count.batches === 1 ? '' : 's'}
        </span>
        {canManage && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setEditing(true)}
              title="Edit degree"
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10 size-8"
              onClick={() => setConfirmDelete(true)}
              title="Delete degree"
            >
              <Trash2 className="size-4" />
            </Button>
          </>
        )}
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{program.name}”?</DialogTitle>
            <DialogDescription>
              This degree, its {program._count.semesters} semester
              {program._count.semesters === 1 ? '' : 's'} and {program._count.batches} session
              {program._count.batches === 1 ? '' : 's'} will be removed (soft delete).
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
    </li>
  );
}

// ─────────────────────────── Syllabus & Courses ───────────────────────────
function CoursesTab({ programs, deptPublicId }: { programs: Program[]; deptPublicId: string }) {
  const [programId, setProgramId] = useState(programs[0]?.publicId ?? '');
  const active = programs.find((p) => p.publicId === programId) ?? programs[0];

  if (programs.length === 0) {
    return (
      <Card className="p-6">
        <Empty text="Add a degree first, then build its semesters and courses here." />
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <SectionHeading
        title="Courses"
        action={
          programs.length > 1 ? (
            <select
              value={active?.publicId}
              onChange={(e) => setProgramId(e.target.value)}
              className="border-input bg-card h-9 rounded-md border px-2 text-sm"
            >
              {programs.map((p) => (
                <option key={p.publicId} value={p.publicId}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />
      {active && <SemesterList programPublicId={active.publicId} deptPublicId={deptPublicId} />}
    </Card>
  );
}

function SemesterList({
  programPublicId,
  deptPublicId,
}: {
  programPublicId: string;
  deptPublicId: string;
}) {
  const qc = useQueryClient();
  const canManage = useCanManage();
  const [name, setName] = useState('');
  const semestersQuery = useQuery({
    queryKey: ['org-semesters', programPublicId],
    queryFn: () => fetchSemesters(programPublicId),
  });

  const create = useMutation({
    mutationFn: () => createSemester({ programPublicId, name: name.trim() }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-semesters', programPublicId] });
      toast.success('Semester added');
      setName('');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not add semester'),
  });

  const semesters = semestersQuery.data ?? [];
  return (
    <div>
      {canManage && (
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Semester name, e.g. 1st Semester or Fall 2024"
            className="h-9 max-w-sm"
          />
          <Button
            type="submit"
            size="sm"
            className="h-9"
            disabled={create.isPending || !name.trim()}
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />} Add semester
          </Button>
        </form>
      )}
      {semesters.length === 0 ? (
        <Empty text="No semesters yet." />
      ) : (
        <div className="space-y-3">
          {semesters.map((s) => (
            <SemesterCourses key={s.publicId} semester={s} deptPublicId={deptPublicId} />
          ))}
        </div>
      )}
    </div>
  );
}

function SemesterCourses({ semester, deptPublicId }: { semester: Semester; deptPublicId: string }) {
  const qc = useQueryClient();
  const canManage = useCanManage();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [credit, setCredit] = useState('3');
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(semester.name ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const coursesQuery = useQuery({
    queryKey: ['org-courses', semester.publicId],
    queryFn: () => fetchCourses(semester.publicId),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      createCourse({
        semesterPublicId: semester.publicId,
        code: code.trim(),
        name: name.trim(),
        credit: Number(credit),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-courses', semester.publicId] });
      toast.success('Course added');
      setCode('');
      setName('');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not add course'),
  });

  const rename = useMutation({
    mutationFn: () => updateSemester(semester.publicId, { name: editName.trim() }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-semesters'] });
      toast.success('Semester renamed');
      setEditing(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not rename'),
  });

  const remove = useMutation({
    mutationFn: () => deleteSemester(semester.publicId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-semesters'] });
      toast.success('Semester deleted');
      setConfirmDelete(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete'),
  });

  const label = semester.name ?? `Semester ${semester.number}`;
  const courses = coursesQuery.data ?? [];

  return (
    <div className="rounded-lg border">
      <div className="flex w-full items-center justify-between gap-2 px-4 py-3">
        {editing ? (
          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (editName.trim()) rename.mutate();
            }}
          >
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-8 max-w-xs"
              autoFocus
            />
            <Button type="submit" size="sm" className="h-8" disabled={rename.isPending}>
              {rename.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => {
                setEditing(false);
                setEditName(semester.name ?? '');
              }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <>
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex flex-1 items-center gap-2 text-left"
            >
              {open ? (
                <ChevronDown className="text-muted-foreground size-4 shrink-0" />
              ) : (
                <ChevronLeft className="text-muted-foreground size-4 shrink-0 rotate-180" />
              )}
              <span className="font-medium">{label}</span>
            </button>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground mr-1 text-xs">
                {semester._count.courses} course{semester._count.courses === 1 ? '' : 's'}
              </span>
              {canManage && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => {
                      setEditName(semester.name ?? label);
                      setEditing(true);
                    }}
                    title="Rename semester"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 size-7"
                    onClick={() => setConfirmDelete(true)}
                    title="Delete semester"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{label}”?</DialogTitle>
            <DialogDescription>
              This semester and its {semester._count.courses} course
              {semester._count.courses === 1 ? '' : 's'} will be removed (soft delete). Exams and
              question banks under it become inaccessible.
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
      {open && (
        <div className="border-t px-4 py-3">
          {coursesQuery.isLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : courses.length === 0 ? (
            <p className="text-muted-foreground mb-3 text-sm">No courses yet.</p>
          ) : (
            <ul className="mb-3 space-y-2">
              {courses.map((c) => (
                <CourseRow
                  key={c.publicId}
                  course={c}
                  semesterPublicId={semester.publicId}
                  deptPublicId={deptPublicId}
                  canManage={canManage}
                />
              ))}
            </ul>
          )}
          {canManage && (
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim() && name.trim()) create.mutate();
              }}
            >
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Code"
                className="h-8 w-28"
              />
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Course name"
                className="h-8 flex-1"
              />
              <Input
                type="number"
                min={0}
                value={credit}
                onChange={(e) => setCredit(e.target.value)}
                placeholder="Cr"
                className="h-8 w-16"
              />
              <Button type="submit" size="sm" className="h-8" disabled={create.isPending}>
                {create.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// ── A single course: inline edit/delete + expandable parts & teacher assignment ──
function CourseRow({
  course,
  semesterPublicId,
  deptPublicId,
  canManage,
}: {
  course: import('@exam/types').Course;
  semesterPublicId: string;
  deptPublicId: string;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState(course.code);
  const [name, setName] = useState(course.name);
  const [credit, setCredit] = useState(String(course.credit));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      updateCourse(course.publicId, {
        code: code.trim(),
        name: name.trim(),
        credit: Number(credit),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-courses', semesterPublicId] });
      toast.success('Course updated');
      setEditing(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update course'),
  });

  const remove = useMutation({
    mutationFn: () => deleteCourse(course.publicId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-courses', semesterPublicId] });
      toast.success('Course deleted');
      setConfirmDelete(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete course'),
  });

  return (
    <li className="rounded-md border">
      {editing ? (
        <form
          className="flex flex-wrap items-center gap-2 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim() && name.trim()) save.mutate();
          }}
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code"
            className="h-8 w-28"
            autoFocus
          />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Course name"
            className="h-8 flex-1"
          />
          <Input
            type="number"
            min={0}
            value={credit}
            onChange={(e) => setCredit(e.target.value)}
            className="h-8 w-16"
          />
          <Button type="submit" size="sm" className="h-8" disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              setEditing(false);
              setCode(course.code);
              setName(course.name);
              setCredit(String(course.credit));
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <ChevronUp className="text-muted-foreground size-4 shrink-0" />
            ) : (
              <ChevronDown className="text-muted-foreground size-4 shrink-0" />
            )}
            <span className="truncate">
              <span className="font-mono text-xs">{course.code}</span> — {course.name}
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <span className="text-muted-foreground mr-1 text-xs">
              {course.credit} cr · {course._count.parts} part
              {course._count.parts === 1 ? '' : 's'}
            </span>
            {canManage && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setEditing(true)}
                  title="Edit course"
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:bg-destructive/10 size-7"
                  onClick={() => setConfirmDelete(true)}
                  title="Delete course"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {expanded && !editing && (
        <CoursePartsPanel
          coursePublicId={course.publicId}
          deptPublicId={deptPublicId}
          semesterPublicId={semesterPublicId}
          canManage={canManage}
        />
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{course.code}”?</DialogTitle>
            <DialogDescription>
              {course.code} — {course.name} and its {course._count.parts} part
              {course._count.parts === 1 ? '' : 's'} (with any question banks and exams) will be
              removed (soft delete).
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
    </li>
  );
}

// ── Parts of a course + per-part teacher assignment ──
function CoursePartsPanel({
  coursePublicId,
  deptPublicId,
  semesterPublicId,
  canManage,
}: {
  coursePublicId: string;
  deptPublicId: string;
  semesterPublicId: string;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [newPart, setNewPart] = useState('');
  const [weight, setWeight] = useState('100');

  const partsQuery = useQuery({
    queryKey: ['org-course-parts', coursePublicId],
    queryFn: () => fetchCourseParts(coursePublicId),
  });
  const parts = partsQuery.data ?? [];

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['org-course-parts', coursePublicId] });
    await qc.invalidateQueries({ queryKey: ['org-courses', semesterPublicId] });
  };

  const create = useMutation({
    mutationFn: () =>
      createCoursePart({
        coursePublicId,
        name: newPart.trim(),
        marksWeight: Number(weight),
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Part added');
      setNewPart('');
      setWeight('100');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not add part'),
  });

  return (
    <div className="bg-muted/30 space-y-2 border-t px-3 py-3">
      <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
        Parts &amp; assigned teachers
      </p>
      {partsQuery.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : parts.length === 0 ? (
        <p className="text-muted-foreground text-sm">No parts yet. Add one below.</p>
      ) : (
        <ul className="space-y-2">
          {parts.map((p) => (
            <PartRow
              key={p.publicId}
              part={p}
              deptPublicId={deptPublicId}
              onChanged={invalidate}
              canManage={canManage}
            />
          ))}
        </ul>
      )}

      {canManage && (
        <form
          className="flex flex-wrap items-center gap-2 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (newPart.trim()) create.mutate();
          }}
        >
          <Input
            value={newPart}
            onChange={(e) => setNewPart(e.target.value)}
            placeholder="Part name, e.g. Theory / Lab"
            className="h-8 flex-1"
          />
          <Input
            type="number"
            min={0}
            max={100}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="h-8 w-20"
            title="Marks weight (%)"
          />
          <Button type="submit" size="sm" className="h-8" disabled={create.isPending}>
            {create.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}{' '}
            Part
          </Button>
        </form>
      )}
    </div>
  );
}

function PartRow({
  part,
  deptPublicId,
  onChanged,
  canManage,
}: {
  part: CoursePart;
  deptPublicId: string;
  onChanged: () => Promise<void>;
  canManage: boolean;
}) {
  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(part.name);
  const [weight, setWeight] = useState(String(part.marksWeight));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const assign = useMutation({
    mutationFn: (teacherPublicId: string | null) => assignTeacher(part.publicId, teacherPublicId),
    onSuccess: async () => {
      await onChanged();
      toast.success('Teacher assignment updated');
      setAssigning(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not assign teacher'),
  });

  const save = useMutation({
    mutationFn: () =>
      updateCoursePart(part.publicId, { name: name.trim(), marksWeight: Number(weight) }),
    onSuccess: async () => {
      await onChanged();
      toast.success('Part updated');
      setEditing(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update part'),
  });

  const remove = useMutation({
    mutationFn: () => deleteCoursePart(part.publicId),
    onSuccess: async () => {
      await onChanged();
      toast.success('Part deleted');
      setConfirmDelete(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete part'),
  });

  return (
    <li className="bg-card rounded-md border p-2.5">
      {editing ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save.mutate();
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 flex-1"
            autoFocus
          />
          <Input
            type="number"
            min={0}
            max={100}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="h-8 w-20"
          />
          <Button type="submit" size="sm" className="h-8" disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              setEditing(false);
              setName(part.name);
              setWeight(String(part.marksWeight));
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {part.name}{' '}
              <span className="text-muted-foreground text-xs font-normal">
                · {part.marksWeight}% · {part._count.exams} exam
                {part._count.exams === 1 ? '' : 's'}
              </span>
            </p>
            <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
              <UserCog className="size-3" />
              {part.assignedTeacher
                ? `${part.assignedTeacher.user.displayName}${part.assignedTeacher.designation ? ` · ${part.assignedTeacher.designation}` : ''}`
                : 'No teacher assigned'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canManage && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => setAssigning((v) => !v)}
                >
                  <UserCog className="size-3.5" /> {part.assignedTeacher ? 'Change' : 'Assign'}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setEditing(true)}
                  title="Edit part"
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:bg-destructive/10 size-7"
                  onClick={() => setConfirmDelete(true)}
                  title="Delete part"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {assigning && canManage && (
        <TeacherSelector
          departmentPublicId={deptPublicId}
          currentTeacherPublicId={part.assignedTeacher?.publicId ?? null}
          pending={assign.isPending}
          onPick={(teacherPublicId) => assign.mutate(teacherPublicId)}
        />
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete part “{part.name}”?</DialogTitle>
            <DialogDescription>
              This part{part._count.exams > 0 ? `, its ${part._count.exams} exam(s)` : ''} and any
              question banks will be removed (soft delete).
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
    </li>
  );
}

// ─────────────────────────── Sessions (formerly Batches) ─────────────────────
function BatchesTab({ programs, batches }: { programs: Program[]; batches: Batch[] }) {
  const qc = useQueryClient();
  const canManage = useCanManage();
  const [adding, setAdding] = useState(false);
  const [program, setProgram] = useState(programs[0]?.publicId ?? '');
  const [name, setName] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const create = useMutation({
    mutationFn: () =>
      createBatch({ programPublicId: program, name: name.trim(), year: Number(year) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-batches'] });
      toast.success('Session created');
      setName('');
      setAdding(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not create session'),
  });

  return (
    <Card className="p-6">
      <SectionHeading
        title="Sessions"
        action={
          canManage ? (
            <Button size="sm" disabled={programs.length === 0} onClick={() => setAdding((v) => !v)}>
              <Plus className="size-4" /> New session
            </Button>
          ) : undefined
        }
      />
      {adding && (
        <form
          className="bg-muted/40 mb-4 grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (program && name.trim()) create.mutate();
          }}
        >
          <select
            value={program}
            onChange={(e) => setProgram(e.target.value)}
            className="border-input bg-card h-9 rounded-md border px-2 text-sm"
          >
            {programs.map((p) => (
              <option key={p.publicId} value={p.publicId}>
                {p.name}
              </option>
            ))}
          </select>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Session name, e.g. CSE 2021"
            className="h-9"
          />
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="h-9 w-24"
          />
          <Button type="submit" size="sm" className="h-9" disabled={create.isPending}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />} Add
          </Button>
        </form>
      )}
      {batches.length === 0 ? (
        <Empty text="No sessions yet." />
      ) : (
        <ul className="divide-y">
          {batches.map((b) => (
            <BatchRow key={b.publicId} batch={b} canManage={canManage} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function BatchRow({ batch, canManage }: { batch: Batch; canManage: boolean }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(batch.name);
  const [editYear, setEditYear] = useState(String(batch.year));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const semestersQuery = useQuery({
    queryKey: ['org-semesters', batch.program.publicId],
    queryFn: () => fetchSemesters(batch.program.publicId),
    enabled: assigning,
  });
  const assign = useMutation({
    mutationFn: (semesterPublicId: string | null) =>
      assignBatchSemester(batch.publicId, semesterPublicId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-batches'] });
      toast.success('Semester updated');
      setAssigning(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update'),
  });

  const rename = useMutation({
    mutationFn: () =>
      updateBatch(batch.publicId, { name: editName.trim(), year: Number(editYear) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-batches'] });
      toast.success('Session updated');
      setEditing(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update session'),
  });

  const remove = useMutation({
    mutationFn: () => deleteBatch(batch.publicId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-batches'] });
      toast.success('Session deleted');
      setConfirmDelete(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete session'),
  });

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editing ? (
          <form
            className="flex flex-1 flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (editName.trim()) rename.mutate();
            }}
          >
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-8 max-w-[16rem]"
              placeholder="Session name"
              autoFocus
            />
            <Input
              type="number"
              value={editYear}
              onChange={(e) => setEditYear(e.target.value)}
              className="h-8 w-24"
              placeholder="Year"
            />
            <Button type="submit" size="sm" className="h-8" disabled={rename.isPending}>
              {rename.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}{' '}
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => {
                setEditing(false);
                setEditName(batch.name);
                setEditYear(String(batch.year));
              }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <>
            <div>
              <p className="font-medium">
                {batch.name}{' '}
                <span className="text-muted-foreground font-normal">· {batch.year}</span>
              </p>
              <p className="text-muted-foreground text-xs">
                {batch.program.name} · {batch._count.students} student
                {batch._count.students === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs">
                {batch.currentSemester ? (
                  <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
                    {batch.currentSemester.name ?? `Semester ${batch.currentSemester.number}`}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No semester</span>
                )}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setAssigning((v) => !v)}
              >
                {batch.currentSemester ? 'Change semester' : 'Set semester'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                Students
              </Button>
              {canManage && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setEditing(true)}
                    title="Edit session"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 size-8"
                    onClick={() => setConfirmDelete(true)}
                    title="Delete session"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete session “{batch.name}”?</DialogTitle>
            <DialogDescription>
              {batch._count.students > 0
                ? `This session has ${batch._count.students} student${batch._count.students === 1 ? '' : 's'}. Deleting it (soft delete) will detach them. This cannot be easily undone.`
                : 'This session will be removed (soft delete).'}
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
              {remove.isPending && <Loader2 className="size-4 animate-spin" />} Delete session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {assigning && (
        <select
          className="border-input bg-card mt-2 h-9 w-full max-w-xs rounded-md border px-2 text-sm"
          defaultValue={batch.currentSemester?.publicId ?? ''}
          disabled={assign.isPending}
          onChange={(e) => assign.mutate(e.target.value || null)}
        >
          <option value="">— No semester —</option>
          {(semestersQuery.data ?? []).map((s) => (
            <option key={s.publicId} value={s.publicId}>
              {s.name ?? `Semester ${s.number}`}
            </option>
          ))}
        </select>
      )}

      {expanded && (
        <BatchStudentsSection
          batchPublicId={batch.publicId}
          batchName={batch.name}
          canManage={canManage}
        />
      )}
    </li>
  );
}

// ── Inline student management per batch ──────────────────────────────────────

function BatchStudentsSection({
  batchPublicId,
  batchName,
  canManage,
}: {
  batchPublicId: string;
  batchName: string;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  // Add form fields
  const [newStudentId, setNewStudentId] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newReg, setNewReg] = useState('');
  const [newRoll, setNewRoll] = useState('');

  const studentsQuery = useQuery({
    queryKey: ['org-students', batchPublicId],
    queryFn: () => fetchStudents(batchPublicId),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createStudent({
        studentId: newStudentId.trim(),
        displayName: newName.trim(),
        email: newEmail.trim() || undefined,
        batchPublicId,
        registrationNumber: newReg.trim() || undefined,
        rollNumber: newRoll.trim() || undefined,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-students', batchPublicId] });
      await qc.invalidateQueries({ queryKey: ['org-batches'] });
      toast.success('Student added');
      setNewStudentId('');
      setNewName('');
      setNewEmail('');
      setNewReg('');
      setNewRoll('');
      setAdding(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not add student'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteStudent(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-students', batchPublicId] });
      await qc.invalidateQueries({ queryKey: ['org-batches'] });
      toast.success('Student removed');
      setConfirmDeleteId(null);
      setSelected(new Set());
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not remove student'),
  });

  const deleteBulkMut = useMutation({
    mutationFn: async () => {
      for (const id of selected) await deleteStudent(id);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-students', batchPublicId] });
      await qc.invalidateQueries({ queryKey: ['org-batches'] });
      toast.success(`${selected.size} student${selected.size === 1 ? '' : 's'} removed`);
      setSelected(new Set());
      setConfirmBulk(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not remove students'),
  });

  const students = studentsQuery.data ?? [];
  const allSelected = students.length > 0 && selected.size === students.length;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(students.map((s) => s.publicId)));
  };

  return (
    <div className="bg-muted/30 mt-3 rounded-lg border p-3">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">{batchName} — Students</p>
        <div className="flex gap-2">
          {canManage && selected.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs"
              onClick={() => setConfirmBulk(true)}
            >
              <Trash2 className="size-3" /> Delete {selected.size}
            </Button>
          )}
          {canManage && (
            <Button size="sm" className="h-7 text-xs" onClick={() => setAdding((v) => !v)}>
              <UserPlus className="size-3" /> Add
            </Button>
          )}
        </div>
      </div>

      {/* Confirm banners — rendered right below header so they're always visible */}
      {confirmDeleteId && (
        <div className="bg-destructive/10 border-destructive/30 mb-3 flex items-center justify-between gap-3 rounded-md border p-3">
          <p className="text-xs">Remove this student? This cannot be undone.</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setConfirmDeleteId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate(confirmDeleteId)}
            >
              {deleteMut.isPending && <Loader2 className="size-3 animate-spin" />} Remove
            </Button>
          </div>
        </div>
      )}
      {confirmBulk && (
        <div className="bg-destructive/10 border-destructive/30 mb-3 flex items-center justify-between gap-3 rounded-md border p-3">
          <p className="text-xs">
            Remove {selected.size} selected student{selected.size === 1 ? '' : 's'}?
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setConfirmBulk(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              disabled={deleteBulkMut.isPending}
              onClick={() => deleteBulkMut.mutate()}
            >
              {deleteBulkMut.isPending && <Loader2 className="size-3 animate-spin" />} Remove all
            </Button>
          </div>
        </div>
      )}

      {/* Add form */}
      {adding && canManage && (
        <form
          className="mb-3 grid gap-2 rounded-md border bg-white/5 p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            createMut.mutate();
          }}
        >
          <Input
            value={newStudentId}
            onChange={(e) => setNewStudentId(e.target.value)}
            placeholder="Student ID *"
            className="h-8 text-xs"
          />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Full name *"
            className="h-8 text-xs"
          />
          <Input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            type="email"
            placeholder="Email (optional)"
            className="h-8 text-xs"
          />
          <Input
            value={newReg}
            onChange={(e) => setNewReg(e.target.value)}
            placeholder="Reg. no. (optional)"
            className="h-8 text-xs"
          />
          <Input
            value={newRoll}
            onChange={(e) => setNewRoll(e.target.value)}
            placeholder="Roll (optional)"
            className="h-8 text-xs"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setAdding(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-8 text-xs"
              disabled={createMut.isPending || !newStudentId.trim() || !newName.trim()}
            >
              {createMut.isPending && <Loader2 className="size-3 animate-spin" />} Add student
            </Button>
          </div>
        </form>
      )}

      {/* Student table */}
      {studentsQuery.isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : students.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-xs">
          No students in this session.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                {canManage && (
                  <th className="w-8 pb-2 pr-2">
                    <button type="button" onClick={toggleAll} className="flex items-center">
                      <span
                        className={`flex size-4 items-center justify-center rounded border ${allSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}`}
                      >
                        {allSelected && <Check className="size-3" />}
                      </span>
                    </button>
                  </th>
                )}
                <th className="pb-2 pr-3 font-medium">Student ID</th>
                <th className="pb-2 pr-3 font-medium">Name</th>
                <th className="pb-2 pr-3 font-medium">Email</th>
                <th className="pb-2 pr-3 font-medium">Reg. no.</th>
                <th className="pb-2 pr-3 font-medium">Roll</th>
                {canManage && <th className="pb-2" />}
              </tr>
            </thead>
            <tbody>
              {students.map((s) =>
                editingId === s.publicId ? (
                  <StudentEditRow
                    key={s.publicId}
                    student={s}
                    batchPublicId={batchPublicId}
                    onDone={() => setEditingId(null)}
                    canManage={canManage}
                  />
                ) : (
                  <tr key={s.publicId} className="border-b last:border-0">
                    {canManage && (
                      <td className="py-1.5 pr-2">
                        <button
                          type="button"
                          onClick={() => toggleSelect(s.publicId)}
                          className="flex items-center"
                        >
                          <span
                            className={`flex size-4 items-center justify-center rounded border ${selected.has(s.publicId) ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}`}
                          >
                            {selected.has(s.publicId) && <Check className="size-3" />}
                          </span>
                        </button>
                      </td>
                    )}
                    <td className="py-1.5 pr-3 font-mono">{s.studentId}</td>
                    <td className="py-1.5 pr-3 font-medium">{s.user.displayName}</td>
                    <td className="text-muted-foreground py-1.5 pr-3">{s.user.email ?? '—'}</td>
                    <td className="text-muted-foreground py-1.5 pr-3">
                      {s.registrationNumber ?? '—'}
                    </td>
                    <td className="text-muted-foreground py-1.5 pr-3">{s.rollNumber ?? '—'}</td>
                    {canManage && (
                      <td className="py-1.5">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5"
                            onClick={() => setEditingId(s.publicId)}
                          >
                            <Pencil className="size-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 h-6 px-1.5"
                            onClick={() => setConfirmDeleteId(s.publicId)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StudentEditRow({
  student,
  batchPublicId,
  onDone,
  canManage,
}: {
  student: {
    publicId: string;
    studentId: string;
    user: { displayName: string; email: string | null };
    registrationNumber: string | null;
    rollNumber: string | null;
  };
  batchPublicId: string;
  onDone: () => void;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(student.user.displayName);
  const [email, setEmail] = useState(student.user.email ?? '');
  const [reg, setReg] = useState(student.registrationNumber ?? '');
  const [roll, setRoll] = useState(student.rollNumber ?? '');

  const save = useMutation({
    mutationFn: () =>
      updateStudent(student.publicId, {
        displayName: name.trim() || undefined,
        email: email.trim() || undefined,
        registrationNumber: reg.trim() || undefined,
        rollNumber: roll.trim() || undefined,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-students', batchPublicId] });
      toast.success('Student updated');
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update'),
  });

  return (
    <tr className="border-b last:border-0">
      {canManage && <td className="py-1.5 pr-2" />}
      <td className="py-1.5 pr-3 font-mono text-xs">{student.studentId}</td>
      <td className="py-1.5 pr-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-xs" />
      </td>
      <td className="py-1.5 pr-3">
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          className="h-7 text-xs"
        />
      </td>
      <td className="py-1.5 pr-3">
        <Input value={reg} onChange={(e) => setReg(e.target.value)} className="h-7 text-xs" />
      </td>
      <td className="py-1.5 pr-3">
        <Input value={roll} onChange={(e) => setRoll(e.target.value)} className="h-7 text-xs" />
      </td>
      <td className="py-1.5">
        <div className="flex gap-1">
          <Button
            size="sm"
            className="h-6 px-1.5"
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            {save.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Check className="size-3" />
            )}
          </Button>
          <Button variant="outline" size="sm" className="h-6 px-1.5" onClick={onDone}>
            ✕
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ─────────────────────────── Enrollments & Retakes ───────────────────────────
function EnrollmentsTab({ batches }: { batches: Batch[] }) {
  return (
    <Card className="p-6">
      <SectionHeading title="Enrollments & Retakes" />
      {batches.length === 0 ? (
        <Empty text="No batches to show enrollments for yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="py-2 font-medium">Batch</th>
                <th className="py-2 font-medium">Program</th>
                <th className="py-2 font-medium">Current session</th>
                <th className="py-2 text-right font-medium">Enrolled</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.publicId} className="border-b last:border-0">
                  <td className="py-2 font-medium">
                    {b.name} <span className="text-muted-foreground">· {b.year}</span>
                  </td>
                  <td className="text-muted-foreground py-2">{b.program.name}</td>
                  <td className="py-2">
                    {b.currentSemester
                      ? (b.currentSemester.name ?? `Semester ${b.currentSemester.number}`)
                      : '—'}
                  </td>
                  <td className="py-2 text-right tabular-nums">{b._count.students}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────── Students ───────────────────────────
function StudentsTab({ batches }: { batches: Batch[] }) {
  const qc = useQueryClient();
  const canManage = useCanManage();
  const [batch, setBatch] = useState(batches[0]?.publicId ?? '');
  const active = batches.find((b) => b.publicId === batch) ?? batches[0];
  const [adding, setAdding] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const [newStudentId, setNewStudentId] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newReg, setNewReg] = useState('');
  const [newRoll, setNewRoll] = useState('');

  const studentsQuery = useQuery({
    queryKey: ['org-students', active?.publicId],
    queryFn: () => fetchStudents(active!.publicId),
    enabled: Boolean(active),
  });

  const create = useMutation({
    mutationFn: () =>
      createStudent({
        studentId: newStudentId.trim(),
        displayName: newName.trim(),
        email: newEmail.trim() || undefined,
        batchPublicId: active!.publicId,
        registrationNumber: newReg.trim() || undefined,
        rollNumber: newRoll.trim() || undefined,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-students', active?.publicId] });
      await qc.invalidateQueries({ queryKey: ['org-batches'] });
      toast.success('Student added');
      setNewStudentId('');
      setNewName('');
      setNewEmail('');
      setNewReg('');
      setNewRoll('');
      setAdding(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not add student'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteStudent(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-students', active?.publicId] });
      await qc.invalidateQueries({ queryKey: ['org-batches'] });
      toast.success('Student removed');
      setConfirmDeleteId(null);
      setSelected(new Set());
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not remove student'),
  });

  const deleteBulkMut = useMutation({
    mutationFn: async () => {
      for (const id of selected) await deleteStudent(id);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-students', active?.publicId] });
      await qc.invalidateQueries({ queryKey: ['org-batches'] });
      toast.success(`${selected.size} student${selected.size === 1 ? '' : 's'} removed`);
      setSelected(new Set());
      setConfirmBulk(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not remove students'),
  });

  const handleExport = async () => {
    if (!active) return;
    setExporting(true);
    try {
      await downloadExport(
        `/org/students/export?batch=${active.publicId}`,
        `students-${active.name}.xlsx`,
      );
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (batches.length === 0) {
    return (
      <Card className="p-6">
        <Empty text="Create a session first, then its students appear here." />
      </Card>
    );
  }

  const students = studentsQuery.data ?? [];
  const allSelected = students.length > 0 && selected.size === students.length;
  const toggleSelect = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(students.map((s) => s.publicId)));

  return (
    <Card className="p-6">
      <SectionHeading
        title="Students"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={active?.publicId}
              onChange={(e) => {
                setBatch(e.target.value);
                setAdding(false);
                setSelected(new Set());
                setEditingId(null);
              }}
              className="border-input bg-card h-9 rounded-md border px-2 text-sm"
            >
              {batches.map((b) => (
                <option key={b.publicId} value={b.publicId}>
                  {b.name} · {b.year}
                </option>
              ))}
            </select>
            {canManage && selected.size > 0 && (
              <Button
                size="sm"
                variant="destructive"
                className="h-9"
                onClick={() => setConfirmBulk(true)}
              >
                <Trash2 className="size-4" /> Delete {selected.size}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={handleExport}
              disabled={exporting || !active}
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}{' '}
              Export
            </Button>
            {canManage && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => {
                    setImportOpen(true);
                    setAdding(false);
                  }}
                >
                  <Upload className="size-4" /> Bulk import
                </Button>
                <Button size="sm" className="h-9" onClick={() => setAdding((v) => !v)}>
                  <UserPlus className="size-4" /> Add student
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Confirm banners */}
      {confirmDeleteId && (
        <div className="bg-destructive/10 border-destructive/30 mb-4 flex items-center justify-between gap-3 rounded-md border p-3">
          <p className="text-sm">Remove this student?</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate(confirmDeleteId)}
            >
              {deleteMut.isPending && <Loader2 className="size-4 animate-spin" />} Remove
            </Button>
          </div>
        </div>
      )}
      {confirmBulk && (
        <div className="bg-destructive/10 border-destructive/30 mb-4 flex items-center justify-between gap-3 rounded-md border p-3">
          <p className="text-sm">
            Remove {selected.size} student{selected.size === 1 ? '' : 's'}?
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmBulk(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteBulkMut.isPending}
              onClick={() => deleteBulkMut.mutate()}
            >
              {deleteBulkMut.isPending && <Loader2 className="size-4 animate-spin" />} Remove all
            </Button>
          </div>
        </div>
      )}

      {adding && canManage && (
        <form
          className="bg-muted/40 mb-4 grid gap-2 rounded-md border p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Input
            value={newStudentId}
            onChange={(e) => setNewStudentId(e.target.value)}
            placeholder="Student ID *"
            className="h-9"
          />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Full name *"
            className="h-9"
          />
          <Input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email (optional)"
            type="email"
            className="h-9"
          />
          <Input
            value={newReg}
            onChange={(e) => setNewReg(e.target.value)}
            placeholder="Registration no. (optional)"
            className="h-9"
          />
          <Input
            value={newRoll}
            onChange={(e) => setNewRoll(e.target.value)}
            placeholder="Roll no. (optional)"
            className="h-9"
          />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={create.isPending || !newStudentId.trim() || !newName.trim()}
            >
              {create.isPending && <Loader2 className="size-4 animate-spin" />} Add
            </Button>
          </div>
        </form>
      )}

      {studentsQuery.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : students.length === 0 ? (
        <Empty text="No students in this session yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                {canManage && (
                  <th className="w-8 py-2 pr-3">
                    <button
                      type="button"
                      onClick={toggleAll}
                      className={`flex size-4 items-center justify-center rounded border ${allSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}`}
                    >
                      {allSelected && <Check className="size-3" />}
                    </button>
                  </th>
                )}
                <th className="py-2 pr-3 font-medium">Student ID</th>
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Reg. no.</th>
                <th className="py-2 pr-3 font-medium">Roll</th>
                {canManage && <th className="py-2" />}
              </tr>
            </thead>
            <tbody>
              {students.map((s) =>
                editingId === s.publicId ? (
                  <StudentEditRow
                    key={s.publicId}
                    student={s}
                    batchPublicId={active!.publicId}
                    onDone={() => setEditingId(null)}
                    canManage={canManage}
                  />
                ) : (
                  <tr key={s.publicId} className="border-b last:border-0">
                    {canManage && (
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          onClick={() => toggleSelect(s.publicId)}
                          className={`flex size-4 items-center justify-center rounded border ${selected.has(s.publicId) ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}`}
                        >
                          {selected.has(s.publicId) && <Check className="size-3" />}
                        </button>
                      </td>
                    )}
                    <td className="py-2 pr-3 font-medium tabular-nums">{s.studentId}</td>
                    <td className="py-2 pr-3">{s.user.displayName}</td>
                    <td className="text-muted-foreground py-2 pr-3">{s.user.email ?? '—'}</td>
                    <td className="text-muted-foreground py-2 pr-3">
                      {s.registrationNumber ?? '—'}
                    </td>
                    <td className="text-muted-foreground py-2 pr-3">{s.rollNumber ?? '—'}</td>
                    {canManage && (
                      <td className="py-2">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-1.5"
                            onClick={() => setEditingId(s.publicId)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 h-7 px-1.5"
                            onClick={() => setConfirmDeleteId(s.publicId)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {active && (
        <ImportModal
          entity="students"
          open={importOpen}
          onOpenChange={setImportOpen}
          batchPublicId={active.publicId}
          onImported={() => {
            void qc.invalidateQueries({ queryKey: ['org-students', active.publicId] });
          }}
        />
      )}
    </Card>
  );
}

// ─────────────────────────── Teachers & Faculty ───────────────────────────
function TeachersTab({ deptPublicId, deptName }: { deptPublicId: string; deptName: string }) {
  const qc = useQueryClient();
  const canManage = useCanManage();
  const [adding, setAdding] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDesig, setNewDesig] = useState('');

  const teachersQuery = useQuery({
    queryKey: ['org-teachers', deptPublicId],
    queryFn: () => fetchTeachersAdmin(deptPublicId),
  });

  const create = useMutation({
    mutationFn: () =>
      createTeacher({
        displayName: newName.trim(),
        email: newEmail.trim(),
        departmentPublicId: deptPublicId,
        designation: newDesig.trim() || undefined,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-teachers', deptPublicId] });
      toast.success('Teacher added');
      setNewName('');
      setNewEmail('');
      setNewDesig('');
      setAdding(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not add teacher'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteTeacher(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-teachers', deptPublicId] });
      toast.success('Teacher removed');
      setConfirmDeleteId(null);
      setSelected(new Set());
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not remove teacher'),
  });

  const deleteBulkMut = useMutation({
    mutationFn: async () => {
      for (const id of selected) await deleteTeacher(id);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-teachers', deptPublicId] });
      toast.success(`${selected.size} teacher${selected.size === 1 ? '' : 's'} removed`);
      setSelected(new Set());
      setConfirmBulk(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not remove teachers'),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadExport(
        `/org/teachers/export?department=${encodeURIComponent(deptPublicId)}`,
        `teachers-${deptName}.xlsx`,
      );
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const teachers = teachersQuery.data ?? [];
  const allSelected = teachers.length > 0 && selected.size === teachers.length;
  const toggleSelect = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(teachers.map((t) => t.publicId)));

  return (
    <Card className="p-6">
      <SectionHeading
        title="Teachers & Faculty"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canManage && selected.size > 0 && (
              <Button
                size="sm"
                variant="destructive"
                className="h-9"
                onClick={() => setConfirmBulk(true)}
              >
                <Trash2 className="size-4" /> Delete {selected.size}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}{' '}
              Export
            </Button>
            {canManage && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => {
                    setImportOpen(true);
                    setAdding(false);
                  }}
                >
                  <Upload className="size-4" /> Bulk import
                </Button>
                <Button size="sm" className="h-9" onClick={() => setAdding((v) => !v)}>
                  <UserPlus className="size-4" /> Add teacher
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Confirm banners */}
      {confirmDeleteId && (
        <div className="bg-destructive/10 border-destructive/30 mb-4 flex items-center justify-between gap-3 rounded-md border p-3">
          <p className="text-sm">Remove this teacher?</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate(confirmDeleteId)}
            >
              {deleteMut.isPending && <Loader2 className="size-4 animate-spin" />} Remove
            </Button>
          </div>
        </div>
      )}
      {confirmBulk && (
        <div className="bg-destructive/10 border-destructive/30 mb-4 flex items-center justify-between gap-3 rounded-md border p-3">
          <p className="text-sm">
            Remove {selected.size} teacher{selected.size === 1 ? '' : 's'}?
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmBulk(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteBulkMut.isPending}
              onClick={() => deleteBulkMut.mutate()}
            >
              {deleteBulkMut.isPending && <Loader2 className="size-4 animate-spin" />} Remove all
            </Button>
          </div>
        </div>
      )}

      {adding && canManage && (
        <form
          className="bg-muted/40 mb-4 grid gap-2 rounded-md border p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Full name *"
            className="h-9"
          />
          <Input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email *"
            type="email"
            className="h-9"
          />
          <Input
            value={newDesig}
            onChange={(e) => setNewDesig(e.target.value)}
            placeholder="Designation (optional)"
            className="h-9"
          />
          <div className="flex items-center justify-end gap-2 sm:col-span-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={create.isPending || !newName.trim() || !newEmail.trim()}
            >
              {create.isPending && <Loader2 className="size-4 animate-spin" />} Add
            </Button>
          </div>
        </form>
      )}

      {teachersQuery.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : teachers.length === 0 ? (
        <Empty text="No teachers in this department yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                {canManage && (
                  <th className="w-8 py-2 pr-3">
                    <button
                      type="button"
                      onClick={toggleAll}
                      className={`flex size-4 items-center justify-center rounded border ${allSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}`}
                    >
                      {allSelected && <Check className="size-3" />}
                    </button>
                  </th>
                )}
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Designation</th>
                {canManage && <th className="py-2" />}
              </tr>
            </thead>
            <tbody>
              {teachers.map((t) =>
                editingId === t.publicId ? (
                  <TeacherEditRow
                    key={t.publicId}
                    teacher={t}
                    deptPublicId={deptPublicId}
                    onDone={() => setEditingId(null)}
                  />
                ) : (
                  <Fragment key={t.publicId}>
                    <tr className="border-b last:border-0">
                      {canManage && (
                        <td className="py-2.5 pr-3">
                          <button
                            type="button"
                            onClick={() => toggleSelect(t.publicId)}
                            className={`flex size-4 items-center justify-center rounded border ${selected.has(t.publicId) ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}`}
                          >
                            {selected.has(t.publicId) && <Check className="size-3" />}
                          </button>
                        </td>
                      )}
                      <td className="py-2.5 pr-3 font-medium">
                        <button
                          type="button"
                          className="hover:text-primary inline-flex items-center gap-1.5 text-left"
                          onClick={() =>
                            setExpandedId((id) => (id === t.publicId ? null : t.publicId))
                          }
                          title="Show assigned courses"
                        >
                          {expandedId === t.publicId ? (
                            <ChevronUp className="text-muted-foreground size-3.5" />
                          ) : (
                            <ChevronDown className="text-muted-foreground size-3.5" />
                          )}
                          {t.user.displayName}
                        </button>
                      </td>
                      <td className="text-muted-foreground py-2.5 pr-3">{t.user.email ?? '—'}</td>
                      <td className="text-muted-foreground py-2.5 pr-3">{t.designation ?? '—'}</td>
                      {canManage && (
                        <td className="py-2.5">
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-1.5"
                              onClick={() => setEditingId(t.publicId)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10 h-7 px-1.5"
                              onClick={() => setConfirmDeleteId(t.publicId)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {expandedId === t.publicId && (
                      <tr>
                        <td colSpan={canManage ? 5 : 3} className="pb-3">
                          <TeacherAssignmentsView teacherPublicId={t.publicId} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      <ImportModal
        entity="teachers"
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => {
          void qc.invalidateQueries({ queryKey: ['org-teachers', deptPublicId] });
        }}
      />
    </Card>
  );
}

// The course parts a teacher is assigned to — shown when a teacher row is expanded.
function TeacherAssignmentsView({ teacherPublicId }: { teacherPublicId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['org-teacher-assignments', teacherPublicId],
    queryFn: () => fetchTeacherAssignments(teacherPublicId),
  });
  const assignments: TeacherAssignment[] = data ?? [];

  return (
    <div className="bg-muted/40 rounded-md border p-3">
      <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
        Assigned courses
      </p>
      {isLoading ? (
        <Skeleton className="h-8 w-full" />
      ) : assignments.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Not assigned to any course parts yet. Assign from Courses.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {assignments.map((a) => (
            <li
              key={a.publicId}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span>
                <span className="font-mono text-xs">{a.courseCode}</span> — {a.courseName}
                <span className="text-muted-foreground"> · {a.name}</span>
              </span>
              <span className="text-muted-foreground text-xs">
                {a.semesterLabel} · {a.examCount} exam{a.examCount === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TeacherEditRow({
  teacher,
  deptPublicId,
  onDone,
}: {
  teacher: import('@exam/types').TeacherRow;
  deptPublicId: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(teacher.user.displayName);
  const [desig, setDesig] = useState(teacher.designation ?? '');

  const save = useMutation({
    mutationFn: () =>
      updateTeacher(teacher.publicId, {
        displayName: name.trim() || undefined,
        designation: desig.trim() || undefined,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['org-teachers', deptPublicId] });
      toast.success('Teacher updated');
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update'),
  });

  return (
    <tr className="border-b last:border-0">
      <td className="py-1.5 pr-3" />
      <td className="py-1.5 pr-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
      </td>
      <td className="text-muted-foreground py-1.5 pr-3 text-sm">{teacher.user.email ?? '—'}</td>
      <td className="py-1.5 pr-3">
        <Input
          value={desig}
          onChange={(e) => setDesig(e.target.value)}
          placeholder="Designation"
          className="h-8 text-sm"
        />
      </td>
      <td className="py-1.5">
        <div className="flex gap-1">
          <Button
            size="sm"
            className="h-7 px-1.5"
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            {save.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-1.5" onClick={onDone}>
            ✕
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ─────────────────────────── Exams & Question Bank ───────────────────────────
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  in_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  published: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  live: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  ended: 'bg-muted text-muted-foreground',
  grading: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  results_published: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
};

function ExamsTab({ deptPublicId }: { deptPublicId: string }) {
  const navigate = useNavigate();
  const [section, setSection] = useState<'exams' | 'banks'>('exams');

  const examsQuery = useQuery({
    queryKey: ['dept-exams', deptPublicId],
    queryFn: () => fetchDeptExams(deptPublicId),
    enabled: section === 'exams',
  });

  const banksQuery = useQuery({
    queryKey: ['dept-banks', deptPublicId],
    queryFn: () => fetchDeptBankSummary(deptPublicId),
    enabled: section === 'banks',
  });

  return (
    <Card className="p-6">
      {/* Sub-tabs */}
      <div className="mb-5 flex gap-1 border-b">
        {(['exams', 'banks'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize transition-colors',
              section === s
                ? 'border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {s === 'exams' ? 'Exams' : 'Question Banks'}
          </button>
        ))}
      </div>

      {section === 'exams' && (
        <>
          {examsQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !examsQuery.data?.length ? (
            <Empty text="No exams found for this department." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="py-2 pr-4 font-medium">Course / Part</th>
                    <th className="py-2 pr-4 font-medium">Title</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Marks</th>
                    <th className="py-2 font-medium">Teacher</th>
                  </tr>
                </thead>
                <tbody>
                  {examsQuery.data.map((exam) => (
                    <tr
                      key={exam.publicId}
                      className="hover:bg-muted/40 cursor-pointer border-b transition-colors last:border-0"
                      onClick={() => navigate(`/exams/${exam.publicId}/review`)}
                    >
                      <td className="py-2 pr-4">
                        <span className="font-mono text-xs">{exam.courseCode}</span>
                        <span className="text-muted-foreground ml-1 text-xs">· {exam.part}</span>
                      </td>
                      <td className="max-w-[200px] truncate py-2 pr-4 font-medium">{exam.title}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                            STATUS_COLORS[exam.status] ?? 'bg-muted text-muted-foreground',
                          )}
                        >
                          {exam.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="text-muted-foreground py-2 pr-4 text-xs">
                        {new Date(exam.startAt).toLocaleDateString()}
                      </td>
                      <td className="text-muted-foreground py-2 pr-4 text-xs tabular-nums">
                        {exam.totalMarks}
                      </td>
                      <td className="text-muted-foreground py-2 text-xs">{exam.createdByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {section === 'banks' && (
        <>
          {banksQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !banksQuery.data?.length ? (
            <Empty text="No question banks found for this department's courses." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="py-2 pr-4 font-medium">Semester</th>
                    <th className="py-2 pr-4 font-medium">Course</th>
                    <th className="py-2 pr-4 font-medium">Part</th>
                    <th className="py-2 pr-4 text-right font-medium">Banks</th>
                    <th className="py-2 text-right font-medium">Questions</th>
                  </tr>
                </thead>
                <tbody>
                  {banksQuery.data.map((row) => (
                    <tr key={row.partPublicId} className="border-b last:border-0">
                      <td className="text-muted-foreground py-2 pr-4 text-xs">
                        {row.semesterLabel}
                      </td>
                      <td className="py-2 pr-4">
                        <span className="font-mono text-xs">{row.courseCode}</span>
                        <span className="text-muted-foreground ml-1 text-xs">
                          — {row.courseName}
                        </span>
                      </td>
                      <td className="text-muted-foreground py-2 pr-4 text-xs">{row.partName}</td>
                      <td className="py-2 pr-4 text-right text-xs tabular-nums">
                        {row.bankCount > 0 ? (
                          <span className="font-medium">{row.bankCount}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 text-right text-xs tabular-nums">
                        {row.questionCount > 0 ? (
                          <span className="font-medium">{row.questionCount}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
