import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChangePasswordInput, LoginInput, LoginResult, SessionUser } from '@exam/types';
import { api, ApiError } from './api';

export const sessionKey = ['session'] as const;

/** Current principal, or null when not authenticated. Never throws on 401. */
export function useSession() {
  return useQuery<SessionUser | null>({
    queryKey: sessionKey,
    queryFn: async () => {
      try {
        return await api.get<SessionUser>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<LoginResult>('/auth/login', input),
    onSuccess: (res) => {
      if (res.status === 'ok') qc.setQueryData(sessionKey, res.user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ status: 'ok' }>('/auth/logout'),
    onSettled: () => {
      qc.setQueryData(sessionKey, null);
      qc.clear();
    },
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<ChangePasswordInput, 'confirmPassword'>) =>
      api.post<{ user: SessionUser }>('/users/me/change-password', input),
    onSuccess: (res) => qc.setQueryData(sessionKey, res.user),
  });
}
