import { z } from 'zod';
import type { RoleName } from './roles';

/**
 * Login accepts a single identifier: students use their university student ID,
 * staff use username or email. The server resolves which.
 * TOTP is required on the second step for staff roles that can alter marks.
 */
export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Username, email, or student ID is required').max(200),
  password: z.string().min(1, 'Password is required').max(200),
  totp: z
    .string()
    .regex(/^\d{6}$/u, 'Enter the 6-digit code')
    .optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Password policy — enforced identically on client (UX) and server (authority). */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200)
  .regex(/[a-z]/u, 'Must include a lowercase letter')
  .regex(/[A-Z]/u, 'Must include an uppercase letter')
  .regex(/[0-9]/u, 'Must include a number');

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(200),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** A scope target exposed to the client — never a raw autoincrement id. */
export interface SessionScopeRef {
  publicId: string;
  code: string;
}

export interface SessionRole {
  role: RoleName;
  scopeFaculty: SessionScopeRef | null;
  scopeDepartment: SessionScopeRef | null;
}

/** The authenticated principal returned by `GET /auth/me` and stored in the SPA. */
export interface SessionUser {
  publicId: string;
  username: string;
  email: string | null;
  displayName: string;
  status: 'active' | 'suspended';
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  /** Staff role that requires 2FA but has not enrolled yet — the SPA must force setup first. */
  requiresTwoFactorSetup: boolean;
  roles: SessionRole[];
}

/** Result of POST /auth/login — fully authenticated, or a 2FA challenge carrying a partial token. */
export type LoginResult =
  { status: 'ok'; user: SessionUser } | { status: 'two_factor_required'; partialToken: string };

/** Payload shown on the 2FA setup screen. */
export interface TwoFactorSetup {
  otpauth: string;
  qr: string;
  secret: string;
}
