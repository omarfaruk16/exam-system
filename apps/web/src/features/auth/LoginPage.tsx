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
    iconBox:
      'bg-blue-100 text-blue-600 dark:bg-blue-500/25 dark:text-blue-400 dark:border dark:border-blue-400/30',
    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-500/25 dark:text-blue-300 dark:border dark:border-blue-400/30',
    card: 'bg-blue-50/80 border-blue-200/80 hover:border-blue-400 hover:bg-blue-100/80 dark:bg-[#0f1d36]/90 dark:border-blue-500/30 dark:hover:border-blue-400/60 dark:hover:bg-[#142646] dark:shadow-[0_0_20px_rgba(59,130,246,0.1)]',
    chevron: 'text-blue-600 dark:text-blue-400',
  },
  {
    key: 'teacher',
    title: 'Teacher Portal',
    tag: 'Faculty & Examiner',
    icon: Users,
    desc: 'Create exam questions, authorize candidate sessions, evaluate results, and manage course-wise updates.',
    iconBox:
      'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/25 dark:text-emerald-400 dark:border dark:border-emerald-400/30',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-300 dark:border dark:border-emerald-400/30',
    card: 'bg-emerald-50/80 border-emerald-200/80 hover:border-emerald-400 hover:bg-emerald-100/80 dark:bg-[#09261b]/90 dark:border-emerald-500/30 dark:hover:border-emerald-400/60 dark:hover:bg-[#0d3324] dark:shadow-[0_0_20px_rgba(16,185,129,0.1)]',
    chevron: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    key: 'admin',
    title: 'Admin Portal',
    tag: 'System Access',
    icon: Settings,
    desc: 'Oversee academic examinations, manage degree programs, users, permissions, and ensure system integrity.',
    iconBox:
      'bg-purple-100 text-purple-600 dark:bg-purple-500/25 dark:text-purple-400 dark:border dark:border-purple-400/30',
    chip: 'bg-purple-100 text-purple-700 dark:bg-purple-500/25 dark:text-purple-300 dark:border dark:border-purple-400/30',
    card: 'bg-purple-50/80 border-purple-200/80 hover:border-purple-400 hover:bg-purple-100/80 dark:bg-[#1f1535]/90 dark:border-purple-500/30 dark:hover:border-purple-400/60 dark:hover:bg-[#281b45] dark:shadow-[0_0_20px_rgba(168,85,247,0.1)]',
    chevron: 'text-purple-600 dark:text-purple-400',
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
    <div className="relative flex min-h-screen flex-col justify-between overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50/60 text-slate-800 lg:h-screen lg:max-h-screen dark:from-[#080d1a] dark:via-[#0c1322] dark:to-[#0f172a] dark:text-slate-100">
      {/* Background ambient lighting effects */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 size-[36rem] rounded-full bg-blue-500/10 blur-[130px]" />
        <div className="absolute -left-40 top-1/2 size-[36rem] -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[130px]" />
        <div className="absolute -bottom-40 right-1/4 size-[32rem] rounded-full bg-purple-500/10 blur-[130px]" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 mx-auto flex w-full max-w-[1536px] items-center justify-between px-6 py-3.5 md:px-12 md:py-4 lg:px-16">
        <div className="flex items-center gap-3.5">
          <img
            src="/ru-logo.png"
            alt="University of Rajshahi Logo"
            className="shadow-xs size-10 rounded-full border border-slate-200/80 bg-white p-1 dark:border-white/15 dark:bg-slate-900"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
          <div className="leading-tight">
            <p className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
              {INSTITUTION}
            </p>
            <p className="text-muted-foreground text-xs font-medium">Examination System</p>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden items-center gap-2.5 sm:flex">
            <Button
              size="sm"
              onClick={() => setPortal('student')}
              className="h-8.5 rounded-xl border-transparent bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-700 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500"
            >
              <GraduationCap className="size-4" /> Student Login
            </Button>
            <Button
              size="sm"
              onClick={() => setPortal('teacher')}
              className="h-8.5 rounded-xl border-transparent bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-md shadow-emerald-500/20 transition-all hover:bg-emerald-700 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-500"
            >
              <Users className="size-4" /> Teacher Login
            </Button>
            <Button
              size="sm"
              onClick={() => setPortal('admin')}
              className="h-8.5 rounded-xl border-transparent bg-purple-600 px-3.5 text-xs font-semibold text-white shadow-md shadow-purple-500/20 transition-all hover:bg-purple-700 dark:bg-purple-600 dark:text-white dark:hover:bg-purple-500"
            >
              <Settings className="size-4" /> Admin Login
            </Button>
          </div>
          <a
            href="https://www.ru.ac.bd"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1.5 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-500 xl:inline-flex dark:text-blue-400 dark:hover:text-blue-300"
          >
            Visit RU Website <ExternalLink className="size-3.5" />
          </a>
          <ThemeToggle />
        </div>
      </header>

      {/* Body Section configured to fit Viewport Height */}
      <div className="relative z-10 mx-auto grid w-full max-w-[1536px] flex-1 items-center gap-8 px-6 py-2 md:px-12 lg:grid-cols-12 lg:gap-12 lg:px-16 lg:py-3">
        {/* ── Left: Brand / Marketing ── */}
        <section className="relative lg:col-span-6 xl:col-span-7">
          <div className="relative">
            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
              <span className="h-[2px] w-8 rounded-full bg-blue-500/60 dark:bg-blue-400/60" />
              Online Academic Assessment Portal
            </div>

            <h1 className="mt-3 text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl lg:text-5xl xl:text-6xl dark:text-white">
              The Paperless
              <br />
              <span className="text-blue-600 dark:text-blue-400">
                Exam System<span className="text-slate-300 dark:text-slate-600">.</span>
              </span>
            </h1>

            <p className="text-muted-foreground mt-3 max-w-xl text-sm leading-relaxed sm:text-base">
              A unified platform for {INSTITUTION} students, faculty, and departments to conduct
              examinations, manage question banks, and publish results — entirely paperless.
            </p>

            <ul className="mt-5 max-w-xl space-y-2.5">
              {HIGHLIGHTS.map((h) => (
                <li
                  key={h.label}
                  className="flex items-center gap-3.5 text-slate-700 dark:text-slate-200"
                >
                  <span className="shadow-xs flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-100/90 text-blue-600 dark:border dark:border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-400">
                    <h.icon className="size-4.5" />
                  </span>
                  <span className="text-sm font-medium sm:text-base">{h.label}</span>
                </li>
              ))}
            </ul>

            {/* RU Gate landmark illustration placed prominently at the bottom-left area */}
            <div className="relative mt-5 max-w-xl overflow-hidden">
              <img
                src="/ru-gate.png"
                alt="University of Rajshahi Gate"
                className="pointer-events-none max-h-[160px] w-full max-w-[380px] select-none object-contain opacity-95 transition-all duration-300 xl:max-h-[190px] xl:max-w-[440px] dark:opacity-85 dark:brightness-110 dark:contrast-125 dark:grayscale dark:invert"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            </div>
          </div>
        </section>

        {/* ── Right: Portal Chooser Card ── */}
        <section className="relative lg:col-span-6 xl:col-span-5">
          <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-2xl backdrop-blur-xl sm:p-7 dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-blue-950/20">
            <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              Welcome back
            </div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              Choose your login portal
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Select the portal that matches your role to sign in.
            </p>

            <div className="mt-5 space-y-3">
              {PORTALS.map((p) => (
                <PortalRow key={p.key} portal={p} onLogin={() => setPortal(p.key)} />
              ))}
            </div>
          </div>
        </section>
      </div>

      <footer className="text-muted-foreground relative z-10 mx-auto w-full max-w-[1536px] px-6 py-2.5 text-xs md:px-12 lg:px-16">
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
        'gap-4.5 p-4.5 group flex w-full items-center rounded-2xl border text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg sm:p-5',
        portal.card,
      )}
    >
      <div
        className={cn(
          'shadow-xs flex size-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105',
          portal.iconBox,
        )}
      >
        <Icon className="size-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{portal.title}</h3>
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide',
              portal.chip,
            )}
          >
            {portal.tag}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed sm:text-sm">
          {portal.desc}
        </p>
      </div>
      <span className="shadow-xs flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200/60 bg-white/80 transition-transform duration-200 group-hover:translate-x-1 dark:border-slate-700/60 dark:bg-slate-800/80">
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
