import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Mail } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { updateEmailSchema, type UpdateEmailInput } from '@exam/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useSession, useUpdateEmail } from '@/lib/session';

export function AccountPage() {
  const { data: user } = useSession();
  const updateEmail = useUpdateEmail();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<UpdateEmailInput>({
    resolver: zodResolver(updateEmailSchema),
    defaultValues: { newEmail: user?.email ?? '' },
  });

  // Keep form in sync if session refreshes
  useEffect(() => {
    reset({ newEmail: user?.email ?? '' });
  }, [user?.email, reset]);

  // Reset dirty state after a successful save
  useEffect(() => {
    if (isSubmitSuccessful) reset({ newEmail: user?.email ?? '' });
  }, [isSubmitSuccessful, user?.email, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await updateEmail.mutateAsync(values);
    } catch (e) {
      setError('root', {
        message: e instanceof ApiError ? e.message : 'Something went wrong. Please try again.',
      });
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Account settings</CardTitle>
          <CardDescription>Update your email address.</CardDescription>
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

            {updateEmail.isSuccess && !isDirty && (
              <div
                role="status"
                className="border-success/30 bg-success/10 text-success rounded-md border px-3 py-2.5 text-sm"
              >
                Email address updated.
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="newEmail">Email address</Label>
              <div className="relative">
                <Mail className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  id="newEmail"
                  type="email"
                  autoComplete="email"
                  className="pl-9"
                  aria-invalid={!!errors.newEmail}
                  {...register('newEmail')}
                />
              </div>
              {errors.newEmail && (
                <p className="text-destructive text-sm">{errors.newEmail.message}</p>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <Button type="submit" disabled={isSubmitting || !isDirty}>
                {isSubmitting && <Loader2 className="animate-spin" />}
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
