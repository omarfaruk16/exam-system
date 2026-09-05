import { zodResolver } from '@hookform/resolvers/zod';
import {
  BarChart3,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  Loader2,
  Settings,
  ShieldCheck,
  Users,
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
  iconBox: string;
  chip: string;
  card: string; // tint + hover border for the option card
  chevron: string;
}

const PORTALS: Portal[] = [
  {
    key: 'student',
    title: 'Student Portal',
    tag: 'Student Access',
    icon: GraduationCap,
    desc: 'Attend scheduled online tests, submit answers in real time, review performance insights, and download grade sheets.',
    iconBox: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    card: 'border-blue-100 hover:border-blue-300 hover:bg-blue-50/60 dark:border-blue-500/20 dark:hover:border-blue-500/40 dark:hover:bg-blue-500/5',
    chevron: 'text-blue-600 dark:text-blue-400',
  },
  {
    key: 'teacher',
    title: 'Teacher Portal',
    tag: 'Faculty & Examiner',
    icon: Users,
    desc: 'Create exam questions, authorize candidate sessions, evaluate results, and manage course-wise updates.',
    iconBox: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    card: 'border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50/60 dark:border-emerald-500/20 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/5',
    chevron: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    key: 'admin',
    title: 'Admin Portal',
    tag: 'System Access',
    icon: Settings,
    desc: 'Oversee academic examinations, manage degree programs, users, permissions, and ensure system integrity.',
    iconBox: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
    chip: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    card: 'border-violet-100 hover:border-violet-300 hover:bg-violet-50/60 dark:border-violet-500/20 dark:hover:border-violet-500/40 dark:hover:bg-violet-500/5',
    chevron: 'text-violet-600 dark:text-violet-400',
  },
];

const HIGHLIGHTS: { icon: LucideIcon; label: string }[] = [
  { icon: FileText, label: 'Real-time, auto-graded online examinations' },
  { icon: BarChart3, label: 'Question banks, marking & published results' },
  { icon: ShieldCheck, label: 'Secure, protected & reliable platform' },
];

export function LoginPage() {
  const [portal, setPortal] = useState<PortalKey | null>(null);
  const active = PORTALS.find((p) => p.key === portal) ?? null;

  return (
    <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50/60 text-slate-800 dark:from-[#0b1120] dark:via-[#0d1526] dark:to-[#111a30] dark:text-slate-100">
      {/* Soft background tints */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-32 -top-32 size-[28rem] rounded-full bg-blue-200/30 blur-3xl dark:bg-blue-500/10" />
        <div className="absolute -bottom-40 -left-24 size-[28rem] rounded-full bg-violet-200/25 blur-3xl dark:bg-violet-500/10" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12 md:py-7">
        <div className="flex items-center gap-3">
          <img
            src="/ru-logo.png"
            alt=""
            className="size-11 rounded-full border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
          <div className="leading-tight">
            <p className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
              {INSTITUTION}
            </p>
            <p className="text-muted-foreground text-xs">Examination System</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://www.ru.ac.bd"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-500 sm:inline-flex dark:text-blue-400"
          >
            Visit RU Website <ExternalLink className="size-3.5" />
          </a>
          <ThemeToggle />
        </div>
      </header>

      {/* Body */}
      <div className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 items-center gap-10 px-6 pb-16 md:px-12 lg:grid-cols-2 lg:gap-16">
        {/* ── Left: brand / marketing ── */}
        <section className="relative">
          {/* Gate watermark */}
          <img
            src="/ru-gate.png"
            alt=""
            aria-hidden
            className="pointer-events-none absolute -bottom-24 left-1/2 w-[38rem] max-w-none -translate-x-1/2 select-none opacity-[0.06] lg:left-0 lg:translate-x-0 dark:opacity-[0.08] dark:invert"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />

          <div className="relative">
            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
              <span className="h-px w-8 bg-blue-500/50" />
              Online Academic Assessment Portal
            </div>

            <h1 className="mt-5 text-5xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl dark:text-white">
              The Paperless
              <br />
              <span className="text-blue-600 dark:text-blue-400">
                Exam System<span className="text-slate-300 dark:text-slate-600">.</span>
              </span>
            </h1>

            <p className="text-muted-foreground mt-6 max-w-lg text-base leading-relaxed">
              A unified platform for {INSTITUTION} students, faculty, and departments to conduct
              examinations, manage question banks, and publish results — entirely paperless.
            </p>

            <ul className="mt-9 space-y-4">
              {HIGHLIGHTS.map((h) => (
                <li
                  key={h.label}
                  className="flex items-center gap-3.5 text-slate-700 dark:text-slate-200"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                    <h.icon className="size-5" />
                  </span>
                  <span className="text-[15px] font-medium">{h.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Right: portal chooser card ── */}
        <section className="relative">
          <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-xl shadow-slate-200/50 backdrop-blur-sm sm:p-8 dark:border-white/10 dark:bg-white/[0.03] dark:shadow-black/30">
            <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              Welcome back
            </div>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Choose your login portal
            </h2>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Select the portal that matches your role to sign in.
            </p>

            <div className="mt-6 space-y-3.5">
              {PORTALS.map((p) => (
                <PortalRow key={p.key} portal={p} onLogin={() => setPortal(p.key)} />
              ))}
            </div>
          </div>
        </section>
      </div>

      <footer className="text-muted-foreground relative z-10 px-6 pb-6 text-xs md:px-12">
        © {new Date().getFullYear()} {INSTITUTION}. All rights reserved.
      </footer>

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
        'group flex w-full items-center gap-4 rounded-2xl border bg-white/60 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-5 dark:bg-white/[0.02]',
        portal.card,
      )}
    >
      <div
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-xl',
          portal.iconBox,
        )}
      >
        <Icon className="size-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-slate-900 dark:text-white">{portal.title}</h3>
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', portal.chip)}>
            {portal.tag}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{portal.desc}</p>
      </div>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 transition-transform group-hover:translate-x-0.5 dark:bg-white/5">
        <ChevronRight className={cn('size-4', portal.chevron)} />
      </span>
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
