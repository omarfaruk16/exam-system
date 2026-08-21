import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { passwordSchema } from '@exam/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';

const schema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
type FormValues = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [showPw, setShowPw] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api.post('/auth/reset-password', { token, newPassword: values.newPassword });
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 3000);
    } catch (e) {
      setError('root', {
        message: e instanceof ApiError ? e.message : 'Something went wrong. Please try again.',
      });
    }
  });

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid link</CardTitle>
            <CardDescription>
              This password reset link is invalid or has expired.{' '}
              <a href="/forgot-password" className="text-primary hover:underline">
                Request a new one.
              </a>
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Password updated</CardTitle>
            <CardDescription>
              Your password has been reset. Redirecting you to login…
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>Choose a strong password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            {errors.root && (
              <div
                role="alert"
                className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2.5 text-sm"
              >
                {errors.root.message}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoFocus
                  aria-invalid={!!errors.newPassword}
                  className="pr-10"
                  {...register('newPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center"
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.newPassword ? (
                <p className="text-destructive text-sm">{errors.newPassword.message}</p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  At least 10 characters, with upper, lower, and a number.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                aria-invalid={!!errors.confirmPassword}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p className="text-destructive text-sm">{errors.confirmPassword.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Reset password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
