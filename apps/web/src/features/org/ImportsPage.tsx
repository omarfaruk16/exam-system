import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  BookOpen,
  Download,
  GraduationCap,
  Landmark,
  Layers,
  Upload,
  Users,
} from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { fetchBatches } from './orgApi';
import { exportUrl, type ExportEntity, type ImportEntity } from './importApi';
import { ImportModal } from './ImportModal';

interface CardDef {
  entity: ImportEntity;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

const CARDS: CardDef[] = [
  {
    entity: 'faculties',
    title: 'Faculties',
    description: 'Adds faculties by name. Existing names are skipped.',
    icon: Landmark,
  },
  {
    entity: 'departments',
    title: 'Departments',
    description: 'Adds departments under a faculty. Existing names are skipped.',
    icon: Building2,
  },
  {
    entity: 'semesters',
    title: 'Semesters',
    description:
      'Adds semesters to a batch (by program + batch + number). Existing ones are skipped.',
    icon: Layers,
  },
  {
    entity: 'courses',
    title: 'Courses',
    description: 'Adds courses to a batch’s semester. Existing codes are skipped.',
    icon: BookOpen,
  },
  {
    entity: 'teachers',
    title: 'Teachers',
    description: 'Creates teacher accounts scoped to a department (temp password).',
    icon: Users,
  },
  {
    entity: 'students',
    title: 'Students',
    description: 'Import a batch roster. Creates student accounts.',
    icon: GraduationCap,
  },
];

const EXPORTS: { entity: ExportEntity; title: string }[] = [
  { entity: 'faculties', title: 'Faculties' },
  { entity: 'departments', title: 'Departments' },
  { entity: 'semesters', title: 'Semesters' },
  { entity: 'courses', title: 'Courses' },
];

export function ImportsPage() {
  const [openEntity, setOpenEntity] = useState<ImportEntity | null>(null);
  const [batch, setBatch] = useState('');
  const batchesQuery = useQuery({ queryKey: ['org-batches-all'], queryFn: () => fetchBatches() });

  return (
    <div>
      <h2 className="mb-1 text-sm font-semibold">Bulk import</h2>
      <p className="text-muted-foreground mb-4 text-sm">
        Upload Excel (.xlsx) or CSV files. Download a template in each dialog for the exact columns.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {CARDS.map((c) => (
          <Card key={c.entity} className="flex flex-col gap-3 p-5">
            <div className="flex items-start gap-3">
              <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                <c.icon className="size-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-medium">{c.title}</h3>
                <p className="text-muted-foreground text-xs">{c.description}</p>
              </div>
            </div>

            {c.entity === 'students' && (
              <div>
                <Label htmlFor="imp-batch" className="text-xs">
                  Target batch
                </Label>
                <select
                  id="imp-batch"
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                  className="border-input bg-card focus-visible:ring-ring mt-1 flex h-9 w-full rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2"
                >
                  <option value="">Select a batch…</option>
                  {(batchesQuery.data ?? []).map((b) => (
                    <option key={b.publicId} value={b.publicId}>
                      {b.program.name} · {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="mt-auto self-start"
              disabled={c.entity === 'students' && !batch}
              onClick={() => setOpenEntity(c.entity)}
            >
              <Upload className="size-4" /> Import {c.title.toLowerCase()}
            </Button>
          </Card>
        ))}
      </div>

      {/* Export existing data — the sheets match the import templates, so you can edit and re-import. */}
      <h2 className="mb-1 mt-8 text-sm font-semibold">Export data (.xlsx)</h2>
      <p className="text-muted-foreground mb-4 text-sm">
        Download current structure data. The columns match the import templates, so an exported
        sheet can be edited and imported back.
      </p>
      <div className="flex flex-wrap gap-2">
        {EXPORTS.map((e) => (
          <a key={e.entity} href={exportUrl(e.entity)}>
            <Button variant="outline" size="sm">
              <Download className="size-4" /> {e.title}
            </Button>
          </a>
        ))}
      </div>

      {openEntity && (
        <ImportModal
          entity={openEntity}
          open={Boolean(openEntity)}
          onOpenChange={(o) => !o && setOpenEntity(null)}
          batchPublicId={openEntity === 'students' ? batch : undefined}
        />
      )}
    </div>
  );
}
