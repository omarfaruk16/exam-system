import { format, parse, isValid } from 'date-fns';
import { CalendarIcon, Clock } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface DateTimePickerProps {
  /** ISO date string "YYYY-MM-DD" */
  date: string;
  /** "HH:mm" (24-hour) */
  time: string;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  dateError?: boolean;
  timeError?: boolean;
  id?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

export function DateTimePicker({
  date,
  time,
  onDateChange,
  onTimeChange,
  dateError,
  timeError,
  id,
}: DateTimePickerProps) {
  // ── Date field ──────────────────────────────────────────────────────────────
  // Keep a display string separate so the user can type freely
  const [dateInput, setDateInput] = React.useState(date ?? '');
  const [calOpen, setCalOpen] = React.useState(false);

  // Sync prop → local when parent changes (e.g. edit mode loads defaults)
  const prevDate = React.useRef(date);
  if (date !== prevDate.current) {
    prevDate.current = date;
    setDateInput(date ?? '');
  }

  // Parse what the user typed (accepts DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD)
  function commitDateInput(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      onDateChange('');
      return;
    }
    // Try common formats
    const fmts = ['dd/MM/yyyy', 'dd-MM-yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy'];
    for (const fmt of fmts) {
      try {
        const d = parse(trimmed, fmt, new Date());
        if (isValid(d)) {
          const iso = format(d, 'yyyy-MM-dd');
          setDateInput(format(d, 'dd/MM/yyyy')); // normalise display
          onDateChange(iso);
          return;
        }
      } catch {
        /* try next */
      }
    }
    // leave as-is so user can keep editing; don't push invalid value
  }

  function handleCalSelect(day: Date | undefined) {
    if (!day) return;
    const iso = format(day, 'yyyy-MM-dd');
    setDateInput(format(day, 'dd/MM/yyyy'));
    onDateChange(iso);
    setCalOpen(false);
  }

  const calSelected = date
    ? (() => {
        const d = new Date(`${date}T12:00:00`);
        return isValid(d) ? d : undefined;
      })()
    : undefined;

  // ── Time field ──────────────────────────────────────────────────────────────
  const [timeOpen, setTimeOpen] = React.useState(false);
  const [hh, mm] = time ? time.split(':') : ['', ''];

  return (
    <div className="flex flex-wrap gap-4">
      {/* ── Date ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Date (DD/MM/YYYY)</span>
        <div className="flex items-center gap-1">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            placeholder="DD/MM/YYYY"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            onBlur={(e) => commitDateInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDateInput(dateInput);
            }}
            className={cn(
              'border-input bg-background focus-visible:ring-ring h-10 w-36 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2',
              dateError && 'border-destructive focus-visible:ring-destructive/30',
            )}
          />
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn('h-10 w-10 shrink-0', dateError && 'border-destructive')}
                title="Open calendar"
              >
                <CalendarIcon className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={calSelected}
                onSelect={handleCalSelect}
                initialFocus
                fromDate={new Date()}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* ── Time ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Start time (HH:MM)</span>
        <div className="flex items-center gap-1">
          <input
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            className={cn(
              'border-input bg-background focus-visible:ring-ring h-10 w-32 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2',
              timeError && 'border-destructive focus-visible:ring-destructive/30',
            )}
          />
          <Popover open={timeOpen} onOpenChange={setTimeOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn('h-10 w-10 shrink-0', timeError && 'border-destructive')}
                title="Pick time"
              >
                <Clock className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-3" align="start">
              <p className="text-muted-foreground mb-2 text-xs font-medium">Quick select</p>
              <div className="flex gap-2">
                {/* Hours */}
                <div className="flex flex-col gap-0.5 overflow-y-auto" style={{ maxHeight: 200 }}>
                  <p className="text-muted-foreground mb-1 text-center text-[10px]">Hour</p>
                  {HOURS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => {
                        onTimeChange(`${h}:${mm || '00'}`);
                      }}
                      className={cn(
                        'rounded px-3 py-1 text-sm tabular-nums transition-colors',
                        hh === h
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'hover:bg-accent',
                      )}
                    >
                      {h}
                    </button>
                  ))}
                </div>
                {/* Minutes */}
                <div className="flex flex-col gap-0.5">
                  <p className="text-muted-foreground mb-1 text-center text-[10px]">Min</p>
                  {MINUTES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        onTimeChange(`${hh || '08'}:${m}`);
                        setTimeOpen(false);
                      }}
                      className={cn(
                        'rounded px-3 py-1 text-sm tabular-nums transition-colors',
                        mm === m
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'hover:bg-accent',
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
