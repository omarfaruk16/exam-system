import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AdminUserRow } from '@exam/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import type {
  CreateAdminUserDto,
  SetAdminPasswordDto,
  UpdateAdminUserDto,
} from './dto/admin-user.dto';

const MANAGED_ROLES = ['admin', 'department_head'] as const;

const userRoleSelect = {
  user: {
    select: {
      publicId: true,
      username: true,
      displayName: true,
      email: true,
      mustChangePassword: true,
      createdAt: true,
    },
  },
  role: { select: { name: true } },
  scopeFaculty: { select: { publicId: true, name: true } },
  scopeDepartment: { select: { publicId: true, name: true } },
} as const;

function toRow(ur: {
  user: {
    publicId: string;
    username: string;
    displayName: string;
    email: string | null;
    mustChangePassword: boolean;
    createdAt: Date;
  };
  role: { name: string };
  scopeFaculty: { publicId: string; name: string } | null;
  scopeDepartment: { publicId: string; name: string } | null;
}): AdminUserRow {
  return {
    publicId: ur.user.publicId,
    username: ur.user.username,
    displayName: ur.user.displayName,
    email: ur.user.email,
    mustChangePassword: ur.user.mustChangePassword,
    createdAt: ur.user.createdAt.toISOString(),
    role: ur.role.name as 'admin' | 'department_head',
    scopeFaculty: ur.scopeFaculty ?? null,
    scopeDepartment: ur.scopeDepartment ?? null,
  };
}

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<AdminUserRow[]> {
    const rows = await this.prisma.db.userRole.findMany({
      where: {
        role: { name: { in: [...MANAGED_ROLES] } },
        user: { deletedAt: null },
      },
      select: userRoleSelect,
      orderBy: [{ role: { name: 'asc' } }, { user: { createdAt: 'asc' } }],
    });
    return rows.map(toRow);
  }

  async create(dto: CreateAdminUserDto, actorId: number, ip: string): Promise<AdminUserRow> {
    const role = await this.prisma.db.role.findUnique({ where: { name: dto.role } });
    if (!role) throw new NotFoundException(`Role "${dto.role}" not found`);

    let scopeFacultyId: number | undefined;
    let scopeDepartmentId: number | undefined;

    if (dto.scopeFacultyPublicId) {
      const fac = await this.prisma.db.faculty.findFirst({
        where: { publicId: dto.scopeFacultyPublicId },
        select: { id: true },
      });
      if (!fac) throw new NotFoundException('Faculty not found');
      scopeFacultyId = fac.id;
    }

    if (dto.scopeDepartmentPublicId) {
      const dept = await this.prisma.db.department.findFirst({
        where: { publicId: dto.scopeDepartmentPublicId },
        select: { id: true },
      });
      if (!dept) throw new NotFoundException('Department not found');
      scopeDepartmentId = dept.id;
    }

    // Free the slot if a soft-deleted user previously held this username.
    await this.freeDeletedUserSlot(dto.username);

    const tempPassword = `${dto.username}@Exam123`;
    const hash = await this.password.hash(tempPassword);

    const userRole = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: dto.username,
          email: dto.email ?? null,
          passwordHash: hash,
          displayName: dto.displayName,
          mustChangePassword: true,
        },
      });
      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          scopeFacultyId,
          scopeDepartmentId,
        },
      });
      return tx.userRole.findFirstOrThrow({
        where: { userId: user.id, roleId: role.id },
        select: userRoleSelect,
      });
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'admin_user.create',
      entity: 'User',
      entityId: userRole.user.publicId,
      ip,
      after: { username: dto.username, role: dto.role },
    });

    return toRow(userRole);
  }

  async update(
    publicId: string,
    dto: UpdateAdminUserDto,
    actorId: number,
    ip: string,
  ): Promise<AdminUserRow> {
    const userRole = await this.findUserRole(publicId);

    if (dto.email && dto.email !== userRole.user.email) {
      const existing = await this.prisma.db.user.findFirst({
        where: { email: dto.email, deletedAt: null },
        select: { publicId: true },
      });
      if (existing && existing.publicId !== publicId) {
        throw new ConflictException('Email is already in use');
      }
    }

    await this.prisma.db.user.update({
      where: { publicId },
      data: {
        ...(dto.displayName ? { displayName: dto.displayName } : {}),
        ...(dto.email !== undefined ? { email: dto.email || null } : {}),
      },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'admin_user.update',
      entity: 'User',
      entityId: publicId,
      ip,
      after: dto,
    });

    return toRow(await this.findUserRole(publicId));
  }

  async remove(publicId: string, actorId: number, ip: string): Promise<void> {
    const userRole = await this.findUserRole(publicId);
    const del = `__del_${Date.now()}`;

    await this.prisma.db.user.update({
      where: { publicId },
      data: {
        deletedAt: new Date(),
        username: `${userRole.user.username}${del}`,
        email: null,
      },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'admin_user.delete',
      entity: 'User',
      entityId: publicId,
      ip,
      after: { username: userRole.user.username, role: userRole.role.name },
    });
  }

  async setPassword(
    publicId: string,
    dto: SetAdminPasswordDto,
    actorId: number,
    ip: string,
  ): Promise<void> {
    const userRole = await this.findUserRole(publicId);

    if (userRole.user.publicId === String(actorId)) {
      throw new BadRequestException('Use the change-password endpoint for your own password');
    }

    const hash = await this.password.hash(dto.password);
    await this.prisma.db.user.update({
      where: { publicId },
      data: { passwordHash: hash, mustChangePassword: true },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'admin_user.set_password',
      entity: 'User',
      entityId: publicId,
      ip,
    });
  }

  private async findUserRole(userPublicId: string) {
    const ur = await this.prisma.db.userRole.findFirst({
      where: {
        user: { publicId: userPublicId, deletedAt: null },
        role: { name: { in: [...MANAGED_ROLES] } },
      },
      select: userRoleSelect,
    });
    if (!ur) throw new NotFoundException('User not found');
    return ur;
  }

  private async freeDeletedUserSlot(username: string): Promise<void> {
    const deleted = await this.prisma.user.findFirst({
      where: { username, deletedAt: { not: null } },
      select: { id: true },
    });
    if (deleted) {
      await this.prisma.user.update({
        where: { id: deleted.id },
        data: { username: `${username}__del_${Date.now()}`, email: null },
      });
    }
  }
}
