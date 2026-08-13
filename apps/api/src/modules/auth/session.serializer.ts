import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import type { AuthUser } from '../../common/types/auth';
import { AuthService } from './auth.service';

/**
 * Only the internal user id is written into the session. The full principal is reloaded from the
 * database on every request, so role/status/suspension changes take effect immediately.
 */
@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private readonly auth: AuthService) {
    super();
  }

  serializeUser(user: AuthUser, done: (err: Error | null, id?: number) => void): void {
    done(null, user.id);
  }

  async deserializeUser(
    userId: number,
    done: (err: Error | null, user?: AuthUser | null) => void,
  ): Promise<void> {
    try {
      const user = await this.auth.buildAuthUser(userId);
      done(null, user);
    } catch (err) {
      done(err as Error);
    }
  }
}
