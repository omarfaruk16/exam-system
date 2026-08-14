import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExamSettings } from '@exam/types';
import { ArrowLeft, Loader2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import {
  createExam,
  fetchExam,
  fetchMyOfferingParts,
  updateExam,
  type ExamMetadataInput,
} from './authoringApi';
import { SettingToggle } from './SettingToggle';

const schema = z
  .object({
    offeringPartPublicId: z.string().min(1, 'Choose a course part'),
    title: z.string().trim().min(2, 'Title is required').max(200, 'Title is too long'),
    instructions: z.string().max(5000).optional(),
    startAt: z.string().min(1, 'Start time is required'),
    endAt: z.string().min(1, 'End time is required'),
    durationMinutes: z.coerce.number().int().positive('Duration must be at least 1 minute'),
    showMarksAfterSubmit: z.boolean(),
    showExplanation: z.boolean(),
    shuffleQuestions: z.boolean(),
    shuffleOptions: z.boolean(),
    negativeMarking: z.boolean(),
    negativeMarkValue: z.coerce.number().min(0),
  })
  .refine((v) => new Date(v.endAt) > new Date(v.startAt), {
    message: 'End time must be after the start time',
    path: ['endAt'],
  });

type FormValues = z.input<typeof schema>;

export function ExamFormPage() {
  const { examPublicId } = useParams<{ examPublicId: string }>();
  const isEdit = Boolean(examPublicId);

  const partsQuery = useQuery({
    queryKey: ['my-offering-parts'],
    queryFn: fetchMyOfferingParts,
    enabled: !isEdit,
  });
  const examQuery = useQuery({
    queryKey: ['authoring-exam', examPublicId],
    queryFn: () => fetchExam(examPublicId!),
    enabled: isEdit,
  });

  if (isEdit && examQuery.isLoading) return <FormSkeleton />;
  if (!isEdit && partsQuery.isLoading) return <FormSkeleton />;

  const exam = examQuery.data;
  // A teacher can only edit metadata while the exam is a draft.
  if (isEdit && exam && exam.status !== 'draft') {
    return <ReadOnlyNotice status={exam.status} examPublicId={exam.publicId} />;
  }

  return (
    <ExamForm
      isEdit={isEdit}
      examPublicId={examPublicId}
      parts={partsQuery.data ?? []}
      defaults={exam}
    />
  );
}

function ExamForm({
  isEdit,
  examPublicId,
  parts,
  defaults,
}: {
  isEdit: boolean;
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
          offeringPartPublicId: defaults.offeringPart.publicId,
          title: defaults.title,
          instructions: defaults.instructions ?? '',
          startAt: isoToLocalInput(defaults.startAt),
          endAt: isoToLocalInput(defaults.endAt),
          durationMinutes: defaults.durationMinutes,
          ...defaults.settings,
        }
      : {
          offeringPartPublicId: '',
          title: '',
          instructions: '',
          startAt: '',
          endAt: '',
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
      const body: ExamMetadataInput = {
        title: values.title.trim(),
        instructions: values.instructions?.trim() || undefined,
        startAt: new Date(values.startAt).toISOString(),
        endAt: new Date(values.endAt).toISOString(),
        durationMinutes: Number(values.durationMinutes),
        settings,
      };
      if (isEdit && examPublicId) {
        return updateExam(examPublicId, body);
      }
      return createExam({ ...body, offeringPartPublicId: values.offeringPartPublicId });
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
            <Field label="Course part" error={errors.offeringPartPublicId?.message} htmlFor="part">
              <select
                id="part"
                {...register('offeringPartPublicId')}
                className="border-input bg-card focus-visible:ring-ring aria-[invalid=true]:border-destructive flex h-10 w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2"
                aria-invalid={errors.offeringPartPublicId ? 'true' : 'false'}
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

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Starts at" error={errors.startAt?.message} htmlFor="startAt">
              <Input
                id="startAt"
                type="datetime-local"
                {...register('startAt')}
                aria-invalid={errors.startAt ? 'true' : 'false'}
              />
            </Field>
            <Field label="Ends at" error={errors.endAt?.message} htmlFor="endAt">
              <Input
                id="endAt"
                type="datetime-local"
                {...register('endAt')}
                aria-invalid={errors.endAt ? 'true' : 'false'}
              />
            </Field>
          </div>

          <Field
            label="Duration (minutes)"
            error={errors.durationMinutes?.message}
            htmlFor="duration"
          >
            <Input
              id="duration"
              type="number"
              min={1}
              className="max-w-[140px]"
              {...register('durationMinutes')}
              aria-invalid={errors.durationMinutes ? 'true' : 'false'}
            />
          </Field>
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

// datetime-local <-> ISO helpers. datetime-local carries no timezone; treat it as local time.
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
