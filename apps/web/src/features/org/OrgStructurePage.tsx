import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { createFaculty, fetchFaculties } from './orgApi';
import { OrgDetailPanel } from './OrgDetailPanel';
import type { OrgNode } from './orgModel';
import { OrgTreeNode } from './OrgTreeNode';

export function OrgStructurePage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<OrgNode | null>(null);
  const [adding, setAdding] = useState(false);

  const facultiesQuery = useQuery({ queryKey: ['org-faculties'], queryFn: fetchFaculties });
  const faculties = facultiesQuery.data ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(280px,340px)_1fr] lg:items-start">
      {/* Tree */}
      <Card className="max-h-[calc(100vh-13rem)] overflow-y-auto p-3 lg:sticky lg:top-6">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold">Structure</h2>
          <Button variant="ghost" size="sm" className="h-7" onClick={() => setAdding((v) => !v)}>
            <Plus className="size-4" /> Faculty
          </Button>
        </div>

        {adding && (
          <AddFacultyForm
            onClose={() => setAdding(false)}
            onCreated={() => qc.invalidateQueries({ queryKey: ['org-faculties'] })}
          />
        )}

        {facultiesQuery.isLoading ? (
          <div className="space-y-2 p-1">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : faculties.length === 0 ? (
          <p className="text-muted-foreground px-1 py-6 text-center text-sm">
            No faculties yet — add one to get started.
          </p>
        ) : (
          <ul role="tree" aria-label="Organization structure" className="space-y-0.5">
            {faculties.map((raw) => (
              <OrgTreeNode
                key={raw.publicId}
                node={{ level: 'faculty', publicId: raw.publicId, raw }}
                depth={0}
                selectedId={selected?.publicId ?? null}
                onSelect={setSelected}
              />
            ))}
          </ul>
        )}
      </Card>

      {/* Detail */}
      <div>
        {selected ? (
          <OrgDetailPanel
            node={selected}
            onSelect={setSelected}
            onDeleted={() => setSelected(null)}
          />
        ) : (
          <Card className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="bg-muted flex size-14 items-center justify-center rounded-full">
              <Building2 className="text-muted-foreground size-7" />
            </div>
            <p className="font-medium">Select an item</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              Choose a faculty, department, or any node in the tree to view and edit its details.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

function AddFacultyForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createFaculty({ name: name.trim() }),
    onSuccess: () => {
      toast.success('Faculty created');
      onCreated();
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not create faculty'),
  });

  return (
    <form
      className="bg-muted/40 mb-2 space-y-2 rounded-md border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        create.mutate();
      }}
    >
      <div>
        <Label htmlFor="fac-name" className="text-xs">
          Name
        </Label>
        <Input
          id="fac-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 h-9"
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
  );
}
