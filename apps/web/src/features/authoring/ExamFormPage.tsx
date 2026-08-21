import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExamSettings } from '@exam/types';
import { ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import {
  fetchCourseParts,
  fetchCourses,
  fetchDepartments,
  fetchFaculties,
  fetchPrograms,
  fetchSemesters,
} from '../org/orgApi';
import {
  createExam,
  fetchExam,
  fetchMyParts,
  updateExam,
  type ExamMetadataInput,
} from './authoringApi';
import { SettingToggle } from './SettingToggle';

const schema = z.object({
  coursePartPublicId: z.string().min(1, 'Choose a course part'),
  title: z.string().trim().min(2, 'Title is required').max(200, 'Title is too long'),
  instructions: z.string().max(5000).optional(),
  examDate: z.string().min(1, 'Exam date is required'),
  startTime: z.string().min(1, 'Start time is required'),
  durationMinutes: z.coerce.number().int().positive('Duration must be at least 1 minute'),
  showMarksAfterSubmit: z.boolean(),
  showExplanation: z.boolean(),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  negativeMarking: z.boolean(),
  negativeMarkValue: z.coerce.number().min(0),
});

type FormValues = z.input<typeof schema>;

export function ExamFormPage() {
  const { examPublicId } = useParams<{ examPublicId: string }>();
  const isEdit = Boolean(examPublicId);
  const { data: user } = useSession();

  const isAdminLike = (user?.roles ?? []).some((r) =>
    ['admin', 'super_admin', 'department_head'].includes(r.role),
  );

  const partsQuery = useQuery({
    queryKey: ['my-offering-parts'],
    queryFn: fetchMyParts,
    enabled: !isEdit && !isAdminLike,
  });
  const examQuery = useQuery({
    queryKey: ['authoring-exam', examPublicId],
    queryFn: () => fetchExam(examPublicId!),
    enabled: isEdit,
  });

  if (isEdit && examQuery.isLoading) return <FormSkeleton />;
  if (!isEdit && !isAdminLike && partsQuery.isLoading) return <FormSkeleton />;

  const exam = examQuery.data;
  if (isEdit && exam && exam.status !== 'draft') {
    return <ReadOnlyNotice status={exam.status} examPublicId={exam.publicId} />;
  }

  return (
    <ExamForm
      isEdit={isEdit}
      isAdminLike={isAdminLike}
      examPublicId={examPublicId}
      parts={partsQuery.data ?? []}
      defaults={exam}
    />
  );
}

function ExamForm({
  isEdit,
  isAdminLike,
  examPublicId,
  parts,
  defaults,
}: {
  isEdit: boolean;
  isAdminLike: boolean;
  examPublicId?: string;
  parts: { publicId: string; label: string }[];
  defaults?: import('@exam/types').ExamDetail;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults
      ? {
          coursePartPublicId: defaults.coursePart.publicId,
          title: defaults.title,
          instructions: defaults.instructions ?? '',
          examDate: isoToDate(defaults.startAt),
          startTime: isoToTime(defaults.startAt),
          durationMinutes: defaults.durationMinutes,
          ...defaults.settings,
        }
      : {
          coursePartPublicId: '',
          title: '',
          instructions: '',
          examDate: '',
          startTime: '',
          durationMinutes: 60,
          showMarksAfterSubmit: true,
          showExplanation: true,
          shuffleQuestions: false,
          shuffleOptions: false,
          negativeMarking: false,
          negativeMarkValue: 0,
        },
  });

  const negativeMarking = watch('negativeMarking');

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const settings: ExamSettings = {
        showMarksAfterSubmit: values.showMarksAfterSubmit,
        showExplanation: values.showExplanation,
        shuffleQuestions: values.shuffleQuestions,
        shuffleOptions: values.shuffleOptions,
        negativeMarking: values.negativeMarking,
        negativeMarkValue: Number(values.negativeMarkValue),
      };
      // End time is derived: start + duration. Students never see a separate end field.
      const startAt = new Date(`${values.examDate}T${values.startTime}`);
      const endAt = new Date(startAt.getTime() + Number(values.durationMinutes) * 60_000);
      const body: ExamMetadataInput = {
        title: values.title.trim(),
        instructions: values.instructions?.trim() || undefined,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        durationMinutes: Number(values.durationMinutes),
        settings,
      };
      if (isEdit && examPublicId) {
        return updateExam(examPublicId, body);
      }
      return createExam({ ...body, coursePartPublicId: values.coursePartPublicId });
    },
    onSuccess: async (exam) => {
      toast.success(isEdit ? 'Exam updated' : 'Draft created');
      await qc.invalidateQueries({ queryKey: ['authoring-exams'] });
      navigate(`/exams/${exam.publicId}/build`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save the exam'),
  });

  return (
    <div className="mx-auto w-full max-w-2xl">
      <button
        onClick={() => navigate('/exams')}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Back to exams
      </button>

      <h1 className="text-2xl font-semibold tracking-tight">
        {isEdit ? 'Edit exam details' : 'New exam'}
      </h1>
      <p className="text-muted-foreground mb-6 mt-1 text-sm">
        {isEdit
          ? 'Update the exam metadata. Questions are managed in the builder.'
          : 'Set up the exam. You will add questions next.'}
      </p>

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-6">
        <Card className="space-y-5 p-6">
          {!isEdit && (
            <Controller
              control={control}
              name="coursePartPublicId"
              render={({ field }) =>
                isAdminLike ? (
                  <div>
                    <Label className={cn(errors.coursePartPublicId && 'text-destructive')}>
                      Course part
                    </Label>
                    <div className="mt-1.5">
                      <CascadingPartPicker value={field.value} onChange={field.onChange} />
                    </div>
                    {errors.coursePartPublicId && (
                      <p className="text-destructive mt-1 text-xs">
                        {errors.coursePartPublicId.message}
                      </p>
                    )}
                  </div>
                ) : (
                  <Field
                    label="Course part"
                    error={errors.coursePartPublicId?.message}
                    htmlFor="part"
                  >
                    <select
                      id="part"
                      value={field.value}
                      onChange={field.onChange}
                      className="border-input bg-card focus-visible:ring-ring aria-[invalid=true]:border-destructive flex h-10 w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2"
                      aria-invalid={errors.coursePartPublicId ? 'true' : 'false'}
                    >
                      <option value="">Select a course part…</option>
                      {parts.map((p) => (
                        <option key={p.publicId} value={p.publicId}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    {parts.length === 0 && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        You are not assigned to any course part yet. Ask an admin to assign you.
                      </p>
                    )}
                  </Field>
                )
              }
            />
          )}

          <Field label="Title" error={errors.title?.message} htmlFor="title">
            <Input
              id="title"
              {...register('title')}
              aria-invalid={errors.title ? 'true' : 'false'}
            />
          </Field>

          <Field
            label="Instructions (optional)"
            error={errors.instructions?.message}
            htmlFor="instructions"
          >
            <Textarea
              id="instructions"
              rows={4}
              placeholder="Shown to students before they begin."
              {...register('instructions')}
            />
          </Field>

          <Field label="Exam date" error={errors.examDate?.message} htmlFor="examDate">
            <Input
              id="examDate"
              type="date"
              {...register('examDate')}
              aria-invalid={errors.examDate ? 'true' : 'false'}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Start time" error={errors.startTime?.message} htmlFor="startTime">
              <Input
                id="startTime"
                type="time"
                {...register('startTime')}
                aria-invalid={errors.startTime ? 'true' : 'false'}
              />
            </Field>
            <Field
              label="Duration (minutes)"
              error={errors.durationMinutes?.message}
              htmlFor="duration"
            >
              <Input
                id="duration"
                type="number"
                min={1}
                {...register('durationMinutes')}
                aria-invalid={errors.durationMinutes ? 'true' : 'false'}
              />
            </Field>
          </div>
          <p className="text-muted-foreground -mt-2 text-xs">
            The exam ends automatically {watch('durationMinutes') || 0} minutes after it starts.
          </p>
        </Card>

        <Card className="space-y-1 p-6">
          <h2 className="mb-3 text-sm font-semibold">Settings</h2>
          <Controller
            control={control}
            name="shuffleQuestions"
            render={({ field }) => (
              <SettingToggle
                label="Shuffle questions"
                description="Each student sees questions in a random order."
                checked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="shuffleOptions"
            render={({ field }) => (
              <SettingToggle
                label="Shuffle options"
                description="Randomize the order of MCQ options."
                checked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="showMarksAfterSubmit"
            render={({ field }) => (
              <SettingToggle
                label="Show marks after submit"
                description="Students see their score as soon as they submit."
                checked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="showExplanation"
            render={({ field }) => (
              <SettingToggle
                label="Show explanations after submit"
                description="Reveal per-question explanations in the result view."
                checked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="negativeMarking"
            render={({ field }) => (
              <SettingToggle
                label="Negative marking"
                description="Deduct marks for wrong MCQ answers."
                checked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          {negativeMarking && (
            <div className="pl-1 pt-2">
              <Label htmlFor="negValue" className="text-xs">
                Marks deducted per wrong answer
              </Label>
              <Input
                id="negValue"
                type="number"
                min={0}
                step="0.25"
                className="mt-1 max-w-[140px]"
                {...register('negativeMarkValue')}
              />
            </div>
          )}
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/exams')}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Save & add questions'}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Cascading picker for admin/dept_head exam creation ──────────────────────

const selectCls =
  'border-input bg-card focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50';

function CascadingPartPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [facultyId, setFacultyId] = useState('');
  const [deptId, setDeptId] = useState('');
  const [programId, setProgramId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [courseId, setCourseId] = useState('');

  const facultiesQ = useQuery({ queryKey: ['org-faculties'], queryFn: fetchFaculties });
  const deptsQ = useQuery({
    queryKey: ['org-departments', facultyId],
    queryFn: () => fetchDepartments(facultyId),
    enabled: !!facultyId,
  });
  const programsQ = useQuery({
    queryKey: ['org-programs', deptId],
    queryFn: () => fetchPrograms(deptId),
    enabled: !!deptId,
  });
  const semestersQ = useQuery({
    queryKey: ['org-semesters', programId],
    queryFn: () => fetchSemesters(programId),
    enabled: !!programId,
  });
  const coursesQ = useQuery({
    queryKey: ['org-courses', semesterId],
    queryFn: () => fetchCourses(semesterId),
    enabled: !!semesterId,
  });
  const partsQ = useQuery({
    queryKey: ['org-course-parts', courseId],
    queryFn: () => fetchCourseParts(courseId),
    enabled: !!courseId,
  });

  const selectedPart = partsQ.data?.find((p) => p.publicId === value);

  const reset = (level: 'faculty' | 'dept' | 'program' | 'semester' | 'course') => {
    if (level === 'faculty') {
      setDeptId('');
      setProgramId('');
      setSemesterId('');
      setCourseId('');
    }
    if (level === 'dept') {
      setProgramId('');
      setSemesterId('');
      setCourseId('');
    }
    if (level === 'program') {
      setSemesterId('');
      setCourseId('');
    }
    if (level === 'semester') {
      setCourseId('');
    }
    onChange('');
  };

  return (
    <div className="space-y-2">
      {/* Faculty */}
      <select
        className={selectCls}
        value={facultyId}
        onChange={(e) => {
          setFacultyId(e.target.value);
          reset('faculty');
        }}
      >
        <option value="">Faculty…</option>
        {(facultiesQ.data ?? []).map((f) => (
          <option key={f.publicId} value={f.publicId}>
            {f.name}
          </option>
        ))}
      </select>

      {/* Department */}
      {facultyId && (
        <select
          className={selectCls}
          value={deptId}
          disabled={deptsQ.isLoading}
          onChange={(e) => {
            setDeptId(e.target.value);
            reset('dept');
          }}
        >
          <option value="">Department…</option>
          {(deptsQ.data ?? []).map((d) => (
            <option key={d.publicId} value={d.publicId}>
              {d.name}
            </option>
          ))}
        </select>
      )}

      {/* Program */}
      {deptId && (
        <select
          className={selectCls}
          value={programId}
          disabled={programsQ.isLoading}
          onChange={(e) => {
            setProgramId(e.target.value);
            reset('program');
          }}
        >
          <option value="">Degree / program…</option>
          {(programsQ.data ?? []).map((p) => (
            <option key={p.publicId} value={p.publicId}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      {/* Semester */}
      {programId && (
        <select
          className={selectCls}
          value={semesterId}
          disabled={semestersQ.isLoading}
          onChange={(e) => {
            setSemesterId(e.target.value);
            reset('semester');
          }}
        >
          <option value="">Semester…</option>
          {(semestersQ.data ?? []).map((s) => (
            <option key={s.publicId} value={s.publicId}>
              {s.name ?? `Semester ${s.number}`}
            </option>
          ))}
        </select>
      )}

      {/* Course */}
      {semesterId && (
        <select
          className={selectCls}
          value={courseId}
          disabled={coursesQ.isLoading}
          onChange={(e) => {
            setCourseId(e.target.value);
            onChange('');
          }}
        >
          <option value="">Course…</option>
          {(coursesQ.data ?? []).map((c) => (
            <option key={c.publicId} value={c.publicId}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      )}

      {/* Course part */}
      {courseId && (
        <select
          className={selectCls}
          value={value}
          disabled={partsQ.isLoading}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Course part…</option>
          {(partsQ.data ?? []).map((p) => (
            <option key={p.publicId} value={p.publicId}>
              {p.name}
              {p.assignedTeacher
                ? ` — ${p.assignedTeacher.user.displayName}`
                : ' (no teacher assigned)'}
            </option>
          ))}
        </select>
      )}

      {/* Summary chip */}
      {selectedPart && (
        <div className="bg-primary/10 text-primary flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium">
          <ChevronRight className="size-3 shrink-0" />
          {selectedPart.course.code} → {selectedPart.name}
          {selectedPart.assignedTeacher && (
            <span className="text-primary/70 ml-1">
              · {selectedPart.assignedTeacher.user.displayName}
            </span>
          )}
        </div>
      )}

      {courseId && partsQ.data?.length === 0 && (
        <p className="text-muted-foreground text-xs">
          No course parts defined for this course yet.
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  error,
  htmlFor,
  children,
}: {
  label: string;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} className={cn(error && 'text-destructive')}>
        {label}
      </Label>
      <div className="mt-1.5">{children}</div>
      {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
    </div>
  );
}

function ReadOnlyNotice({ status, examPublicId }: { status: string; examPublicId: string }) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="font-medium">This exam can no longer be edited</p>
        <p className="text-muted-foreground max-w-sm text-sm">
          An exam in “{status.replace(/_/g, ' ')}” is locked. Open the builder to view it.
        </p>
        <Button variant="outline" onClick={() => navigate(`/exams/${examPublicId}/build`)}>
          Open builder
        </Button>
      </Card>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-72 w-full rounded-xl" />
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
function isoToDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isoToTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
