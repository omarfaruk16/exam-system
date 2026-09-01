import { format } from 'date-fns';
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
  const [open, setOpen] = React.useState(false);

  // Parse stored "YYYY-MM-DD" → Date for the calendar
  const selected = date ? new Date(`${date}T12:00:00`) : undefined;

  const [hh, mm] = time ? time.split(':') : ['', ''];

  function handleDaySelect(day: Date | undefined) {
    if (!day) return;
    onDateChange(format(day, 'yyyy-MM-dd'));
    setOpen(false);
  }

  // Displayed label
  let dateLabel = 'Pick a date';
  if (selected && !isNaN(selected.getTime())) {
    dateLabel = format(selected, 'dd MMM yyyy');
  }

  let timeLabel = 'Pick time';
  if (hh && mm) timeLabel = `${hh}:${mm}`;

  return (
    <div className="flex flex-wrap gap-3">
      {/* Date picker */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            className={cn(
              'h-10 w-44 justify-start text-left font-normal',
              !date && 'text-muted-foreground',
              dateError && 'border-destructive ring-destructive/20',
            )}
          >
            <CalendarIcon className="mr-2 size-4 shrink-0" />
            {dateLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={handleDaySelect}
            initialFocus
            fromDate={new Date()}
          />
        </PopoverContent>
      </Popover>

      {/* Time picker */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'h-10 w-36 justify-start text-left font-normal',
              !time && 'text-muted-foreground',
              timeError && 'border-destructive ring-destructive/20',
            )}
          >
            <Clock className="mr-2 size-4 shrink-0" />
            {timeLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-3" align="start">
          <p className="text-muted-foreground mb-2 text-xs font-medium">Select time</p>
          <div className="flex gap-2">
            {/* Hour scroll */}
            <div className="flex flex-col gap-0.5 overflow-y-auto" style={{ maxHeight: 200 }}>
              <p className="text-muted-foreground mb-1 text-center text-[10px]">Hour</p>
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => onTimeChange(`${h}:${mm || '00'}`)}
                  className={cn(
                    'rounded px-3 py-1 text-sm tabular-nums transition-colors',
                    hh === h ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-accent',
                  )}
                >
                  {h}
                </button>
              ))}
            </div>
            {/* Minute options */}
            <div className="flex flex-col gap-0.5">
              <p className="text-muted-foreground mb-1 text-center text-[10px]">Min</p>
              {MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onTimeChange(`${hh || '08'}:${m}`)}
                  className={cn(
                    'rounded px-3 py-1 text-sm tabular-nums transition-colors',
                    mm === m ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-accent',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          {/* Manual typed input as fallback */}
          <div className="mt-3 border-t pt-2">
            <p className="text-muted-foreground mb-1 text-[10px]">Or type (HH:MM)</p>
            <input
              type="time"
              value={time}
              onChange={(e) => onTimeChange(e.target.value)}
              className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2"
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
