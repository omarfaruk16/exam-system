import { zodResolver } from '@hookform/resolvers/zod';
import { GraduationCap, Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { loginSchema, type LoginInput } from '@exam/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useLogin, useTwoFactorLogin } from '@/lib/session';

const INSTITUTION = import.meta.env.VITE_INSTITUTION_NAME ?? 'University of Rajshahi';

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const [partialToken, setPartialToken] = useState<string | null>(null);
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
      <LoginShell>
        <TwoFactorStep
          partialToken={partialToken}
          onDone={() => navigate('/', { replace: true })}
          onBack={() => setPartialToken(null)}
        />
      </LoginShell>
    );
  }

  return (
    <LoginShell>
      <h2 className="text-2xl font-medium">Sign in</h2>
      <p className="text-muted-foreground mt-1.5 text-sm">
        Use your university username, email, or student ID.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
        {errors.root && (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2.5 text-sm"
          >
            {errors.root.message}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="identifier">Username / Email / Student ID</Label>
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

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
          {errors.password && <p className="text-destructive text-sm">{errors.password.message}</p>}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          Sign in
        </Button>
      </form>

      {import.meta.env.DEV && (
        <div className="border-border bg-muted/40 text-muted-foreground mt-8 rounded-md border p-3 text-xs">
          <p className="text-foreground font-medium">Demo accounts</p>
          <p className="mt-1">
            admin / cse.head / teacher1 — <code>Admin@12345</code>
          </p>
          <p>
            student 2021001 — <code>Student@123</code>
          </p>
        </div>
      )}
    </LoginShell>
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
      <div className="bg-primary/10 text-primary mb-4 flex size-11 items-center justify-center rounded-full">
        <ShieldCheck className="size-6" />
      </div>
      <h2 className="text-2xl font-medium">Two-factor authentication</h2>
      <p className="text-muted-foreground mt-1.5 text-sm">
        Enter the 6-digit code from your authenticator app.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
        {error && (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2.5 text-sm"
          >
            {error}
          </div>
        )}
        <div className="space-y-2">
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

function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between bg-[#1E3A5F] p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
            <GraduationCap className="size-6" />
          </div>
          <span className="text-lg font-medium">{INSTITUTION}</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-medium leading-tight">Examination System</h1>
          <p className="mt-4 text-white/80">
            A secure platform for creating, taking, and grading university examinations — built for
            integrity, reliability, and trust.
          </p>
        </div>
        <p className="text-sm text-white/60">
          © {new Date().getFullYear()} {INSTITUTION}
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="bg-primary text-primary-foreground flex h-9 w-9 items-center justify-center rounded-md">
              <GraduationCap className="size-5" />
            </div>
            <span className="font-medium">{INSTITUTION}</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
