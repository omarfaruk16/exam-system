/** Shared shapes for the bulk student Excel import (§6.1) and its progress reporting. */

export interface ImportRowError {
  /** 1-based row number in the uploaded sheet (matching what the user sees). */
  row: number;
  field?: string;
  value?: string;
  message: string;
}

export interface ImportSummary {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  errors: ImportRowError[];
}

export type ImportJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface ImportJobState {
  jobId: string;
  status: ImportJobStatus;
  /** 0–100. */
  progress: number;
  summary?: ImportSummary;
  errorReportUrl?: string;
  message?: string;
}
