import { Download, FileSpreadsheet, FileText, Upload } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ImportModal } from './ImportModal';
import { exportUrl, templateUrl, type ImportEntity } from './importApi';

/**
 * Compact per-page toolbar: download a template (.xlsx/.csv), import a file, or export the
 * current data (.xlsx/.csv). Replaces the standalone bulk-import page — every management page
 * (teachers, students, semesters, courses, …) mounts this next to its own actions.
 */
export function ImportExportBar({
  entity,
  label,
  batchPublicId,
  exportFilter,
  onImported,
  disabledReason,
}: {
  entity: ImportEntity;
  /** Human label used in menus, e.g. "teachers". */
  label: string;
  /** Target batch for a student import (required to enable importing students). */
  batchPublicId?: string;
  /** Optional filter passed to the export route (department for teachers, batch for students). */
  exportFilter?: string;
  onImported?: () => void;
  /** When set, the Import button is disabled and this explains why (e.g. "Pick a batch first"). */
  disabledReason?: string;
}) {
  const [importing, setImporting] = useState(false);
  const importDisabled = Boolean(disabledReason);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Template — icon only */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            title={`Download ${label} template`}
            aria-label={`Download ${label} template`}
          >
            <FileText className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Download {label} template</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href={templateUrl(entity, 'xlsx')}>
              <FileSpreadsheet className="size-4" /> Excel (.xlsx)
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={templateUrl(entity, 'csv')}>
              <FileText className="size-4" /> CSV (.csv)
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Export — icon only */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            title={`Export ${label}`}
            aria-label={`Export ${label}`}
          >
            <Download className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Export {label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href={exportUrl(entity, 'xlsx', exportFilter)}>
              <FileSpreadsheet className="size-4" /> Excel (.xlsx)
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={exportUrl(entity, 'csv', exportFilter)}>
              <FileText className="size-4" /> CSV (.csv)
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Import — icon only */}
      <Button
        size="icon"
        className="size-9"
        onClick={() => setImporting(true)}
        disabled={importDisabled}
        title={disabledReason ?? `Import ${label}`}
        aria-label={disabledReason ?? `Import ${label}`}
      >
        <Upload className="size-4" />
      </Button>

      {importing && (
        <ImportModal
          entity={entity}
          open={importing}
          onOpenChange={(o) => !o && setImporting(false)}
          batchPublicId={batchPublicId}
          onImported={onImported}
        />
      )}
    </div>
  );
}
