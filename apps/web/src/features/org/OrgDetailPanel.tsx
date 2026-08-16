import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
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
import { UserCog } from 'lucide-react';
import { LEVEL_LABEL, loadChildren, nodeName, type OrgNode } from './orgModel';
import {
  childCountOf,
  DEGREE_TYPES,
  fieldValues,
  LEVEL_CONFIG,
  type AddChildDef,
  type FieldDef,
} from './orgLevelConfig';
import { assignTeacher } from './orgApi';
import { TeacherSelector } from './TeacherSelector';

export function OrgDetailPanel({
  node,
  onSelect,
  onDeleted,
}: {
  node: OrgNode;
  onSelect: (n: OrgNode) => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const cfg = LEVEL_CONFIG[node.level];
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addChild, setAddChild] = useState<AddChildDef | null>(null);

  // Reset transient panel state whenever the selected node changes.
  const [lastId, setLastId] = useState(node.publicId);
  if (lastId !== node.publicId) {
    setLastId(node.publicId);
    setMode('view');
    setConfirmDelete(false);
    setAddChild(null);
  }

  const invalidateTree = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['org-children'] }),
      qc.invalidateQueries({ queryKey: ['org-faculties'] }),
    ]);

  const remove = useMutation({
    mutationFn: () => cfg.remove(node.publicId),
    onSuccess: async () => {
      toast.success(`${LEVEL_LABEL[node.level]} deleted`);
      await invalidateTree();
      onDeleted();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not delete'),
  });

  const { count, label } = childCountOf(node);

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              {LEVEL_LABEL[node.level]}
            </p>
            <h2 className="mt-0.5 truncate text-xl font-semibold">{nodeName(node)}</h2>
          </div>
          {mode === 'view' && (
            <div className="flex shrink-0 gap-2">
              {cfg.editable && (
                <Button variant="outline" size="sm" onClick={() => setMode('edit')}>
                  <Pencil className="size-4" /> Edit
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )}
        </div>

        {mode === 'view' ? (
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {cfg.fields.map((f) => (
              <div key={f.key}>
                <dt className="text-muted-foreground text-xs">{f.label}</dt>
                <dd className="mt-0.5 font-medium">
                  {String((node.raw as unknown as Record<string, unknown>)[f.key] ?? '—')}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <EditForm
            node={node}
            onDone={() => setMode('view')}
            onSaved={invalidateTree}
            onSelect={onSelect}
          />
        )}
      </Card>

      {/* Assigned teacher (course parts only) */}
      {node.level === 'part' && <PartTeacherCard node={node} onSaved={invalidateTree} />}

      {/* Children + add */}
      {(cfg.addChildren.length > 0 || count > 0) && (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Children</h3>
            <div className="flex gap-2">
              {cfg.addChildren.map((ac) => (
                <Button
                  key={ac.level}
                  variant="outline"
                  size="sm"
                  onClick={() => setAddChild(addChild?.level === ac.level ? null : ac)}
                >
                  <Plus className="size-4" /> {ac.label}
                </Button>
              ))}
            </div>
          </div>

          {addChild && (
            <AddChildForm
              parent={node}
              def={addChild}
              onClose={() => setAddChild(null)}
              onCreated={invalidateTree}
            />
          )}

          <ChildrenTable node={node} onSelect={onSelect} />
        </Card>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {LEVEL_LABEL[node.level].toLowerCase()}?</DialogTitle>
            <DialogDescription>
              “{nodeName(node)}” will be hidden from active use (soft delete).
              {count > 0 && (
                <span className="text-foreground mt-2 flex items-start gap-1.5 rounded-md border-l-2 border-amber-500 bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  This {LEVEL_LABEL[node.level].toLowerCase()} has {count} active {label}
                  {count === 1 ? '' : 's'}. Deleting it will hide them from active offerings.
                </span>
              )}
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
    </div>
  );
}

function EditForm({
  node,
  onDone,
  onSaved,
  onSelect,
}: {
  node: OrgNode;
  onDone: () => void;
  onSaved: () => Promise<unknown>;
  onSelect: (n: OrgNode) => void;
}) {
  const cfg = LEVEL_CONFIG[node.level];
  const [values, setValues] = useState<Record<string, string>>(fieldValues(node));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      if (!cfg.update) throw new Error('Not editable');
      return cfg.update(node.publicId, coerce(values, cfg.fields));
    },
    onSuccess: async (updated) => {
      toast.success('Saved');
      await onSaved();
      // Reflect the edit in the selected node without a full refetch.
      onSelect({ ...node, raw: { ...node.raw, ...(updated as object) } } as OrgNode);
      onDone();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not save'),
  });

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        save.mutate();
      }}
    >
      {cfg.fields.map((f) => (
        <FieldInput
          key={f.key}
          field={f}
          value={values[f.key] ?? ''}
          onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
        />
      ))}
      {error && <p className="text-destructive text-xs">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />} Save
        </Button>
      </div>
    </form>
  );
}

function AddChildForm({
  parent,
  def,
  onClose,
  onCreated,
}: {
  parent: OrgNode;
  def: AddChildDef;
  onClose: () => void;
  onCreated: () => Promise<unknown>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      def.fields.map((f) => [f.key, f.kind === 'degree' ? (DEGREE_TYPES[0] ?? 'bachelor') : '']),
    ),
  );
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => def.create(parent.publicId, coerce(values, def.fields)),
    onSuccess: async () => {
      toast.success(`${def.label.replace('Add ', '')} created`);
      await onCreated();
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not create'),
  });

  return (
    <form
      className="bg-muted/40 mt-3 space-y-3 rounded-md border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        create.mutate();
      }}
    >
      <p className="text-sm font-medium">{def.label}</p>
      {def.fields.map((f) => (
        <FieldInput
          key={f.key}
          field={f}
          value={values[f.key] ?? ''}
          onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
        />
      ))}
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

