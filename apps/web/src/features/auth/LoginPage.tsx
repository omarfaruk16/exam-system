import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { loginSchema, type LoginInput } from '@exam/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/theme';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useLogin, useTwoFactorLogin } from '@/lib/session';

const INSTITUTION = import.meta.env.VITE_INSTITUTION_NAME ?? 'University of Rajshahi';

type PortalKey = 'student' | 'teacher' | 'admin';

interface Portal {
  key: PortalKey;
  title: string;
  tag: string;
  icon: ComponentType<{ className?: string }>;
  desc: string;
  features: string[];
  // Tailwind accent classes per portal.
  ring: string; // hover border
  chip: string; // small tag pill
  iconBox: string;
  button: string;
  check: string;
}

const PORTALS: Portal[] = [
  {
    key: 'student',
    title: 'Student Portal',
    tag: 'Student Access',
    icon: GraduationCap,
    desc: 'Attend scheduled online tests, submit answers in real time, review performance insights, and download grade sheets.',
    features: [
      'Take live & scheduled exams',
      'View instant question results',
      'Track academic performance',
    ],
    ring: 'hover:border-blue-500/50',
    chip: 'bg-blue-500/10 text-blue-500',
    iconBox: 'bg-blue-500/10 text-blue-500',
    button: 'bg-blue-600 text-white hover:bg-blue-500',
    check: 'text-blue-500',
  },
  {
    key: 'teacher',
    title: 'Teacher Portal',
    tag: 'Faculty & Examiners',
    icon: ScrollText,
    desc: 'Create exam questions, supervise candidate sessions, evaluate marks, and finalize course grade reports.',
    features: [
      'Prepare & curate exam papers',
      'Evaluate candidate submissions',
      'Finalize & submit marks sheets',
    ],
    ring: 'hover:border-emerald-500/50',
    chip: 'bg-emerald-500/10 text-emerald-500',
    iconBox: 'bg-emerald-500/10 text-emerald-500',
    button: 'bg-emerald-600 text-white hover:bg-emerald-500',
    check: 'text-emerald-500',
  },
  {
    key: 'admin',
    title: 'Admin Portal',
    tag: 'System Admin',
    icon: ShieldCheck,
    desc: 'Oversee academic departments, manage degree programs, batch sessions, user roles, and system security.',
    features: [
      'Academic unit & degree control',
      'Bulk enrollments & faculty assignments',
      'Full system role & user management',
    ],
    ring: 'hover:border-violet-500/50',
    chip: 'bg-violet-500/10 text-violet-500',
    iconBox: 'bg-violet-500/10 text-violet-500',
    button: 'bg-violet-600 text-white hover:bg-violet-500',
    check: 'text-violet-500',
  },
];

