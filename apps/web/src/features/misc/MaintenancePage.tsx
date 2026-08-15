import { Wrench } from 'lucide-react';

const INSTITUTION = import.meta.env.VITE_INSTITUTION_NAME ?? 'University of Rajshahi';

/** Shown full-screen when the API is in maintenance mode (503). No login form is offered. */
export function MaintenancePage({ estimatedResume }: { estimatedResume?: string | null }) {
  const resumeText =
    estimatedResume &&
    new Date(estimatedResume).toLocaleString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="bg-primary/10 text-primary mb-6 flex size-16 items-center justify-center rounded-full">
        <Wrench className="size-8" />
      </div>
      <p className="text-muted-foreground text-sm font-medium">{INSTITUTION}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">System under maintenance</h1>
      <p className="text-muted-foreground mt-3 max-w-md text-sm">
        The examination system is temporarily unavailable while we perform scheduled maintenance.
        Please check back shortly.
      </p>
      {resumeText && (
        <p className="mt-4 rounded-full border px-4 py-1.5 text-sm">
          Estimated to resume by <span className="font-medium">{resumeText}</span>
        </p>
      )}
    </div>
  );
}
