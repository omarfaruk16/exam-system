import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  FileCheck2,
  GraduationCap,
  Loader2,
  Lock,
  ScrollText,
  ShieldCheck,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
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
  icon: LucideIcon;
  desc: string;
  features: string[];
  iconBox: string;
  chip: string;
  accent: string; // left border on hover
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
    iconBox: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    chip: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    accent: 'hover:border-blue-500/60',
    button: 'bg-blue-600 text-white hover:bg-blue-500',
    check: 'text-blue-600 dark:text-blue-400',
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
    iconBox: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    accent: 'hover:border-emerald-500/60',
    button: 'bg-emerald-600 text-white hover:bg-emerald-500',
    check: 'text-emerald-600 dark:text-emerald-400',
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
    iconBox: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    chip: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    accent: 'hover:border-violet-500/60',
    button: 'bg-violet-600 text-white hover:bg-violet-500',
    check: 'text-violet-600 dark:text-violet-400',
  },
];

const HIGHLIGHTS: { icon: LucideIcon; label: string }[] = [
  { icon: Zap, label: 'Real-time, auto-graded online examinations' },
  { icon: FileCheck2, label: 'Question banks, marking & published results' },
  { icon: Lock, label: 'Secure, proctored & entirely paperless' },
];

export function LoginPage() {
  const [portal, setPortal] = useState<PortalKey | null>(null);
  const active = PORTALS.find((p) => p.key === portal) ?? null;

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col md:flex-row">
      {/* ── Left: brand panel ── */}
      <aside className="relative flex flex-col overflow-hidden bg-gradient-to-br from-[#1E3A5F] via-[#1b2a4a] to-[#0b1120] px-8 py-10 text-white md:w-[42%] md:px-12 md:py-14">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-24 -top-24 size-96 rounded-full bg-blue-500/25 blur-3xl" />
          <div className="absolute -bottom-24 right-0 size-96 rounded-full bg-violet-500/20 blur-3xl" />
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.18) 1px, transparent 1.4px)',
              backgroundSize: '24px 24px',
            }}
          />
        </div>

        <div className="relative flex items-center gap-3">
          <img
            src="/ru-logo.png"
            alt=""
            className="size-11 rounded-xl bg-white/95 p-1.5"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
          <div className="leading-tight">
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">{INSTITUTION}</p>
            <p className="text-sm font-semibold">Examination System</p>
          </div>
        </div>

        <div className="relative mt-auto pt-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-blue-200">
            Official Academic Assessment Portal
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight lg:text-5xl">
            The Paperless
            <br />
            <span className="bg-gradient-to-r from-blue-300 via-cyan-200 to-violet-300 bg-clip-text text-transparent">
              Exam System.
            </span>
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-white/70 lg:text-base">
            A unified platform for {INSTITUTION} students, faculty, and departments to conduct
            examinations, manage question banks, and publish results — entirely paperless.
          </p>

          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map((h) => (
              <li key={h.label} className="flex items-center gap-3 text-sm text-white/85">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <h.icon className="size-4" />
                </span>
                {h.label}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-auto pt-12 text-xs text-white/45">
          © {new Date().getFullYear()} {INSTITUTION}
        </p>
      </aside>

      {/* ── Right: portal chooser ── */}
      <main className="relative flex flex-1 flex-col px-6 py-10 md:px-12 md:py-14">
        <div className="absolute right-5 top-5">
          <ThemeToggle />
        </div>

        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center">
          <div className="mb-1 text-sm font-medium text-blue-600 dark:text-blue-400">
            Welcome back
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Choose your login portal</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Select the portal that matches your role to sign in.
          </p>

          <div className="mt-6 space-y-3">
            {PORTALS.map((p) => (
              <PortalRow key={p.key} portal={p} onLogin={() => setPortal(p.key)} />
            ))}
          </div>

          <p className="text-muted-foreground mt-6 text-center text-xs">
            Trouble signing in? Contact your department’s exam administrator.
          </p>
        </div>
      </main>

      <Dialog open={Boolean(active)} onOpenChange={(o) => !o && setPortal(null)}>
        <DialogContent className="sm:max-w-[420px]">
          {active && <LoginPanel portal={active} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PortalRow({ portal, onLogin }: { portal: Portal; onLogin: () => void }) {
  const Icon = portal.icon;
  return (
    <button
      type="button"
      onClick={onLogin}
      className={cn(
        'bg-card group flex w-full items-start gap-4 rounded-2xl border p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md',
        portal.accent,
      )}
    >
      <div
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-xl',
          portal.iconBox,
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{portal.title}</h3>
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', portal.chip)}>
            {portal.tag}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{portal.desc}</p>
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
          {portal.features.map((f) => (
            <li key={f} className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <CheckCircle2 className={cn('size-3.5 shrink-0', portal.check)} /> {f}
            </li>
          ))}
        </ul>
        <span
          className={cn(
            'mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold',
            portal.button,
          )}
        >
          {portal.title.split(' ')[0]} Login
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
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
