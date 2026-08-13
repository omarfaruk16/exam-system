import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SessionUser } from '@exam/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/types/auth';
import { PasswordService } from './password.service';

const userWithRoles = {
  include: { roles: { include: { role: true } } },
} satisfies Prisma.UserDefaultArgs;

type UserWithRoles = Prisma.UserGetPayload<typeof userWithRoles>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
  ) {}

  /**
   * Resolve a login identifier (username, email, or student ID) and verify the password.
   * Uses a single generic error for every failure mode to avoid user enumeration.
   */
  async validateUser(identifier: string, plainPassword: string): Promise<AuthUser> {
    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { username: identifier },
          { email: identifier },
          { student: { studentId: identifier } },
        ],
      },
      ...userWithRoles,
    });

    if (!user) {
      // Still verify against a dummy hash to keep timing roughly constant would be ideal;
      // for now we simply reject. (Timing hardening tracked for phase 6.)
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await this.password.verify(user.passwordHash, plainPassword);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== 'active') throw new ForbiddenException('Account is suspended');

    // TOTP verification for 2FA-required roles is added in phase 6.
    return this.toAuthUser(user);
  }

  /** Loads a fresh principal by internal id — called by the Passport deserializer on every request. */
  async buildAuthUser(userId: number): Promise<AuthUser | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      ...userWithRoles,
    });
    return user ? this.toAuthUser(user) : null;
  }

  async recordLogin(userId: number): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  }

  toAuthUser(user: UserWithRoles): AuthUser {
    return {
      id: user.id,
      publicId: user.publicId,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      twoFactorEnabled: user.twoFactorEnabled,
      roles: user.roles.map((ur) => ({
        role: ur.role.name,
        scopeFacultyId: ur.scopeFacultyId,
        scopeDepartmentId: ur.scopeDepartmentId,
      })),
    };
  }

  /** Strip the internal id before sending the principal to the client. */
  toSessionUser(user: AuthUser): SessionUser {
    const { id: _id, ...session } = user;
    return session;
  }
}
