import { z } from 'zod';
import type { RoleName } from './roles';

/**
 * Login accepts a single identifier: students use their university student ID,
 * staff use username or email. The server resolves which.
 * TOTP is required on the second step for staff roles that can alter marks.
 */
export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Email or Student ID is required').max(200),
  password: z.string().min(1, 'Password is required').max(200),
  totp: z
    .string()
    .regex(/^\d{6}$/u, 'Enter the 6-digit code')
    .optional(),
  /**
   * Students may only be signed in on one device at a time. When another device already
   * holds a live session, login returns `session_conflict` instead of signing in. The SPA
   * re-submits with this flag set to evict the other device and continue here.
   */
  evictOtherSessions: z.boolean().optional(),
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
  name: string;
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
  /** Profile picture as a small data URL, or null when the user has none. */
  avatarUrl: string | null;
  status: 'active' | 'suspended';
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  /** Staff role that requires 2FA but has not enrolled yet — the SPA must force setup first. */
  requiresTwoFactorSetup: boolean;
  roles: SessionRole[];
}

/**
 * Result of POST /auth/login — fully authenticated, a 2FA challenge carrying a partial token,
 * or (students only) a single-device conflict: another device already holds a live session.
 */
export type LoginResult =
  | { status: 'ok'; user: SessionUser }
  | { status: 'two_factor_required'; partialToken: string }
  | { status: 'session_conflict' };

export const updateEmailSchema = z.object({
  newEmail: z.string().email('Enter a valid email address').max(200).toLowerCase(),
});
export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;

/**
 * Self-service profile update (name, email, avatar). Every field is optional so the form can
 * send only what changed. `avatarUrl` accepts a small image data URL, or null to remove it.
 * The 700_000-char cap ≈ a ~512 KB image once base64-encoded — plenty for a resized avatar.
 */
export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1, 'Name is required').max(150).optional(),
  email: z.string().email('Enter a valid email address').max(200).toLowerCase().optional(),
  avatarUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg|webp);base64,/, 'Unsupported image')
    .max(700_000, 'Image is too large')
    .nullable()
    .optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Payload shown on the 2FA setup screen. */
export interface TwoFactorSetup {
  otpauth: string;
  qr: string;
  secret: string;
}
