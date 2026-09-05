import type { ImportJobState } from '@exam/types';
import { CheckCircle2, Download, FileUp, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  errorReportUrl,
  fetchImportState,
  templateUrl,
  uploadEntity,
  uploadStudents,
  type ImportEntity,
} from './importApi';

type Phase =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'processing' }
  | { kind: 'done'; state: ImportJobState }
  | { kind: 'error'; message: string };

export function ImportModal({
  entity,
  open,
  onOpenChange,
  batchPublicId,
  onImported,
}: {
  entity: ImportEntity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required for students (the target batch). */
  batchPublicId?: string;
  onImported?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPhase({ kind: 'idle' });
    setFileName(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const poll = async (jobId: string) => {
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const state = await fetchImportState(jobId);
        if (state.status === 'completed') {
          setPhase({ kind: 'done', state });
          onImported?.();
          return;
        }
        if (state.status === 'failed') {
          setPhase({ kind: 'error', message: state.message ?? 'Import failed' });
          return;
        }
      } catch {
        // transient — keep polling
      }
    }
    setPhase({ kind: 'error', message: 'Import took too long. Check back later.' });
  };

  const onFile = async (file: File) => {
    setFileName(file.name);
    setPhase({ kind: 'uploading' });
    try {
      const jobId =
        entity === 'students'
          ? await uploadStudents(file, batchPublicId!)
          : await uploadEntity(entity, file);
      setPhase({ kind: 'processing' });
      void poll(jobId);
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Upload failed' });
    }
  };

  const needsBatch = entity === 'students' && !batchPublicId;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="capitalize">Import {entity}</DialogTitle>
          <DialogDescription>
            Upload a .xlsx or .csv file. Download the template first to get the exact columns.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-4">
          <a
            href={templateUrl(entity, 'xlsx')}
            className="text-primary inline-flex items-center gap-1.5 text-sm hover:underline"
          >
            <Download className="size-4" /> Template (.xlsx)
          </a>
          <a
            href={templateUrl(entity, 'csv')}
            className="text-primary inline-flex items-center gap-1.5 text-sm hover:underline"
          >
            <Download className="size-4" /> Template (.csv)
          </a>
        </div>

        {phase.kind === 'done' ? (
          <div className="space-y-3">
            <div className="border-success/30 bg-success/10 flex items-start gap-2 rounded-md border p-3">
              <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">
                  {phase.state.summary?.imported ?? 0} imported
                  {(phase.state.summary?.skipped ?? 0) > 0 &&
                    `, ${phase.state.summary?.skipped} skipped`}
                  {(phase.state.summary?.failed ?? 0) > 0 &&
                    `, ${phase.state.summary?.failed} failed`}
                </p>
                <p className="text-muted-foreground">
                  {phase.state.summary?.total ?? 0} rows processed.
                </p>
              </div>
            </div>
            {(phase.state.summary?.failed ?? 0) > 0 && (
              <a
                href={errorReportUrl(phase.state.jobId)}
                className="text-destructive inline-flex items-center gap-1.5 text-sm hover:underline"
              >
                <Download className="size-4" /> Download error report
              </a>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                Import another
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <button
              type="button"
              disabled={needsBatch || phase.kind === 'uploading' || phase.kind === 'processing'}
              onClick={() => inputRef.current?.click()}
              className="hover:bg-muted/40 flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center transition-colors disabled:opacity-50"
            >
              {phase.kind === 'uploading' || phase.kind === 'processing' ? (
                <>
                  <Loader2 className="text-muted-foreground size-6 animate-spin" />
                  <span className="text-sm font-medium">
                    {phase.kind === 'uploading' ? 'Uploading…' : 'Processing rows…'}
                  </span>
                  {fileName && <span className="text-muted-foreground text-xs">{fileName}</span>}
                </>
              ) : (
                <>
                  <FileUp className="text-muted-foreground size-6" />
                  <span className="text-sm font-medium">Choose a file to upload</span>
                  <span className="text-muted-foreground text-xs">.xlsx or .csv</span>
                </>
              )}
            </button>

            {needsBatch && (
              <p className="text-warning text-xs">Select a session before importing students.</p>
            )}
            {phase.kind === 'error' && <p className="text-destructive text-sm">{phase.message}</p>}
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                <Upload className="size-4" /> Close
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
