import type { SessionUser } from '@exam/types';

/** The authenticated principal attached to `req.user` after Passport deserialization. */
export interface AuthUser extends SessionUser {
  /** Internal numeric id — used server-side only, never exposed in URLs. */
  id: number;
}

declare global {
  // Merge our principal into Passport's Express.User so `req.user` is strongly typed.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User extends AuthUser {}
  }
}
