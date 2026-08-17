import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCountdown } from '../exam-taking/util';

/**
 * A live "Starts in …" countdown. Neutral while far off, amber in the final
 * 5 minutes, red + pulsing in the final minute. `nowMs` is a server-synced
 * clock supplied by the parent (see useServerNow) so it ticks every second.
 */
export function StartCountdown({
  startAtMs,
  nowMs,
  className,
}: {
  startAtMs: number;
  nowMs: number;
  className?: string;
}) {
  const remaining = Math.max(0, startAtMs - nowMs);
  const minutes = remaining / 60_000;
  const danger = remaining > 0 && minutes < 1;
  const warn = !danger && minutes <= 5;
  return (
    <span
      role="timer"
      aria-label="Time until exam starts"
      className={cn(
        'inline-flex items-center gap-1.5 font-mono tabular-nums',
        danger ? 'text-destructive' : warn ? 'text-warning' : 'text-muted-foreground',
        danger && 'animate-pulse',
        className,
      )}
    >
      <Clock className="size-3.5 shrink-0" />
      Starts in {formatCountdown(remaining)}
    </span>
  );
}
