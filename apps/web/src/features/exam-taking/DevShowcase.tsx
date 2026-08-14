import { AutosaveIndicator, Countdown } from './indicators';

/** Dev-only visual reference for the transient exam-taking states (autosave + countdown). */
export function DevShowcase() {
  return (
    <div className="mx-auto max-w-2xl space-y-10 p-10">
      <div>
        <h1 className="text-xl font-semibold">Exam-taking UI states</h1>
        <p className="text-muted-foreground text-sm">Reference for the transient states.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Autosave indicator</h2>
        <div className="flex flex-wrap items-center gap-8">
          <div className="space-y-2 text-center">
            <AutosaveIndicator state="saved" fixed={false} />
            <p className="text-muted-foreground text-xs">clean</p>
          </div>
          <div className="space-y-2 text-center">
            <AutosaveIndicator state="saving" fixed={false} />
            <p className="text-muted-foreground text-xs">in flight</p>
          </div>
          <div className="space-y-2 text-center">
            <AutosaveIndicator state="error" fixed={false} />
            <p className="text-muted-foreground text-xs">failed → retrying</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Countdown</h2>
        <div className="flex flex-wrap items-end gap-10">
          <div className="space-y-2 text-center">
            <Countdown remainingMs={23 * 60_000 + 12_000} />
            <p className="text-muted-foreground text-xs">&gt; 5 min</p>
          </div>
          <div className="space-y-2 text-center">
            <Countdown remainingMs={4 * 60_000 + 30_000} />
            <p className="text-muted-foreground text-xs">&lt; 5 min (amber)</p>
          </div>
          <div className="space-y-2 text-center">
            <Countdown remainingMs={42_000} />
            <p className="text-muted-foreground text-xs">&lt; 1 min (red)</p>
          </div>
        </div>
      </section>
    </div>
  );
}
