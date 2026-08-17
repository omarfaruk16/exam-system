import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ExamDetail, ExamSettings } from '@exam/types';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SettingToggle } from '../authoring/SettingToggle';
import { updateExam } from '../authoring/authoringApi';

const p = (n: number) => String(n).padStart(2, '0');
function isoToDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function isoToTime(iso: string) {
  const d = new Date(iso);
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ExamMetadataEdit({ exam, onDone }: { exam: ExamDetail; onDone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(exam.title);
  const [instructions, setInstructions] = useState(exam.instructions ?? '');
  const [examDate, setExamDate] = useState(isoToDate(exam.startAt));
  const [startTime, setStartTime] = useState(isoToTime(exam.startAt));
  const [duration, setDuration] = useState(String(exam.durationMinutes));
  const [settings, setSettings] = useState<ExamSettings>(exam.settings);
  const [error, setError] = useState<string | null>(null);

  const setFlag = (key: keyof ExamSettings, value: boolean) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      if (!(Number(duration) > 0)) throw new Error('Duration must be positive');
      // End time is derived from start + duration.
      const startAt = new Date(`${examDate}T${startTime}`);
      const endAt = new Date(startAt.getTime() + Number(duration) * 60_000);
      return updateExam(exam.publicId, {
        title: title.trim(),
        instructions: instructions.trim() || undefined,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        durationMinutes: Number(duration),
        settings,
      });
    },
    onSuccess: async () => {
      toast.success('Exam updated');
      await qc.invalidateQueries({ queryKey: ['authoring-exam', exam.publicId] });
      onDone();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not save'),
  });

  return (
    <Card className="p-6">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          save.mutate();
        }}
      >
        <h2 className="text-sm font-semibold">Edit exam details</h2>
        <div>
          <Label htmlFor="re-title" className="text-xs">
            Title
          </Label>
          <Input
            id="re-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="re-instr" className="text-xs">
            Instructions
          </Label>
          <Textarea
            id="re-instr"
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="re-date" className="text-xs">
            Exam date
          </Label>
          <Input
            id="re-date"
            type="date"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            className="mt-1 h-10"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="re-start" className="text-xs">
              Start time
            </Label>
            <Input
              id="re-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1 h-10"
            />
          </div>
          <div>
            <Label htmlFor="re-dur" className="text-xs">
              Duration (minutes)
            </Label>
            <Input
              id="re-dur"
              type="number"
              min={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="mt-1 h-10"
            />
          </div>
        </div>
        <p className="text-muted-foreground -mt-1 text-xs">
          The exam ends automatically {Number(duration) || 0} minutes after it starts.
        </p>

        <div className="border-t pt-3">
          <SettingToggle
            label="Shuffle questions"
            checked={settings.shuffleQuestions}
            onChange={(v) => setFlag('shuffleQuestions', v)}
          />
          <SettingToggle
            label="Shuffle options"
            checked={settings.shuffleOptions}
            onChange={(v) => setFlag('shuffleOptions', v)}
          />
          <SettingToggle
            label="Show marks after submit"
            checked={settings.showMarksAfterSubmit}
            onChange={(v) => setFlag('showMarksAfterSubmit', v)}
          />
          <SettingToggle
            label="Show explanations after submit"
            checked={settings.showExplanation}
            onChange={(v) => setFlag('showExplanation', v)}
          />
          <SettingToggle
            label="Negative marking"
            checked={settings.negativeMarking}
            onChange={(v) => setFlag('negativeMarking', v)}
          />
        </div>

        {error && <p className="text-destructive text-xs">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        </div>
      </form>
    </Card>
  );
}