export function LoginPage() {
  const [portal, setPortal] = useState<PortalKey | null>(null);
  const active = PORTALS.find((p) => p.key === portal) ?? null;

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-slate-950 text-slate-100">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 size-[38rem] rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute -right-40 top-20 size-[34rem] rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 size-[30rem] rounded-full bg-emerald-500/10 blur-[120px]" />
      </div>
      {/* Dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(rgba(148,163,184,0.25) 1px, transparent 1.4px)',
          backgroundSize: '26px 26px',
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5">
        {/* Top bar */}
        <header className="flex items-center justify-between py-5">
          <div className="flex items-center gap-3">
            <img
              src="/ru-logo.png"
              alt=""
              className="size-9 rounded-lg bg-white/95 p-1"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">The Paperless Exam System</p>
              <p className="text-[11px] uppercase tracking-wider text-slate-400">{INSTITUTION}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:block">
              <ThemeToggle />
            </span>
            {PORTALS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPortal(p.key)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  p.key === 'student' && 'bg-blue-600 text-white hover:bg-blue-500',
                  p.key === 'teacher' && 'bg-emerald-600 text-white hover:bg-emerald-500',
                  p.key === 'admin' && 'border border-white/15 text-slate-200 hover:bg-white/10',
                )}
              >
                {p.title.split(' ')[0]} Login
              </button>
            ))}
          </div>
        </header>

        {/* Hero */}
        <section className="flex flex-col items-center pt-14 text-center sm:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm font-medium text-blue-300">
            <Sparkles className="size-3.5" /> Official Academic Assessment Portal
          </span>
          <h1 className="mt-8 max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            The Paperless
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent">
              Exam System.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            A unified platform for {INSTITUTION} students, faculty, and departments to conduct
            examinations, manage question banks, and publish results — entirely paperless.
          </p>
        </section>

        {/* Portals */}
        <p className="mb-6 mt-16 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Choose your login portal
        </p>
        <section className="grid gap-5 pb-16 md:grid-cols-3">
          {PORTALS.map((p) => (
            <PortalCard key={p.key} portal={p} onLogin={() => setPortal(p.key)} />
          ))}
        </section>

        <footer className="mt-auto pb-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} {INSTITUTION} · The Paperless Exam System
        </footer>
      </div>

      {/* Login modal */}
      <Dialog open={Boolean(active)} onOpenChange={(o) => !o && setPortal(null)}>
        <DialogContent className="sm:max-w-[420px]">
          {active && <LoginPanel portal={active} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PortalCard({ portal, onLogin }: { portal: Portal; onLogin: () => void }) {
  const Icon = portal.icon;
  return (
    <div
      className={cn(
        'flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur transition-all duration-200 hover:-translate-y-1 hover:bg-white/[0.06]',
        portal.ring,
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn('flex size-11 items-center justify-center rounded-xl', portal.iconBox)}>
          <Icon className="size-5" />
        </div>
        <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', portal.chip)}>
          {portal.tag}
        </span>
      </div>
      <h3 className="mt-4 text-lg font-semibold">{portal.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{portal.desc}</p>
      <ul className="mt-4 space-y-2">
        {portal.features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-slate-300">
            <CheckCircle2 className={cn('size-4 shrink-0', portal.check)} /> {f}
          </li>
        ))}
      </ul>
      <button
        onClick={onLogin}
        className={cn(
          'mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors',
          portal.button,
        )}
      >
        {portal.title.split(' ')[0]} Login <ArrowRight className="size-4" />
      </button>
    </div>
  );
}

/** The login form (+ 2FA step) inside the modal, tinted for the chosen portal. */
function LoginPanel({ portal }: { portal: Portal }) {
  const login = useLogin();
  const navigate = useNavigate();
  const Icon = portal.icon;
  const [partialToken, setPartialToken] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await login.mutateAsync(values);
      if (res.status === 'two_factor_required') {
        setPartialToken(res.partialToken);
        return;
      }
      navigate('/', { replace: true });
    } catch (e) {
      setError('root', {
        message: e instanceof ApiError ? e.message : 'Something went wrong. Please try again.',
      });
    }
  });

  if (partialToken) {
    return (
      <TwoFactorStep
        partialToken={partialToken}
        onDone={() => navigate('/', { replace: true })}
        onBack={() => setPartialToken(null)}
      />
    );
  }

  return (
    <>
      <DialogHeader>
        <div className="flex flex-col items-center text-center">
          <div
            className={cn('flex size-12 items-center justify-center rounded-xl', portal.iconBox)}
          >
            <Icon className="size-6" />
          </div>
          <DialogTitle className="mt-3 text-xl">{portal.title}</DialogTitle>
          <p className="text-muted-foreground mt-1 text-sm">Sign in to continue</p>
        </div>
      </DialogHeader>

      <form onSubmit={onSubmit} className="mt-2 space-y-4" noValidate>
        {errors.root && (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2.5 text-sm"
          >
            {errors.root.message}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="identifier">Email / Username / Student ID</Label>
          <Input
            id="identifier"
            autoComplete="username"
            autoFocus
            aria-invalid={!!errors.identifier}
            {...register('identifier')}
          />
          {errors.identifier && (
            <p className="text-destructive text-sm">{errors.identifier.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              className="pr-10"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password && <p className="text-destructive text-sm">{errors.password.message}</p>}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          Login
        </Button>

        <div className="text-center">
          <a href="/forgot-password" className="text-muted-foreground text-sm hover:underline">
            Forgot password?
          </a>
        </div>
      </form>
    </>
  );
}

function TwoFactorStep({
  partialToken,
  onDone,
  onBack,
}: {
  partialToken: string;
  onDone: () => void;
  onBack: () => void;
}) {
  const twoFactor = useTwoFactorLogin();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await twoFactor.mutateAsync({ partialToken, code });
      if (res.status === 'ok') onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setCode('');
    }
  };

  return (
    <>
      <DialogHeader>
        <div className="flex flex-col items-center text-center">
          <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
            <ShieldCheck className="size-6" />
          </div>
          <DialogTitle className="mt-3 text-xl">Two-factor authentication</DialogTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Enter the 6-digit code from your authenticator app.
          </p>
        </div>
      </DialogHeader>

      <form onSubmit={submit} className="mt-2 space-y-4" noValidate>
        {error && (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2.5 text-sm"
          >
            {error}
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="totp-code">Authentication code</Label>
          <Input
            id="totp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            placeholder="000000"
            className="text-center text-lg tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={twoFactor.isPending || code.length !== 6}
        >
          {twoFactor.isPending && <Loader2 className="animate-spin" />}
          Verify
        </Button>
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground w-full text-center text-sm"
        >
          Back to sign in
        </button>
      </form>
    </>
  );
}
