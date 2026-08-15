import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionUser, TwoFactorSetup } from '@exam/types';
import { Copy, Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';
import { sessionKey, useLogout } from '@/lib/session';

const INSTITUTION = import.meta.env.VITE_INSTITUTION_NAME ?? 'University of Rajshahi';

export function TwoFactorSetupPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useLogout();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const setupQuery = useQuery({
    queryKey: ['2fa-setup'],
    queryFn: () => api.post<TwoFactorSetup>('/auth/2fa/setup'),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const confirm = useMutation({
    mutationFn: () => api.post<{ status: 'ok'; user: SessionUser }>('/auth/2fa/confirm', { code }),
    onSuccess: (res) => {
      qc.setQueryData(sessionKey, res.user);
      toast.success('Two-factor authentication enabled');
      navigate('/', { replace: true });
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'Could not verify the code.');
      setCode('');
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="bg-primary/10 text-primary mb-3 flex size-12 items-center justify-center rounded-full">
            <ShieldCheck className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold">Set up two-factor authentication</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {INSTITUTION} requires staff accounts to use an authenticator app.
          </p>
        </div>

        <Card className="p-6">
          {setupQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
            </div>
          ) : setupQuery.error || !setupQuery.data ? (
            <p className="text-destructive py-6 text-center text-sm">
              Could not start setup. Please reload the page.
            </p>
          ) : (
            <>
              <ol className="text-muted-foreground mb-4 list-decimal space-y-1 pl-5 text-sm">
                <li>Open Google Authenticator, Authy, or a similar app.</li>
                <li>Scan the QR code below (or enter the key manually).</li>
                <li>Enter the 6-digit code it generates.</li>
              </ol>

              <div className="flex flex-col items-center">
                <img
                  src={setupQuery.data.qr}
                  alt="Two-factor QR code"
                  className="size-44 rounded-lg border bg-white p-2"
                />
                <BackupKey secret={setupQuery.data.secret} />
              </div>

              <form
                className="mt-5 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  setError(null);
                  confirm.mutate();
                }}
              >
                {error && (
                  <div
                    role="alert"
                    className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2.5 text-sm"
                  >
                    {error}
                  </div>
                )}
                <div>
                  <Label htmlFor="confirm-code">Authentication code</Label>
                  <Input
                    id="confirm-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    placeholder="000000"
                    className="mt-1.5 text-center text-lg tracking-[0.4em]"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={confirm.isPending || code.length !== 6}
                >
                  {confirm.isPending && <Loader2 className="size-4 animate-spin" />}
                  Verify & enable
                </Button>
              </form>
            </>
          )}
        </Card>

        <button
          onClick={() => logout.mutate()}
          className="text-muted-foreground hover:text-foreground mx-auto mt-4 block text-sm"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function BackupKey({ secret }: { secret: string }) {
  return (
    <div className="mt-3 w-full">
      <p className="text-muted-foreground text-center text-xs">Or enter this key manually:</p>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(secret);
          toast.success('Key copied');
        }}
        className="bg-muted/60 hover:bg-muted mt-1 flex w-full items-center justify-center gap-2 break-all rounded-md border px-3 py-2 font-mono text-xs"
      >
        {secret}
        <Copy className="size-3.5 shrink-0" />
      </button>
    </div>
  );
}
