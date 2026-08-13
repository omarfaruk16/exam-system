/**
 * Integration tests for Phase 2 scope enforcement + audit, run against the real (seeded) dev DB.
 * Prereq: `pnpm infra:up && pnpm db:migrate && pnpm db:seed`.
 *
 * These assert BEHAVIOUR, not claims:
 *   (a) a CSE department head is denied read + assignment into Physics-department entities;
 *   (b) a reassignment updates assignedTeacher and leaves an audit-log trail.
 */
import { ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessControlService } from '../src/common/access/access-control.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import type { AuthUser } from '../src/common/types/auth';
import { AuditService } from '../src/modules/audit/audit.service';
import { OfferingService } from '../src/modules/org/offering.service';

let prisma: PrismaService;
let offerings: OfferingService;
let cseHead: AuthUser;
let phyOfferingPublicId: string;
let phyPartPublicId: string;
let csePartPublicId: string;
let cseOriginalTeacherPublicId: string | null;
let teacher1PublicId: string;
let teacher2PublicId: string;

beforeAll(async () => {
  process.loadEnvFile('.env');
  prisma = new PrismaService();
  await prisma.onModuleInit();
  offerings = new OfferingService(prisma, new AuditService(prisma), new AccessControlService());

  const cse = await prisma.db.department.findFirstOrThrow({
    where: { code: 'CSE' },
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

  const phyOffering = await prisma.db.courseOffering.findFirstOrThrow({
    where: { course: { code: 'PHY-1101' } },
    select: { publicId: true },
  });
  phyOfferingPublicId = phyOffering.publicId;
  const phyPart = await prisma.db.offeringPart.findFirstOrThrow({
    where: { offering: { course: { code: 'PHY-1101' } } },
    select: { publicId: true },
  });
  phyPartPublicId = phyPart.publicId;

  const csePart = await prisma.db.offeringPart.findFirstOrThrow({
    where: { offering: { course: { code: 'CSE-1101' } }, coursePart: { name: 'Part A' } },
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
    await offerings
      .assignTeacher({ actor: cseHead, ip: 'test' }, csePartPublicId, {
        teacherPublicId: cseOriginalTeacherPublicId,
      })
      .catch(() => undefined);
  }
  await prisma?.onModuleDestroy();
});

describe('Phase 2 — scope enforcement (CSE head vs Physics)', () => {
  it('(a) DENIES assigning a teacher to a Physics offering part', async () => {
    await expect(
      offerings.assignTeacher({ actor: cseHead, ip: 'test' }, phyPartPublicId, {
        teacherPublicId: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('(a) DENIES reading Physics offering parts', async () => {
    await expect(offerings.listOfferingParts(cseHead, phyOfferingPublicId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('(a) filters Physics out of the department head’s offering list', async () => {
    const list = await offerings.listOfferings(cseHead);
    expect(list.some((o) => o.course.code === 'CSE-1101')).toBe(true);
    expect(list.every((o) => o.course.code !== 'PHY-1101')).toBe(true);
  });
});

describe('Phase 2 — reassignment + audit', () => {
  it('(b) reassigns a CSE offering part and writes an audit entry', async () => {
    const target =
      cseOriginalTeacherPublicId === teacher2PublicId ? teacher1PublicId : teacher2PublicId;

    const before = await prisma.auditLog.count({
      where: { entity: 'OfferingPart', entityId: csePartPublicId },
    });

    const result = await offerings.assignTeacher(
      { actor: cseHead, ip: '10.0.0.9' },
      csePartPublicId,
      {
        teacherPublicId: target,
      },
    );
    expect(result.assignedTeacher?.publicId).toBe(target);

    const after = await prisma.auditLog.count({
      where: { entity: 'OfferingPart', entityId: csePartPublicId },
    });
    expect(after).toBeGreaterThan(before);

    // The most recent audit row captures actor + ip + before/after teacher.
    const latest = await prisma.auditLog.findFirstOrThrow({
      where: { entity: 'OfferingPart', entityId: csePartPublicId },
      orderBy: { id: 'desc' },
    });
    expect(latest.action).toBe('offeringPart.assign_teacher');
    expect(latest.ip).toBe('10.0.0.9');
    expect(latest.actorUserId).toBe(cseHead.id);
  });
});
