/**
 * Integration tests for scope enforcement + audit, run against the real (seeded) dev DB.
 * Prereq: `pnpm infra:up && pnpm db:migrate && pnpm db:seed`.
 *
 * These assert BEHAVIOUR, not claims:
 *   (a) a CSE department head is denied assigning a teacher into a Physics-department course part;
 *   (b) a reassignment updates the part's teacher and leaves an audit-log trail.
 */
import { ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessControlService } from '../src/common/access/access-control.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import type { AuthUser } from '../src/common/types/auth';
import { AuditService } from '../src/modules/audit/audit.service';
import { StructureService } from '../src/modules/org/structure.service';

let prisma: PrismaService;
let structure: StructureService;
let cseHead: AuthUser;
let phyPartPublicId: string;
let csePartPublicId: string;
let cseOriginalTeacherPublicId: string | null;
let teacher1PublicId: string;
let teacher2PublicId: string;

beforeAll(async () => {
  process.loadEnvFile('.env');
  prisma = new PrismaService();
  await prisma.onModuleInit();
  // PasswordService is only used by manual-create methods not exercised here — pass a stub.
  const passwordStub = { hash: async () => '' } as never;
  structure = new StructureService(
    prisma,
    new AuditService(prisma),
    new AccessControlService(),
    passwordStub,
  );

  const cse = await prisma.db.department.findFirstOrThrow({
    where: { name: 'Computer Science & Engineering' },
    select: { id: true },
  });
  const head = await prisma.db.user.findFirstOrThrow({
    where: { username: 'cse.head' },
    select: { id: true, publicId: true },
  });

  // A real principal for the CSE department head, scoped to CSE only.
  cseHead = {
    id: head.id,
    publicId: head.publicId,
    username: 'cse.head',
    email: null,
    displayName: 'Prof. Rahima Khatun',
    status: 'active',
    mustChangePassword: false,
    twoFactorEnabled: false,
    roles: [
      { role: 'department_head', scopeFacultyId: null, scopeDepartmentId: cse.id },
      { role: 'teacher', scopeFacultyId: null, scopeDepartmentId: null },
    ],
  };

  const phyPart = await prisma.db.coursePart.findFirstOrThrow({
    where: { course: { code: 'PHY-1101' } },
    select: { publicId: true },
  });
  phyPartPublicId = phyPart.publicId;

  const csePart = await prisma.db.coursePart.findFirstOrThrow({
    where: { course: { code: 'CSE-1101' }, name: 'Part A' },
    select: { publicId: true, assignedTeacher: { select: { publicId: true } } },
  });
  csePartPublicId = csePart.publicId;
  cseOriginalTeacherPublicId = csePart.assignedTeacher?.publicId ?? null;

  teacher1PublicId = (
    await prisma.db.teacher.findFirstOrThrow({
      where: { user: { username: 'teacher1' } },
      select: { publicId: true },
    })
  ).publicId;
  teacher2PublicId = (
    await prisma.db.teacher.findFirstOrThrow({
      where: { user: { username: 'teacher2' } },
      select: { publicId: true },
    })
  ).publicId;
});

afterAll(async () => {
  // Restore the original CSE assignment so re-runs stay idempotent.
  if (csePartPublicId) {
    await structure
      .assignTeacher({ actor: cseHead, ip: 'test' }, csePartPublicId, {
        teacherPublicId: cseOriginalTeacherPublicId,
      })
      .catch(() => undefined);
  }
  await prisma?.onModuleDestroy();
});

describe('scope enforcement (CSE head vs Physics)', () => {
  it('(a) DENIES assigning a teacher to a Physics course part', async () => {
    await expect(
      structure.assignTeacher({ actor: cseHead, ip: 'test' }, phyPartPublicId, {
        teacherPublicId: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('reassignment + audit', () => {
  it('(b) reassigns a CSE course part and writes an audit entry', async () => {
    const target =
      cseOriginalTeacherPublicId === teacher2PublicId ? teacher1PublicId : teacher2PublicId;

    const before = await prisma.auditLog.count({
      where: { entity: 'CoursePart', entityId: csePartPublicId },
    });

    const result = await structure.assignTeacher(
      { actor: cseHead, ip: '10.0.0.9' },
      csePartPublicId,
      { teacherPublicId: target },
    );
    expect(result.assignedTeacher?.publicId).toBe(target);

    const after = await prisma.auditLog.count({
      where: { entity: 'CoursePart', entityId: csePartPublicId },
    });
    expect(after).toBeGreaterThan(before);

    const latest = await prisma.auditLog.findFirstOrThrow({
      where: { entity: 'CoursePart', entityId: csePartPublicId },
      orderBy: { id: 'desc' },
    });
    expect(latest.action).toBe('coursePart.assignTeacher');
    expect(latest.ip).toBe('10.0.0.9');
    expect(latest.actorUserId).toBe(cseHead.id);
  });
});
