import { Loader2, Mail } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="bg-primary/10 text-primary mx-auto mb-3 flex size-11 items-center justify-center rounded-full">
            <Mail className="size-5" />
          </div>
          <CardTitle className="text-center">Forgot password?</CardTitle>
          <CardDescription className="text-center">
            Enter your email address and we'll send you a link to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm">
                If an account with that email exists, you'll receive a reset link shortly. Check
                your inbox (and spam folder).
              </p>
              <a href="/login" className="text-primary text-sm font-medium hover:underline">
                Back to login
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {error && (
                <div
                  role="alert"
                  className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2.5 text-sm"
                >
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting || !email.trim()}>
                {submitting && <Loader2 className="animate-spin" />}
                Send reset link
              </Button>
              <div className="text-center">
                <a href="/login" className="text-muted-foreground text-sm hover:underline">
                  Back to login
                </a>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
