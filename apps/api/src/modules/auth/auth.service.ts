import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SessionUser } from '@exam/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/types/auth';
import { PasswordService } from './password.service';
import { TwoFactorService } from './two-factor.service';

const userWithRoles = {
  include: { roles: { include: { role: true } } },
} satisfies Prisma.UserDefaultArgs;

type UserWithRoles = Prisma.UserGetPayload<typeof userWithRoles>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  /**
   * Resolve a login identifier (username, email, or student ID) and verify the password.
   * Uses a single generic error for every failure mode to avoid user enumeration.
   */
  async validateUser(identifier: string, plainPassword: string): Promise<AuthUser> {
    // `prisma.db` is the soft-delete-aware client: deletedAt filtering is automatic.
    const user = await this.prisma.db.user.findFirst({
      where: {
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
      // for now we simply reject. (Timing hardening is a possible future refinement.)
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await this.password.verify(user.passwordHash, plainPassword);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== 'active') throw new ForbiddenException('Account is suspended');

    return this.toAuthUser(user);
  }

  /** Loads a fresh principal by internal id — called by the Passport deserializer on every request. */
  async buildAuthUser(userId: number): Promise<AuthUser | null> {
    const user = await this.prisma.db.user.findFirst({
      where: { id: userId },
      ...userWithRoles,
    });
    return user ? this.toAuthUser(user) : null;
  }

  async recordLogin(userId: number): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  }

  /** The encrypted TOTP secret for a user, or null if 2FA is not enabled. */
  async getTwoFactorSecret(userId: number): Promise<string | null> {
    const u = await this.prisma.db.user.findFirst({
      where: { id: userId },
      select: { twoFactorSecret: true },
    });
    return u?.twoFactorSecret ?? null;
  }

  async enableTwoFactor(userId: number, encryptedSecret: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: encryptedSecret, twoFactorEnabled: true },
    });
  }

  async disableTwoFactor(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: null, twoFactorEnabled: false },
    });
  }

  /** Resolve a user + roles by publicId (for admin 2FA reset). */
  async findByPublicId(publicId: string): Promise<AuthUser | null> {
    const user = await this.prisma.db.user.findFirst({ where: { publicId }, ...userWithRoles });
    return user ? this.toAuthUser(user) : null;
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

  /**
   * Build the client-facing principal. Scope ids are mapped to publicIds/codes here so the payload
   * never exposes internal autoincrement ids.
   */
  async toSessionUser(user: AuthUser): Promise<SessionUser> {
    const facultyIds = [
      ...new Set(user.roles.map((r) => r.scopeFacultyId).filter((x): x is number => x !== null)),
    ];
    const departmentIds = [
      ...new Set(user.roles.map((r) => r.scopeDepartmentId).filter((x): x is number => x !== null)),
    ];

    const [faculties, departments] = await Promise.all([
      facultyIds.length
        ? this.prisma.db.faculty.findMany({
            where: { id: { in: facultyIds } },
            select: { id: true, publicId: true, name: true },
          })
        : Promise.resolve([]),
      departmentIds.length
        ? this.prisma.db.department.findMany({
            where: { id: { in: departmentIds } },
            select: { id: true, publicId: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const fMap = new Map(faculties.map((f) => [f.id, { publicId: f.publicId, name: f.name }]));
    const dMap = new Map(departments.map((d) => [d.id, { publicId: d.publicId, name: d.name }]));

    return {
      publicId: user.publicId,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      twoFactorEnabled: user.twoFactorEnabled,
      requiresTwoFactorSetup: this.twoFactor.needsSetup(user),
      roles: user.roles.map((r) => ({
        role: r.role,
        scopeFaculty: r.scopeFacultyId !== null ? (fMap.get(r.scopeFacultyId) ?? null) : null,
        scopeDepartment:
          r.scopeDepartmentId !== null ? (dMap.get(r.scopeDepartmentId) ?? null) : null,
      })),
    };
  }
}
