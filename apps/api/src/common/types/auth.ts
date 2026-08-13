import type { RoleName } from '@exam/types';

/** Role assignment as the server uses it: raw int scope ids for fast authorization checks. */
export interface AuthScopedRole {
  role: RoleName;
  scopeFacultyId: number | null;
  scopeDepartmentId: number | null;
}

/**
 * The authenticated principal attached to `req.user`. This is the SERVER-side shape: it carries
 * the internal numeric id and int scope ids (never sent to the client — see AuthService.toSessionUser,
 * which maps scope ids to publicIds for the SessionUser payload).
 */
export interface AuthUser {
  id: number;
  publicId: string;
  username: string;
  email: string | null;
  displayName: string;
  status: 'active' | 'suspended';
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  roles: AuthScopedRole[];
}

declare global {
  // Merge our principal into Passport's Express.User so `req.user` is strongly typed.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User extends AuthUser {}
  }
}
