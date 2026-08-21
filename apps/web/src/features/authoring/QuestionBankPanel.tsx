import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BankQuestion } from '@exam/types';
import { Check, Loader2, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { MathText } from '@/components/ui/math-text';
import {
  addExamQuestion,
  createBank,
  fetchBankQuestions,
  fetchBanks,
  fetchQuestionsByPart,
} from './authoringApi';
import { QuestionCreateForm } from './QuestionCreateForm';

type Filter = 'all' | 'mcq' | 'written';
const ALL_CHAPTERS = '__all__';

export function QuestionBankPanel({
  examPublicId,
  coursePartPublicId,
  addedQuestionIds,
  nextOrder,
}: {
  examPublicId: string;
  coursePartPublicId: string;
  addedQuestionIds: Set<string>;
  nextOrder: number;
}) {
  const qc = useQueryClient();
  const [chapterId, setChapterId] = useState<string>('');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const banksQuery = useQuery({
    queryKey: ['banks', coursePartPublicId],
    queryFn: () => fetchBanks(coursePartPublicId),
  });

  useEffect(() => {
    const first = banksQuery.data?.[0];
    if (!chapterId && first) setChapterId(first.publicId);
  }, [chapterId, banksQuery.data]);

  // All-chapters mode fetches across the whole part; single-chapter mode fetches one bank.
  const allMode = chapterId === ALL_CHAPTERS;
  const questionsQuery = useQuery({
    queryKey: allMode ? ['questions-by-part', coursePartPublicId] : ['bank-questions', chapterId],
    queryFn: allMode
      ? () => fetchQuestionsByPart(coursePartPublicId)
      : () => fetchBankQuestions(chapterId),
    enabled: allMode ? true : Boolean(chapterId),
  });

  const add = useMutation({
    mutationFn: (questionPublicId: string) =>
      addExamQuestion(examPublicId, { questionPublicId, order: nextOrder }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['exam-questions', examPublicId] }),
        qc.invalidateQueries({ queryKey: ['authoring-exam', examPublicId] }),
      ]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not add the question'),
  });

  const banks = banksQuery.data ?? [];
  const questions = questionsQuery.data ?? [];
  const filtered = questions.filter((q) => {
    if (filter !== 'all' && q.type !== filter) return false;
    if (search.trim() && !q.text.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const activeBankForCreate = allMode ? (banks[0]?.publicId ?? '') : chapterId;

  return (
    <Card className="flex max-h-[calc(100vh-11rem)] flex-col overflow-hidden p-0 lg:sticky lg:top-6">
      <div className="border-b p-4">
        <h2 className="text-sm font-semibold">Question bank</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Filter by chapter, then add questions to this exam.
        </p>

        {banksQuery.isLoading ? (
          <div className="bg-muted mt-3 h-10 animate-pulse rounded-md" />
        ) : banks.length === 0 ? (
          <NoBanks coursePartPublicId={coursePartPublicId} onCreated={(id) => setChapterId(id)} />
        ) : (
          <>
            {/* Chapter filter chips */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <ChapterChip
                label="All chapters"
                active={chapterId === ALL_CHAPTERS}
                onClick={() => setChapterId(ALL_CHAPTERS)}
              />
              {banks.map((b) => (
                <ChapterChip
                  key={b.publicId}
                  label={b.name}
                  active={chapterId === b.publicId}
                  onClick={() => setChapterId(b.publicId)}
                />
              ))}
            </div>

            {/* MCQ / Written filter */}
            <div className="mt-3 flex items-center gap-1 rounded-md border p-0.5">
              {(['all', 'mcq', 'written'] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    'flex-1 rounded px-2 py-1 text-xs font-medium capitalize transition-colors',
                    filter === f
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {f === 'all' ? 'All' : f.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="relative mt-2">
              <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search questions…"
                className="h-9 pl-8"
              />
            </div>
          </>
        )}
      </div>

      {/* Question list */}
      {banks.length > 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {questionsQuery.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="bg-muted h-16 animate-pulse rounded-md" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {questions.length === 0
                ? 'No questions in this chapter yet. Add one below.'
                : 'No questions match your filter.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((q) => (
                <BankQuestionCard
                  key={q.publicId}
                  q={q}
                  showChapter={allMode}
                  added={addedQuestionIds.has(q.publicId)}
                  adding={add.isPending && add.variables === q.publicId}
                  onAdd={() => add.mutate(q.publicId)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Inline question creation */}
      {activeBankForCreate && (
        <div className="border-t p-4">
          <QuestionCreateForm bankPublicId={activeBankForCreate} />
        </div>
      )}
    </Card>
  );
}

function ChapterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

function BankQuestionCard({
  q,
  showChapter,
  added,
  adding,
  onAdd,
}: {
  q: BankQuestion;
  showChapter: boolean;
  added: boolean;
  adding: boolean;
  onAdd: () => void;
}) {
  return (
    <li className="rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-1.5">
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
        {showChapter && (
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
            {q.bank.name}
          </span>
        )}
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">{q.marks} marks</span>
      </div>
      <p className="mt-1.5 line-clamp-3 text-sm">
        <MathText text={q.text} />
      </p>
      <div className="mt-2 flex justify-end">
        {added ? (
          <Button variant="ghost" size="sm" disabled className="text-success h-7">
            <Check className="size-4" /> Added
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-7" onClick={onAdd} disabled={adding}>
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add to exam
          </Button>
        )}
      </div>
    </li>
  );
}

function NoBanks({
  coursePartPublicId,
  onCreated,
}: {
  coursePartPublicId: string;
  onCreated: (bankId: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('Chapter 1');
  const create = useMutation({
    mutationFn: () => createBank(coursePartPublicId, name.trim() || 'Chapter 1'),
    onSuccess: async (bank) => {
      await qc.invalidateQueries({ queryKey: ['banks', coursePartPublicId] });
      onCreated(bank.publicId);
      toast.success('Chapter created');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not create the chapter'),
  });
  return (
    <div className="mt-3 rounded-md border border-dashed p-3">
      <p className="text-muted-foreground text-xs">
        No chapters yet. Create one to start adding questions.
      </p>
      <div className="mt-2 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
        <Button
          size="sm"
          className="h-9"
          onClick={() => create.mutate()}
          disabled={create.isPending}
        >
          {create.isPending && <Loader2 className="size-4 animate-spin" />}
          Create
        </Button>
      </div>
    </div>
  );
}
