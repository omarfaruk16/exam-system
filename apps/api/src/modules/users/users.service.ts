import { BadRequestException, Injectable } from '@nestjs/common';
import type { SessionUser } from '@exam/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/types/auth';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';
import { SessionService } from '../auth/session.service';

interface ChangePasswordContext {
  sessionId: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Change the current user's password (also used to satisfy mustChangePassword on first login).
   * Verifies the current password, clears the force-change flag, and revokes the user's *other*
   * sessions so a stolen cookie can't outlive the change.
   */
  async changePassword(
    user: AuthUser,
    currentPassword: string,
    newPassword: string,
    ctx: ChangePasswordContext,
  ): Promise<{ user: SessionUser }> {
    const dbUser = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    const ok = await this.password.verify(dbUser.passwordHash, currentPassword);
    if (!ok) throw new BadRequestException('Your current password is incorrect');

    if (await this.password.verify(dbUser.passwordHash, newPassword)) {
      throw new BadRequestException('New password must be different from the current one');
    }

    const passwordHash = await this.password.hash(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });

    await this.sessions.enforceSingleSession(user.id, ctx.sessionId);
    await this.audit.record({
      actorUserId: user.id,
      action: 'user.change_password',
      entity: 'User',
      entityId: user.id,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    const fresh = await this.auth.buildAuthUser(user.id);
    return { user: this.auth.toSessionUser(fresh ?? user) };
  }
}
