import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class names, resolving Tailwind conflicts (last wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * The academic-year range for a session, e.g. "2021-2022". Derived from the start
 * year unless the stored name already is a "YYYY-YYYY" range (so new sessions named
 * as a range and legacy ones named "2021 Batch" both render consistently).
 */
export function sessionRange(session: { name?: string | null; year?: number | null }): string {
  const name = (session.name ?? '').trim();
  if (/^\d{4}\s*-\s*\d{4}$/.test(name)) return name.replace(/\s*-\s*/, '-');
  if (typeof session.year === 'number') return `${session.year}-${session.year + 1}`;
  // Legacy name with neither a parseable range nor a year — show it as stored.
  return name || '—';
}

/** Full session label, e.g. "Session 2021-2022". */
export function sessionLabel(session: { name?: string | null; year?: number | null }): string {
  return `Session ${sessionRange(session)}`;
}