function ChildrenTable({ node, onSelect }: { node: OrgNode; onSelect: (n: OrgNode) => void }) {
  const q = useQuery({
    queryKey: ['org-children', node.level, node.publicId, 'panel'],
    queryFn: () => loadChildren(node),
  });
  const rows = q.data ?? [];
  if (q.isLoading) {
    return <p className="text-muted-foreground mt-4 text-sm">Loading…</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground mt-4 text-sm">
        No {LEVEL_LABEL[node.level].toLowerCase()} children yet.
      </p>
    );
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2 font-medium">Type</th>
            <th className="pb-2 text-right font-medium">Status</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.publicId} className="border-b last:border-0">
              <td className="py-2">{nodeName(c)}</td>
              <td className="text-muted-foreground py-2">{LEVEL_LABEL[c.level]}</td>
              <td className="py-2 text-right">
                <span className="bg-success/10 text-success rounded-full px-2 py-0.5 text-xs font-medium">
                  Active
                </span>
              </td>
              <td className="py-2 text-right">
                <button
                  onClick={() => onSelect(c)}
                  className="text-primary text-xs font-medium hover:underline"
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={`f-${field.key}`} className="text-xs">
        {field.label}
      </Label>
      {field.kind === 'degree' ? (
        <select
          id={`f-${field.key}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border-input bg-card focus-visible:ring-ring mt-1 flex h-9 w-full rounded-md border px-2 text-sm capitalize focus-visible:outline-none focus-visible:ring-2"
        >
          {DEGREE_TYPES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={`f-${field.key}`}
          type={field.kind === 'number' ? 'number' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 h-9"
        />
      )}
    </div>
  );
}

function PartTeacherCard({
  node,
  onSaved,
}: {
  node: Extract<OrgNode, { level: 'part' }>;
  onSaved: () => Promise<unknown>;
}) {
  const [assigning, setAssigning] = useState(false);
  const part = node.raw;
  const departmentPublicId = part.course.semester.program.department.publicId;

  const assign = useMutation({
    mutationFn: (teacherPublicId: string | null) => assignTeacher(node.publicId, teacherPublicId),
    onSuccess: async () => {
      toast.success('Teacher assignment updated');
      await onSaved();
      setAssigning(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not assign teacher'),
  });

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Assigned teacher</h3>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {part.assignedTeacher
              ? `${part.assignedTeacher.user.displayName}${part.assignedTeacher.designation ? ` · ${part.assignedTeacher.designation}` : ''}`
              : 'No teacher assigned'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAssigning((v) => !v)}>
          <UserCog className="size-4" /> {part.assignedTeacher ? 'Change' : 'Assign'}
        </Button>
      </div>
      {assigning && (
        <TeacherSelector
          departmentPublicId={departmentPublicId}
          currentTeacherPublicId={part.assignedTeacher?.publicId ?? null}
          pending={assign.isPending}
          onPick={(teacherPublicId) => assign.mutate(teacherPublicId)}
        />
      )}
    </Card>
  );
}

function coerce(values: Record<string, string>, fields: FieldDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.key] ?? '';
    out[f.key] = f.kind === 'number' ? Number(v) : v;
  }
  return out;
}
