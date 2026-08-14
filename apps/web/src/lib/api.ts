import type { ApiErrorBody } from '@exam/types';

const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: ApiErrorBody,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    // headers must come AFTER ...options so the computed Content-Type/Accept aren't clobbered.
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const body = (data ?? undefined) as ApiErrorBody | undefined;
    const message = Array.isArray(body?.message)
      ? body!.message.join(', ')
      : (body?.message ?? res.statusText);
    throw new ApiError(res.status, message, body);
  }

  return data as T;
}

export interface RequestOptions {
  headers?: Record<string, string>;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions): Promise<T> =>
    request<T>(path, { headers: opts?.headers }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> =>
    request<T>(path, {
      method: 'POST',
      body: body != null ? JSON.stringify(body) : undefined,
      headers: opts?.headers,
    }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> =>
    request<T>(path, {
      method: 'PATCH',
      body: body != null ? JSON.stringify(body) : undefined,
      headers: opts?.headers,
    }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> =>
    request<T>(path, {
      method: 'PUT',
      body: body != null ? JSON.stringify(body) : undefined,
      headers: opts?.headers,
    }),
  del: <T>(path: string, opts?: RequestOptions): Promise<T> =>
    request<T>(path, { method: 'DELETE', headers: opts?.headers }),
};
