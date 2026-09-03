import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BankQuestion, ImportJobState, PartOption, QuestionBankSummary } from '@exam/types';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileDown,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { MathText } from '@/components/ui/math-text';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import {
  createBank,
  createQuestion,
  deleteBank,
  downloadExport,
  downloadTemplate,
  fetchAuthorableParts,
  fetchBankQuestions,
  fetchBanks,
  fetchImportStatus,
  importQuestions,
  updateBank,
  updateQuestion,
} from '@/features/authoring/authoringApi';

const FILTER_ORDER = ['faculty', 'department', 'program', 'semester', 'course'] as const;
type FilterLevel = (typeof FILTER_ORDER)[number];
type PartFilters = Partial<Record<FilterLevel, string>>;

const norm = (s?: string) => (s ?? '').trim();

export function QuestionBankPage() {
  const { data: parts, isLoading } = useQuery({
    queryKey: ['authorable-parts'],
    queryFn: fetchAuthorableParts,
  });
  const [selectedPartId, setSelectedPartId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<PartFilters>({});

  // Only admins / heads get the Faculty→…→Course filter. A plain teacher sees just their
  // own course parts — no faculty/department filtering needed.
  const { data: sessionUser } = useSession();
  const isStaff = (sessionUser?.roles ?? []).some(
    (r) => r.role === 'admin' || r.role === 'super_admin' || r.role === 'department_head',
  );

  const all = parts ?? [];

  // Each level's match predicate (only constrains when that level is chosen).
  const matches = {
    faculty: (p: PartOption) => !filters.faculty || norm(p.faculty) === filters.faculty,
    department: (p: PartOption) => !filters.department || norm(p.department) === filters.department,
    program: (p: PartOption) => !filters.program || norm(p.program) === filters.program,
    semester: (p: PartOption) => !filters.semester || norm(p.semesterLabel) === filters.semester,
    course: (p: PartOption) => !filters.course || p.courseCode === filters.course,
  };
  const upTo = (level: FilterLevel) => (p: PartOption) => {
    const idx = FILTER_ORDER.indexOf(level);
    return FILTER_ORDER.slice(0, idx).every((l) => matches[l](p));
  };
  const uniqSorted = (values: string[]) =>
    [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

  // Cascading option lists — each narrowed by the selections above it.
  const faculties = uniqSorted(all.map((p) => norm(p.faculty)));
  const departments = uniqSorted(all.filter(upTo('department')).map((p) => norm(p.department)));
  const programs = uniqSorted(all.filter(upTo('program')).map((p) => norm(p.program)));
  const semesterMap = new Map<string, number>();
  all.filter(upTo('semester')).forEach((p) => {
    const label = norm(p.semesterLabel);
    if (label) semesterMap.set(label, p.semesterNumber ?? 0);
  });
  const semesters = [...semesterMap.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
  const courseMap = new Map<string, string>();
  all.filter(upTo('course')).forEach((p) => {
    courseMap.set(p.courseCode, `${p.courseCode} · ${p.courseTitle}`);
  });
  const courses = [...courseMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  // Parts matching every chosen level plus the free-text search.
  const s = search.trim().toLowerCase();
  const filteredParts = all.filter(
    (p) =>
      FILTER_ORDER.every((l) => matches[l](p)) &&
      (!s ||
        p.courseCode.toLowerCase().includes(s) ||
        p.courseTitle.toLowerCase().includes(s) ||
        p.partName.toLowerCase().includes(s)),
  );

  // Drop a stale selection if it falls outside the current filter/search.
  useEffect(() => {
    if (selectedPartId && !filteredParts.some((p) => p.publicId === selectedPartId)) {
      setSelectedPartId('');
    }
  }, [filteredParts, selectedPartId]);

  // A plain teacher lands straight on their first course part (no filtering to do first).
  useEffect(() => {
    if (!isStaff && !selectedPartId && filteredParts.length > 0) {
      setSelectedPartId(filteredParts[0]!.publicId);
    }
  }, [isStaff, selectedPartId, filteredParts]);

  const selectedPart = all.find((p) => p.publicId === selectedPartId);

  function selectLevel(level: FilterLevel, value: string) {
    setFilters((prev) => {
      const next = { ...prev };
      const idx = FILTER_ORDER.indexOf(level);
      for (let i = idx; i < FILTER_ORDER.length; i++) delete next[FILTER_ORDER[i]!];
      if (value) next[level] = value;
      return next;
    });
    setSelectedPartId('');
  }

  const hasActiveFilter = Object.keys(filters).length > 0 || Boolean(s);

  const selectClass =
    'border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50';

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
      ) : all.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <BookOpen className="text-muted-foreground size-7" />
          <p className="font-medium">No course parts available</p>
          <p className="text-muted-foreground text-sm">
            Ask an admin to assign you to a course part.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          {/* Cascading filter + search + part list */}
          <aside className="w-full shrink-0 lg:w-72">
            {/* Search + Faculty→…→Course filter — admin/head only. A teacher just sees their parts. */}
            {isStaff && (
              <>
                {/* Search */}
                <div className="relative">
                  <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search course, code or part…"
                    className="h-9 pl-8"
                  />
                </div>

                {/* Cascading selectors */}
                <div className="mt-3 space-y-2">
                  <FilterSelect
                    label="Faculty"
                    value={filters.faculty ?? ''}
                    options={faculties.map((v) => ({ value: v, label: v }))}
                    onChange={(v) => selectLevel('faculty', v)}
                    className={selectClass}
                  />
                  <FilterSelect
                    label="Department"
                    value={filters.department ?? ''}
                    options={departments.map((v) => ({ value: v, label: v }))}
                    onChange={(v) => selectLevel('department', v)}
                    disabled={!filters.faculty}
                    className={selectClass}
                  />
                  <FilterSelect
                    label="Programme"
                    value={filters.program ?? ''}
                    options={programs.map((v) => ({ value: v, label: v }))}
                    onChange={(v) => selectLevel('program', v)}
                    disabled={!filters.department}
                    className={selectClass}
                  />
                  <FilterSelect
                    label="Semester"
                    value={filters.semester ?? ''}
                    options={semesters.map((v) => ({ value: v, label: v }))}
                    onChange={(v) => selectLevel('semester', v)}
                    disabled={!filters.program}
                    className={selectClass}
                  />
                  <FilterSelect
                    label="Course"
                    value={filters.course ?? ''}
                    options={courses.map(([code, label]) => ({ value: code, label }))}
                    onChange={(v) => selectLevel('course', v)}
                    disabled={!filters.semester}
                    className={selectClass}
                  />
                </div>

                {hasActiveFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilters({});
                      setSearch('');
                    }}
                    className="text-muted-foreground hover:text-foreground mt-2 inline-flex items-center gap-1 text-xs"
                  >
                    <X className="size-3" /> Clear filters
                  </button>
                )}
              </>
            )}

            {/* Matching parts */}
            <p className="text-muted-foreground mb-2 mt-4 text-xs font-semibold uppercase tracking-wide">
              {isStaff ? `Course parts (${filteredParts.length})` : 'Your course parts'}
            </p>
            {filteredParts.length === 0 ? (
              <p className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center text-xs">
                No course parts match your filters.
              </p>
            ) : (
              <ul className="max-h-[28rem] space-y-1 overflow-y-auto pr-1">
                {filteredParts.map((part) => (
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
            )}
          </aside>

          {/* Bank + questions */}
          <div className="min-w-0 flex-1">
            {selectedPart ? (
              <BankView part={selectedPart} />
            ) : (
              <Card className="flex flex-col items-center gap-3 py-16 text-center">
                <BookOpen className="text-muted-foreground size-7" />
                <p className="font-medium">Select a course part</p>
                <p className="text-muted-foreground max-w-sm text-sm">
                  Use the filters or search on the left to find a course part, then pick it to
                  manage its chapters and questions.
                </p>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className="block">
      <span className="text-muted-foreground mb-1 block text-xs">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function BankView({ part }: { part: PartOption }) {
  const qc = useQueryClient();
  const [newBankName, setNewBankName] = useState('Chapter 1');
  const [creatingBank, setCreatingBank] = useState(false);
  const [activeBankId, setActiveBankId] = useState<string>('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<QuestionBankSummary | null>(null);

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

  const renameMut = useMutation({
    mutationFn: (name: string) => updateBank(renamingId!, name),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['banks', part.publicId] });
      setRenamingId(null);
      toast.success('Chapter renamed');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not rename chapter'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteBank(id),
    onSuccess: async (_res, id) => {
      await qc.invalidateQueries({ queryKey: ['banks', part.publicId] });
      if (activeBankId === id) setActiveBankId('');
      setDeleteTarget(null);
      toast.success('Chapter deleted');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete chapter'),
  });

  function startRename(b: QuestionBankSummary) {
    setRenamingId(b.publicId);
    setRenameValue(b.name);
  }

  return (
    <div className="space-y-4">
      {/* Bank tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {banks.map((b) => {
          const active = activeBankId === b.publicId;
          if (renamingId === b.publicId) {
            return (
              <form
                key={b.publicId}
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (renameValue.trim()) renameMut.mutate(renameValue.trim());
                }}
              >
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="h-8 w-40 text-sm"
                  autoFocus
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  className="size-8 p-0"
                  disabled={renameMut.isPending}
                  aria-label="Save chapter name"
                >
                  {renameMut.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="size-8 p-0"
                  onClick={() => setRenamingId(null)}
                  aria-label="Cancel rename"
                >
                  <X className="size-3.5" />
                </Button>
              </form>
            );
          }
          return (
            <span
              key={b.publicId}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border py-1 pl-3 pr-1.5 text-sm transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input text-muted-foreground',
              )}
            >
              <button
                type="button"
                onClick={() => setActiveBankId(b.publicId)}
                className={active ? '' : 'hover:text-foreground'}
              >
                {b.name}
              </button>
              {active && (
                <>
                  <button
                    type="button"
                    onClick={() => startRename(b)}
                    className="hover:bg-primary-foreground/20 rounded-full p-1"
                    aria-label="Rename chapter"
                    title="Rename chapter"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(b)}
                    className="hover:bg-primary-foreground/20 rounded-full p-1"
                    aria-label="Delete chapter"
                    title="Delete chapter"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </>
              )}
            </span>
          );
        })}
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

      {/* Delete chapter confirmation */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this chapter?</DialogTitle>
            <DialogDescription>
              “{deleteTarget?.name}” and all its questions will be removed. Questions already used
              in a published or live exam are kept safe and will block deletion. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.publicId)}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete chapter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
