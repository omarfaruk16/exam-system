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

/**
 * Full session label. Year-range names get the "Session " prefix ("Session 2021-2022");
 * custom free-text names are shown as-is so that "1st Year Batch" doesn't become
 * "Session 1st Year Batch".
 */
export function sessionLabel(session: { name?: string | null; year?: number | null }): string {
  const name = (session.name ?? '').trim();
  // Named as a year range → prepend "Session"
  if (/^\d{4}\s*-\s*\d{4}$/.test(name)) return `Session ${name.replace(/\s*-\s*/, '-')}`;
  // Custom free-text name → show as-is
  if (name) return name;
  // Fallback to year-derived range
  if (typeof session.year === 'number') return `Session ${session.year}-${session.year + 1}`;
  return '—';
}

/**
 * Canonical ordering for student IDs used across every student list: primary sort on the
 * first two digits (the session year, descending — newest first), then the last three
 * digits (the roll, ascending). e.g. "23107001" sorts before "22107001".
 * Non-digit or short IDs fall back to a plain string compare so nothing throws.
 */
export function compareStudentId(a: string, b: string): number {
  const head = (s: string) => parseInt(s.slice(0, 2), 10);
  const tail = (s: string) => parseInt(s.slice(-3), 10);
  const ha = head(a);
  const hb = head(b);
  if (Number.isFinite(ha) && Number.isFinite(hb) && ha !== hb) return hb - ha;
  const ta = tail(a);
  const tb = tail(b);
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
  return a.localeCompare(b, undefined, { numeric: true });
}

/** Sort any list of student-bearing rows by {@link compareStudentId}. Returns a new array. */
export function sortByStudentId<T>(rows: readonly T[], getId: (row: T) => string): T[] {
  return [...rows].sort((x, y) => compareStudentId(getId(x), getId(y)));
}
