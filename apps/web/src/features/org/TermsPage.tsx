import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AcademicTerm } from '@exam/types';
import { CalendarDays, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingToggle } from '../authoring/SettingToggle';
import { createTerm, fetchTerms, updateTerm } from './orgApi';

export function TermsPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['org-terms'], queryFn: fetchTerms });
  const terms = data ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['org-terms'] });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateTerm(id, { isActive }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update term'),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Academic terms</h2>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="size-4" /> New term
        </Button>
      </div>

      {creating && (
        <TermForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            void invalidate();
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
      ) : terms.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-14 text-center">
          <CalendarDays className="text-muted-foreground size-7" />
          <p className="font-medium">No terms yet</p>
          <p className="text-muted-foreground text-sm">Add an academic term to get started.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {terms.map((t) =>
            editing === t.publicId ? (
              <TermForm
                key={t.publicId}
                term={t}
                onClose={() => setEditing(null)}
                onSaved={() => {
                  void invalidate();
                  setEditing(null);
                }}
              />
            ) : (
              <Card key={t.publicId} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {fmt(t.startDate)} → {fmt(t.endDate)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <SettingToggle
                    label="Active"
                    checked={t.isActive}
                    onChange={(isActive) => toggleActive.mutate({ id: t.publicId, isActive })}
                  />
                  <Button variant="outline" size="sm" onClick={() => setEditing(t.publicId)}>
                    Edit
                  </Button>
                </div>
              </Card>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function TermForm({
  term,
  onClose,
  onSaved,
}: {
  term?: AcademicTerm;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(term?.name ?? '');
  const [start, setStart] = useState(term ? term.startDate.slice(0, 10) : '');
  const [end, setEnd] = useState(term ? term.endDate.slice(0, 10) : '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        startDate: new Date(start).toISOString(),
        endDate: new Date(end).toISOString(),
      };
      if (new Date(end) <= new Date(start))
        throw new Error('End date must be after the start date');
      return term ? updateTerm(term.publicId, body) : createTerm(body);
    },
    onSuccess: () => {
      toast.success(term ? 'Term updated' : 'Term created');
      onSaved();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not save term'),
  });

  return (
    <Card className="mb-3 p-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          save.mutate();
        }}
      >
        <div>
          <Label htmlFor="term-name" className="text-xs">
            Name
          </Label>
          <Input
            id="term-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Spring 2026"
            className="mt-1 h-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="term-start" className="text-xs">
              Start date
            </Label>
            <Input
              id="term-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 h-9"
            />
          </div>
          <div>
            <Label htmlFor="term-end" className="text-xs">
              End date
            </Label>
            <Input
              id="term-end"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 h-9"
            />
          </div>
        </div>
        {error && <p className="text-destructive text-xs">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        </div>
      </form>
    </Card>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
