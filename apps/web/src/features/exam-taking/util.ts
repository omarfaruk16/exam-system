export interface AnswerValue {
  selectedOptionId: string | null;
  writtenText: string | null;
}
export type AnswerState = Record<string, AnswerValue>;

export function isAnswered(a: AnswerValue | undefined): boolean {
  if (!a) return false;
  return Boolean(a.selectedOptionId) || Boolean(a.writtenText && a.writtenText.trim().length > 0);
}

/** ms -> "MM:SS" (or "H:MM:SS" past an hour). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
