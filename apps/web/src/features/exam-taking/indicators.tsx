import { AlertTriangle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCountdown } from './util';

export type SaveState = 'saved' | 'saving' | 'error' | 'paused';

/** Persistent autosave status so students always know their answers are safe. */
export function AutosaveIndicator({ state, fixed = true }: { state: SaveState; fixed?: boolean }) {
  const config = {
    saved: {
      icon: <CheckCircle2 className="text-success size-4" />,
      text: 'Saved',
      cls: 'text-success',
    },
    saving: {
      icon: <Loader2 className="size-4 animate-spin" />,
      text: 'Saving…',
      cls: 'text-muted-foreground',
    },
    error: {
      icon: <AlertTriangle className="text-destructive size-4" />,
      text: 'Save failed — retrying',
      cls: 'text-destructive',
    },
    paused: {
      icon: <AlertTriangle className="text-warning size-4" />,
      text: 'Saving paused — too many requests',
      cls: 'text-warning',
    },
  }[state];
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'bg-card flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-sm shadow-sm',
        fixed && 'fixed bottom-4 right-4 z-30',
        config.cls,
      )}
    >
      {config.icon}
      <span className="font-medium">{config.text}</span>
    </div>
  );
}

/** Server-synced countdown: amber under 5 min, red (pulsing) under 1 min. */
export function Countdown({ remainingMs }: { remainingMs: number }) {
  const minutes = remainingMs / 60_000;
  const danger = minutes < 1;
  const warn = !danger && minutes < 5;
  return (
    <div
      role="timer"
      aria-label="Time remaining"
      className={cn(
        'flex items-center gap-1.5 tabular-nums',
        danger ? 'text-destructive' : warn ? 'text-warning' : 'text-foreground',
      )}
    >
      <Clock className="size-4 shrink-0" />
      <span
        className={cn('font-mono text-2xl font-semibold tracking-tight', danger && 'animate-pulse')}
      >
        {formatCountdown(remainingMs)}
      </span>
    </div>
  );
}
