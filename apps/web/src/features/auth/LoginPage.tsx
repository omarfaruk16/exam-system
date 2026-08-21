import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, GraduationCap, Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { loginSchema, type LoginInput } from '@exam/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useLogin, useTwoFactorLogin } from '@/lib/session';

const INSTITUTION = import.meta.env.VITE_INSTITUTION_NAME ?? 'University of Rajshahi';
// Admin can drop a real photo at apps/web/public/university-bg.jpg (served at /university-bg.jpg);
// until then the CSS gradient below shows. Optional build-time override via VITE_UNIVERSITY_BG_IMAGE.
const BG_IMAGE = import.meta.env.VITE_UNIVERSITY_BG_IMAGE ?? '/university-bg.jpg';

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
  const [showPassword, setShowPassword] = useState(false);

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

  return (
    <LoginShell>
      {partialToken ? (
        <TwoFactorStep
          partialToken={partialToken}
          onDone={() => navigate('/', { replace: true })}
          onBack={() => setPartialToken(null)}
        />
      ) : (
        <>
          <BrandHeader />
          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            {errors.root && (
              <div
                role="alert"
                className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2.5 text-sm"
              >
                {errors.root.message}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="identifier">Email / Student ID</Label>
              <Input
                id="identifier"
                autoComplete="email"
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
              {errors.password && (
                <p className="text-destructive text-sm">{errors.password.message}</p>
              )}
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
      )}

      <p className="text-muted-foreground mt-6 text-center text-xs">
        University Examination System
      </p>
    </LoginShell>
  );
}

/** University logo if apps/web/public/university-logo.png exists, else the institution name. */
function BrandHeader() {
  const [logoOk, setLogoOk] = useState(true);
  return (
    <div className="flex flex-col items-center text-center">
      {logoOk ? (
        <img
          src="/ru-logo.png"
          alt={INSTITUTION}
          className="h-14 w-auto object-contain"
          onError={() => setLogoOk(false)}
        />
      ) : (
        <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-xl">
          <GraduationCap className="size-7" />
        </div>
      )}
      <p className="text-primary mt-3 text-lg font-medium">{INSTITUTION}</p>
    </div>
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
      <div className="flex flex-col items-center text-center">
        <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
          <ShieldCheck className="size-6" />
        </div>
        <h1 className="mt-3 text-xl font-semibold">Two-factor authentication</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Enter the 6-digit code from your authenticator app.
        </p>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
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

/** Full-bleed campus background + CSS dot-grid overlay + centered card. Fully standalone. */
function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Campus image over a gradient fallback (shows if the image file is absent). */}
      <div
        className="absolute inset-0 bg-slate-900 bg-cover bg-center"
        style={{
          backgroundImage: `url('${BG_IMAGE}'), linear-gradient(135deg, #1E3A5F 0%, #0f172a 100%)`,
        }}
      />
      {/* Pure-CSS dot-grid overlay, subduing the image (~0.55 opacity). */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.55,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backgroundImage: 'radial-gradient(rgba(226,232,240,0.35) 1px, transparent 1.4px)',
          backgroundSize: '22px 22px',
        }}
      />

      {/* Centered card */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div
          className={cn('bg-card w-full max-w-[400px] rounded-xl border p-8 shadow-2xl sm:p-10')}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
