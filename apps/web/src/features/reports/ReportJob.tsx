import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { pollReport, requestReport } from './reportsApi';

type Phase =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'ready'; excel: string; pdf: string }
  | { kind: 'error'; message: string };

/**
 * Generate → poll → download for one report. The server is idempotent within an hour, so a repeat
 * request for the same exam/type/student returns the cached job and resolves to "ready" at once.
 */
export function ReportJob({
  examPublicId,
  type,
  studentPublicId,
  label,
}: {
  examPublicId: string;
  type: 'overall' | 'individual';
  studentPublicId?: string;
  label: string;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const poll = async (jobId: string) => {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const s = await pollReport(jobId);
        if (s.status === 'ready' && s.downloads) {
          setPhase({ kind: 'ready', excel: s.downloads.excel, pdf: s.downloads.pdf });
          return;
        }
        if (s.status === 'failed') {
          setPhase({ kind: 'error', message: s.message ?? 'Report generation failed' });
          return;
        }
      } catch {
        // transient — keep polling
      }
    }
    setPhase({ kind: 'error', message: 'Report took too long. Try again.' });
  };

  const start = useMutation({
    mutationFn: () => requestReport(examPublicId, type, studentPublicId),
    onMutate: () => setPhase({ kind: 'generating' }),
    onSuccess: (jobId) => void poll(jobId),
    onError: (e) =>
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Could not start' }),
  });

  if (phase.kind === 'ready') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-success text-xs font-medium">Ready</span>
        <Button asChild variant="outline" size="sm">
          <a href={phase.excel}>
            <FileSpreadsheet className="size-4" /> Excel
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={phase.pdf}>
            <FileText className="size-4" /> PDF
          </a>
        </Button>
      </div>
    );
  }

  if (phase.kind === 'generating') {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="size-4 animate-spin" /> Generating…
      </Button>
    );
  }

  if (phase.kind === 'error') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-destructive inline-flex items-center gap-1 text-xs">
          <AlertCircle className="size-3.5" /> {phase.message}
        </span>
        <Button variant="outline" size="sm" onClick={() => start.mutate()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={() => start.mutate()}>
      <Download className="size-4" /> {label}
    </Button>
  );
}
