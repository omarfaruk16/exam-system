import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BankQuestion, ImportJobState, PartOption, QuestionBankSummary } from '@exam/types';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Download,
  FileDown,
  Loader2,
  Pencil,
  Plus,
  Upload,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MathText } from '@/components/ui/math-text';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  createBank,
  createQuestion,
  downloadExport,
  downloadTemplate,
  fetchAuthorableParts,
  fetchBankQuestions,
  fetchBanks,
  fetchImportStatus,
  importQuestions,
  updateQuestion,
} from '@/features/authoring/authoringApi';

export function QuestionBankPage() {
  const { data: parts, isLoading } = useQuery({
    queryKey: ['authorable-parts'],
    queryFn: fetchAuthorableParts,
  });
  const [selectedPartId, setSelectedPartId] = useState<string>('');

  useEffect(() => {
    if (!selectedPartId && parts && parts.length > 0) setSelectedPartId(parts[0]!.publicId);
  }, [parts, selectedPartId]);

  const selectedPart = parts?.find((p) => p.publicId === selectedPartId);

  return (
    <div className="w-full">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Question Bank</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage chapters and questions for your course parts. Each chapter groups related
          questions. Use $…$ for inline math and $$…$$ for display math.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : !parts || parts.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <BookOpen className="text-muted-foreground size-7" />
          <p className="font-medium">No course parts assigned</p>
          <p className="text-muted-foreground text-sm">
            Ask an admin to assign you to a course part.
          </p>
        </Card>
      ) : (
        <div className="flex gap-5 lg:items-start">
          {/* Part selector */}
          <aside className="w-52 shrink-0">
            <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
              Course parts
            </p>
            <ul className="space-y-1">
              {parts.map((part) => (
                <li key={part.publicId}>
                  <button
                    type="button"
                    onClick={() => setSelectedPartId(part.publicId)}
                    className={cn(
                      'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                      selectedPartId === part.publicId
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <span className="block font-mono text-[10px] uppercase">
                      {part.courseCode} · {part.courseTitle}
                    </span>
                    <span className="block truncate">{part.partName}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Bank + questions */}
          {selectedPart && (
            <div className="min-w-0 flex-1">
              <BankView part={selectedPart} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BankView({ part }: { part: PartOption }) {
  const qc = useQueryClient();
  const [newBankName, setNewBankName] = useState('Chapter 1');
  const [creatingBank, setCreatingBank] = useState(false);
  const [activeBankId, setActiveBankId] = useState<string>('');

  const banksQuery = useQuery({
    queryKey: ['banks', part.publicId],
    queryFn: () => fetchBanks(part.publicId),
  });
  const banks = banksQuery.data ?? [];

  useEffect(() => {
    if (!activeBankId && banks.length > 0) setActiveBankId(banks[0]!.publicId);
  }, [activeBankId, banks]);

  const createBankMut = useMutation({
    mutationFn: () => createBank(part.publicId, newBankName.trim() || 'Chapter 1'),
    onSuccess: async (bank) => {
      await qc.invalidateQueries({ queryKey: ['banks', part.publicId] });
      setActiveBankId(bank.publicId);
      setCreatingBank(false);
      setNewBankName('Chapter 1');
      toast.success('Chapter created');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not create chapter'),
  });

  return (
    <div className="space-y-4">
      {/* Bank tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {banks.map((b) => (
          <button
            key={b.publicId}
            type="button"
            onClick={() => setActiveBankId(b.publicId)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              activeBankId === b.publicId
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input text-muted-foreground hover:text-foreground',
            )}
          >
            {b.name}
          </button>
        ))}
        {creatingBank ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              createBankMut.mutate();
            }}
          >
            <Input
              value={newBankName}
              onChange={(e) => setNewBankName(e.target.value)}
              className="h-8 w-40 text-sm"
              autoFocus
            />
            <Button type="submit" size="sm" className="h-8" disabled={createBankMut.isPending}>
              {createBankMut.isPending && <Loader2 className="size-3.5 animate-spin" />} Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => setCreatingBank(false)}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full"
            onClick={() => setCreatingBank(true)}
          >
            <Plus className="size-3.5" /> New chapter
          </Button>
        )}
      </div>

      {banksQuery.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : banks.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-sm font-medium">No chapters yet</p>
          <p className="text-muted-foreground text-xs">
            Create a chapter above to start adding questions.
          </p>
        </Card>
      ) : activeBankId ? (
        <BankQuestions
          bankId={activeBankId}
          bank={banks.find((b) => b.publicId === activeBankId)!}
        />
      ) : null}
    </div>
  );
}

function BankQuestions({ bankId, bank }: { bankId: string; bank: QuestionBankSummary }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [templateDl, setTemplateDl] = useState(false);

  const questionsQuery = useQuery({
    queryKey: ['bank-questions', bankId],
    queryFn: () => fetchBankQuestions(bankId),
  });
  const questions = questionsQuery.data ?? [];

  // Poll import job until done
  const jobQuery = useQuery({
    queryKey: ['import-job', importJobId],
    queryFn: () => fetchImportStatus(importJobId!),
    enabled: Boolean(importJobId),
    refetchInterval: (q) => {
      const s = q.state.data as ImportJobState | undefined;
      if (!s) return 1500;
      return s.status === 'completed' || s.status === 'failed' ? false : 1500;
    },
  });
  const jobState = jobQuery.data as ImportJobState | undefined;

  // When job completes, refresh questions
  const prevStatus = useState<string | null>(null);
  if (jobState?.status === 'completed' && prevStatus[0] !== 'completed') {
    prevStatus[1]('completed');
    void qc.invalidateQueries({ queryKey: ['bank-questions', bankId] });
  }
  if (jobState?.status === 'failed' && prevStatus[0] !== 'failed') {
    prevStatus[1]('failed');
  }

  async function handleExport() {
    setExporting(true);
    try {
      await downloadExport(bankId, bank.name);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function handleTemplate() {
    setTemplateDl(true);
    try {
      await downloadTemplate();
    } catch {
      toast.error('Could not download template');
    } finally {
      setTemplateDl(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.endsWith('.xlsx')) {
      toast.error('Only .xlsx files are supported');
      return;
    }
    try {
      const { jobId } = await importQuestions(bankId, file);
      setImportJobId(jobId);
      prevStatus[1](null);
      toast.info('Importing questions…');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    }
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {questions.length} question{questions.length !== 1 ? 's' : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {/* Template download */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={handleTemplate}
            disabled={templateDl}
            title="Download blank xlsx template"
          >
            {templateDl ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileDown className="size-3.5" />
            )}
            Template
          </Button>

          {/* Export */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={handleExport}
            disabled={exporting || questions.length === 0}
            title="Export questions to xlsx"
          >
            {exporting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            Export
          </Button>

          {/* Import */}
          <label className="cursor-pointer">
            <Button variant="outline" size="sm" className="pointer-events-none h-8 text-xs" asChild>
              <span>
                <Upload className="size-3.5" /> Import xlsx
              </span>
            </Button>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={handleImport}
            />
          </label>

          {/* New question */}
          <Button size="sm" className="h-8" onClick={() => setShowCreate((v) => !v)}>
            <Plus className="size-4" /> New question
          </Button>
        </div>
      </div>

      {/* Import status banner */}
      {importJobId && jobState && (
        <ImportStatusBanner state={jobState} onDismiss={() => setImportJobId(null)} />
      )}

      {showCreate && (
        <Card className="p-4">
          <QuestionForm
            bankPublicId={bankId}
            onSaved={async () => {
              await qc.invalidateQueries({ queryKey: ['bank-questions', bankId] });
              setShowCreate(false);
            }}
            onCancel={() => setShowCreate(false)}
          />
        </Card>
      )}

      {questionsQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : questions.length === 0 && !showCreate ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-sm font-medium">No questions yet</p>
          <p className="text-muted-foreground text-xs">
            Click "New question" to add one, or import from an xlsx file.
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {questions.map((q, i) => (
            <QuestionCard
              key={q.publicId}
              q={q}
              index={i}
              bankPublicId={bankId}
              onSaved={() => qc.invalidateQueries({ queryKey: ['bank-questions', bankId] })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ImportStatusBanner({
  state,
  onDismiss,
}: {
  state: ImportJobState;
  onDismiss: () => void;
}) {
  const done = state.status === 'completed' || state.status === 'failed';
  const summary = state.summary;

  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-2 rounded-lg border px-4 py-3 text-sm',
        state.status === 'failed'
          ? 'border-destructive/30 bg-destructive/10'
          : state.status === 'completed'
            ? 'border-success/30 bg-success/10'
            : 'border-amber-400/30 bg-amber-50 dark:bg-amber-950/20',
      )}
    >
      <div className="space-y-1">
        {!done && (
          <p className="flex items-center gap-1.5 font-medium">
            <Loader2 className="size-3.5 animate-spin" /> Importing questions…
          </p>
        )}
        {done && summary && (
          <p className="font-medium">
            Import {state.status === 'completed' ? 'complete' : 'finished with errors'} —{' '}
            {summary.imported} of {summary.total} question{summary.total !== 1 ? 's' : ''} added
          </p>
        )}
        {summary && summary.errors.length > 0 && (
          <ul className="text-destructive mt-1 space-y-0.5 text-xs">
            {summary.errors.slice(0, 5).map((e, i) => (
              <li key={i}>
                Row {e.row}: {e.message}
              </li>
            ))}
            {summary.errors.length > 5 && <li>…and {summary.errors.length - 5} more errors</li>}
          </ul>
        )}
      </div>
      {done && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

function QuestionCard({
  q,
  index,
  bankPublicId,
  onSaved,
}: {
  q: BankQuestion;
  index: number;
  bankPublicId: string;
  onSaved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="bg-card rounded-lg border p-4">
        <QuestionForm
          bankPublicId={bankPublicId}
          question={q}
          onSaved={() => {
            onSaved();
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="bg-card rounded-lg border">
      <div className="flex items-start gap-2 p-4">
        <button
          type="button"
          className="flex flex-1 items-start gap-3 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="bg-muted mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase',
                  q.type === 'mcq'
                    ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
                    : 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
                )}
              >
                {q.type}
              </span>
              <span className="text-muted-foreground text-xs">{q.marks} marks</span>
            </div>
            <p className="text-sm leading-snug">
              <MathText text={q.text} />
            </p>
          </div>
          {expanded ? (
            <ChevronDown className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          ) : (
            <ChevronRight className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          )}
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-3.5" /> Edit
        </Button>
      </div>

      {expanded && (
        <div className="space-y-2 border-t px-4 pb-4 pt-3">
          {q.type === 'mcq' && q.options && (
            <ul className="space-y-1.5">
              {q.options.map((o) => (
                <li
                  key={o.publicId}
                  className={cn(
                    'flex items-start gap-2 rounded-md border px-3 py-1.5 text-sm',
                    o.isCorrect
                      ? 'border-success/40 bg-success/10 text-success font-medium'
                      : 'text-muted-foreground border-transparent',
                  )}
                >
                  <MathText text={o.text} />
                </li>
              ))}
            </ul>
          )}
          {q.explanation && (
            <div className="bg-muted/40 rounded-md border px-3 py-2 text-sm">
              <p className="text-muted-foreground mb-1 text-xs font-medium">Explanation</p>
              <MathText text={q.explanation} />
            </div>
          )}
          {q.modelAnswer && (
            <div className="bg-muted/40 rounded-md border px-3 py-2 text-sm">
              <p className="text-muted-foreground mb-1 text-xs font-medium">Model answer</p>
              <MathText text={q.modelAnswer} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

type QType = 'mcq' | 'written';
const EMPTY_OPTIONS = ['', '', '', ''];

function QuestionForm({
  bankPublicId,
  question,
  onSaved,
  onCancel,
}: {
  bankPublicId: string;
  /** When provided, the form edits this question instead of creating a new one. */
  question?: BankQuestion;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(question);
  const initialOptions = question?.options?.length
    ? [...question.options].sort((a, b) => a.order - b.order).map((o) => o.text)
    : EMPTY_OPTIONS;
  const initialCorrect = question?.options?.length
    ? Math.max(
        0,
        [...question.options].sort((a, b) => a.order - b.order).findIndex((o) => o.isCorrect),
      )
    : 0;

  // The question type is fixed on edit (the API keys explanation/options off it).
  const [type, setType] = useState<QType>((question?.type as QType) ?? 'mcq');
  const [text, setText] = useState(question?.text ?? '');
  const [marks, setMarks] = useState(question ? String(question.marks) : '1');
  const [explanation, setExplanation] = useState(question?.explanation ?? '');
  const [modelAnswer, setModelAnswer] = useState(question?.modelAnswer ?? '');
  const [options, setOptions] = useState<string[]>(initialOptions);
  const [correctIndex, setCorrectIndex] = useState(initialCorrect);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const marksNum = Number(marks);
  const filledOptions = options.map((t) => t.trim());
  const nonEmptyCount = filledOptions.filter(Boolean).length;
  const validText = text.trim().length > 0;
  const validMarks = marksNum > 0;
  const validOptions = type !== 'mcq' || (nonEmptyCount >= 2 && !!filledOptions[correctIndex]);

  const save = useMutation({
    mutationFn: () => {
      if (isEdit && question) {
        const payload =
          type === 'mcq'
            ? {
                text: text.trim(),
                marks: marksNum,
                explanation: explanation.trim() || undefined,
                options: filledOptions
                  .map((t, i) => ({ text: t, isCorrect: i === correctIndex, order: i }))
                  .filter((o) => o.text.length > 0),
              }
            : {
                text: text.trim(),
                marks: marksNum,
                modelAnswer: modelAnswer.trim() || undefined,
              };
        return updateQuestion(question.publicId, payload);
      }
      const payload =
        type === 'mcq'
          ? {
              bankPublicId,
              type: 'mcq' as const,
              text: text.trim(),
              marks: marksNum,
              explanation: explanation.trim() || undefined,
              options: filledOptions
                .map((t, i) => ({ text: t, isCorrect: i === correctIndex, order: i }))
                .filter((o) => o.text.length > 0),
            }
          : {
              bankPublicId,
              type: 'written' as const,
              text: text.trim(),
              marks: marksNum,
              modelAnswer: modelAnswer.trim() || undefined,
            };
      return createQuestion(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Question updated' : 'Question added');
      onSaved();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not save question'),
  });

  function submit() {
    setAttempted(true);
    if (!validText || !validMarks || !validOptions) return;
    setError(null);
    save.mutate();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{isEdit ? 'Edit question' : 'New question'}</p>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          Cancel
        </button>
      </div>

      {/* Type — locked while editing */}
      <div className="flex w-fit items-center gap-1 rounded-md border p-0.5">
        {(['mcq', 'written'] as QType[]).map((t) => (
          <button
            key={t}
            type="button"
            disabled={isEdit}
            onClick={() => !isEdit && setType(t)}
            className={cn(
              'rounded px-3 py-1 text-xs font-medium transition-colors',
              type === t
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
              isEdit && type !== t && 'opacity-40',
              isEdit && 'cursor-not-allowed',
            )}
          >
            {t === 'mcq' ? 'MCQ' : 'Written'}
          </button>
        ))}
      </div>

      {/* Question text */}
      <div>
        <label
          className={cn(
            'mb-1 block text-xs font-medium',
            attempted && !validText && 'text-destructive',
          )}
        >
          Question text{' '}
          <span className="text-muted-foreground font-normal">(use $…$ for math)</span>
        </label>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
        />
        {attempted && !validText && (
          <p className="text-destructive mt-1 text-xs">Question text is required</p>
        )}
        {text && (
          <div className="bg-muted/40 mt-1 rounded px-2 py-1 text-sm">
            <MathText text={text} />
          </div>
        )}
      </div>

      {/* Marks */}
      <div className="flex items-center gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Marks</label>
          <Input
            type="number"
            min={0.25}
            step="0.25"
            value={marks}
            onChange={(e) => setMarks(e.target.value)}
            className="h-9 w-24"
          />
        </div>
        {attempted && !validMarks && (
          <p className="text-destructive self-end pb-2 text-xs">Must be &gt; 0</p>
        )}
      </div>

      {type === 'mcq' ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium">
            Options{' '}
            <span className="text-muted-foreground font-normal">(click radio = correct)</span>
          </legend>
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct-opt"
                checked={correctIndex === i}
                onChange={() => setCorrectIndex(i)}
                className="accent-primary size-4 shrink-0"
                aria-label={`Mark option ${i + 1} correct`}
              />
              <Input
                value={opt}
                onChange={(e) =>
                  setOptions((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))
                }
                placeholder={`Option ${i + 1} (use $…$ for math)`}
                className="h-9"
              />
            </div>
          ))}
          {attempted && !validOptions && (
            <p className="text-destructive text-xs">
              Provide at least 2 options and mark the correct one
            </p>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium">Explanation (optional)</label>
            <textarea
              rows={2}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Use $…$ for math"
              className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
            />
          </div>
        </fieldset>
      ) : (
        <div>
          <label className="mb-1 block text-xs font-medium">Model answer (optional)</label>
          <textarea
            rows={3}
            value={modelAnswer}
            onChange={(e) => setModelAnswer(e.target.value)}
            placeholder="Use $…$ for math"
            className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
        </div>
      )}

      {error && <p className="text-destructive text-xs">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />}{' '}
          {isEdit ? 'Save changes' : 'Add to bank'}
        </Button>
      </div>
    </div>
  );
}
