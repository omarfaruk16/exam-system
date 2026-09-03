import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import type { Redis } from 'ioredis';
import { PrismaService } from '../../common/prisma/prisma.service';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import type { AuthUser } from '../../common/types/auth';
import { AuditService } from '../audit/audit.service';
import { ExamAccessService } from './exam-access.service';

// Exams that have computed marks (percentage in ExamResult) count toward a part's rollup.
const GRADED_STATUSES = ['ended', 'grading', 'results_published'] as const;

export type MetricKey = 'averageAll' | 'bestOne' | 'bestTwoAverage';
export const METRIC_KEYS: MetricKey[] = ['averageAll', 'bestOne', 'bestTwoAverage'];
export const METRIC_LABELS: Record<MetricKey, string> = {
  averageAll: 'Average of all exams',
  bestOne: 'Best one',
  bestTwoAverage: 'Average of best two',
};
const DEFAULT_METRIC: MetricKey = 'bestTwoAverage';

interface Aggregate {
  examsCounted: number;
  averageAll: number | null;
  bestOne: number | null;
  bestTwoAverage: number | null;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

function aggregatePercentages(pcts: number[]): Aggregate {
  if (pcts.length === 0) {
    return { examsCounted: 0, averageAll: null, bestOne: null, bestTwoAverage: null };
  }
  const sorted = [...pcts].sort((a, b) => b - a);
  const topTwo = sorted.slice(0, 2);
  return {
    examsCounted: pcts.length,
    averageAll: round1(pcts.reduce((a, b) => a + b, 0) / pcts.length),
    bestOne: round1(sorted[0]!),
    bestTwoAverage: round1(topTwo.reduce((a, b) => a + b, 0) / topTwo.length),
  };
}

@Injectable()
export class MarkingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ExamAccessService,
    private readonly audit: AuditService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private isStaff(user: AuthUser): boolean {
    return user.roles.some(
      (r) => r.role === 'admin' || r.role === 'super_admin' || r.role === 'department_head',
    );
  }

  // ─────────────────────────── Rollup computation ───────────────────────────

  /**
   * Recompute the (student × this course part) rollup from the part's graded exams and
   * upsert CoursePartResult. Aggregates are on exam PERCENTAGES (fair across differing
   * totals). Optionally stamps finalizedAt/By when a teacher submits the final report.
   */
  async refreshPart(
    coursePartId: number,
    opts: { finalize?: boolean; teacherId?: number | null; metric?: MetricKey } = {},
  ): Promise<{ students: number; examsTotal: number }> {
    const part = await this.prisma.db.coursePart.findUniqueOrThrow({
      where: { id: coursePartId },
      select: { course: { select: { semesterId: true } } },
    });

    const exams = await this.prisma.db.exam.findMany({
      where: {
        coursePartId,
        deletedAt: null,
        status: { in: [...GRADED_STATUSES] },
      },
      select: { id: true },
    });
    const examIds = exams.map((e) => e.id);
    const examsTotal = examIds.length;

    const students = await this.prisma.db.student.findMany({
      where: { batch: { currentSemesterId: part.course.semesterId }, deletedAt: null },
      select: { id: true },
    });

    // (studentId → [percentages]) from ExamResult of the part's graded exams.
    const pctByStudent = new Map<number, number[]>();
    if (examIds.length) {
      const results = await this.prisma.db.examResult.findMany({
        where: { attempt: { examId: { in: examIds } } },
        select: { percentage: true, attempt: { select: { studentId: true } } },
      });
      for (const r of results) {
        const arr = pctByStudent.get(r.attempt.studentId) ?? [];
        arr.push(r.percentage);
        pctByStudent.set(r.attempt.studentId, arr);
      }
    }

    const finalizedAt = opts.finalize ? new Date() : undefined;
    const finalizedByTeacherId = opts.finalize ? (opts.teacherId ?? null) : undefined;
    const sentMetric = opts.finalize ? (opts.metric ?? DEFAULT_METRIC) : undefined;

    // One transaction of upserts keeps the rollup consistent.
    await this.prisma.db.$transaction(
      students.map((s) => {
        const agg = aggregatePercentages(pctByStudent.get(s.id) ?? []);
        const base = {
          examsCounted: agg.examsCounted,
          examsTotal,
          averageAll: agg.averageAll,
          bestOne: agg.bestOne,
          bestTwoAverage: agg.bestTwoAverage,
          computedAt: new Date(),
          ...(opts.finalize ? { finalizedAt, finalizedByTeacherId, sentMetric } : {}),
        };
        return this.prisma.db.coursePartResult.upsert({
          where: { coursePartId_studentId: { coursePartId, studentId: s.id } },
          create: { coursePartId, studentId: s.id, ...base },
          update: base,
        });
      }),
    );

    await this.bustMarkingCache();
    return { students: students.length, examsTotal };
  }

  /**
   * Teacher (assigned) or admin/head submits the part's final report to admin, choosing which
   * aggregate (average of all / best one / average of best two) the admin marking sheet shows.
   */
  async finalizePart(user: AuthUser, partPublicId: string, ip: string, metric: MetricKey) {
    const ctx = await this.access.requireAuthorablePartAny(user, partPublicId);
    const res = await this.refreshPart(ctx.coursePartId, {
      finalize: true,
      teacherId: ctx.teacherId,
      metric,
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'coursePart.finalizeResults',
      entity: 'CoursePart',
      entityId: partPublicId,
      after: { ...res, metric },
      ip,
    });
    return { status: 'ok' as const, metric, ...res };
  }

  // ─────────────────────────── Teacher summary ───────────────────────────

  /** Live per-student rollup for one part + its finalized state (teacher preview / item 2). */
  async getCoursePartSummary(user: AuthUser, partPublicId: string) {
    const ctx = await this.access.requireAuthorablePartAny(user, partPublicId);

    const part = await this.prisma.db.coursePart.findUniqueOrThrow({
      where: { id: ctx.coursePartId },
      select: {
        publicId: true,
        name: true,
        course: {
          select: {
            code: true,
            name: true,
            semesterId: true,
            semester: {
              select: {
                number: true,
                name: true,
                batches: {
                  where: { deletedAt: null },
                  select: { name: true },
                  orderBy: { year: 'desc' },
                },
              },
            },
          },
        },
      },
    });

    const exams = await this.prisma.db.exam.findMany({
      where: {
        coursePartId: ctx.coursePartId,
        deletedAt: null,
        status: { in: [...GRADED_STATUSES] },
      },
      select: { publicId: true, title: true, startAt: true, totalMarks: true, id: true },
      orderBy: { startAt: 'asc' },
    });
    const examIds = exams.map((e) => e.id);

    const students = await this.prisma.db.student.findMany({
      where: { batch: { currentSemesterId: part.course.semesterId }, deletedAt: null },
      select: {
        id: true,
        publicId: true,
        studentId: true,
        rollNumber: true,
        user: { select: { displayName: true } },
      },
      orderBy: [{ rollNumber: 'asc' }, { studentId: 'asc' }],
    });

    const pctByStudent = new Map<number, number[]>();
    if (examIds.length) {
      const results = await this.prisma.db.examResult.findMany({
        where: { attempt: { examId: { in: examIds } } },
        select: { percentage: true, attempt: { select: { studentId: true } } },
      });
      for (const r of results) {
        const arr = pctByStudent.get(r.attempt.studentId) ?? [];
        arr.push(r.percentage);
        pctByStudent.set(r.attempt.studentId, arr);
      }
    }

    const finalizedRow = await this.prisma.db.coursePartResult.findFirst({
      where: { coursePartId: ctx.coursePartId, finalizedAt: { not: null } },
      select: { finalizedAt: true, sentMetric: true },
      orderBy: { finalizedAt: 'desc' },
    });

    const sem = part.course.semester;
    const rows = students.map((s) => {
      const agg = aggregatePercentages(pctByStudent.get(s.id) ?? []);
      return {
        studentPublicId: s.publicId,
        studentId: s.studentId,
        name: s.user.displayName,
        rollNumber: s.rollNumber,
        examsCounted: agg.examsCounted,
        examsTotal: exams.length,
        averageAll: agg.averageAll,
        bestOne: agg.bestOne,
        bestTwoAverage: agg.bestTwoAverage,
      };
    });

    return {
      part: {
        publicId: part.publicId,
        courseCode: part.course.code,
        courseName: part.course.name,
        partName: part.name,
        semesterLabel: sem.name?.trim() ? sem.name : `Semester ${sem.number}`,
        batch: sem.batches.length ? sem.batches.map((b) => b.name).join(', ') : null,
      },
      exams: exams.map((e) => ({
        publicId: e.publicId,
        title: e.title,
        date: e.startAt.toISOString(),
        totalMarks: e.totalMarks,
      })),
      rows,
      finalized: Boolean(finalizedRow),
      finalizedAt: finalizedRow?.finalizedAt ? finalizedRow.finalizedAt.toISOString() : null,
      sentMetric: (finalizedRow?.sentMetric as MetricKey | null) ?? null,
    };
  }

  // ─────────────────────────── Admin scope helper ───────────────────────────

  /**
   * Resolve the user's RBAC scope to concrete id constraints. `unrestricted` = super_admin
   * (whole institution). Faculty-scoped admins are pinned to their faculties; department
   * heads to their departments. This scope is ALWAYS AND-ed onto queries and can never be
   * widened by the UI filters — a head cannot read another department's marks.
   */
  private resolveScope(user: AuthUser): {
    unrestricted: boolean;
    facultyIds: number[];
    departmentIds: number[];
  } {
    if (user.roles.some((r) => r.role === 'super_admin')) {
      return { unrestricted: true, facultyIds: [], departmentIds: [] };
    }
    const facultyIds = user.roles
      .filter((r) => r.role === 'admin' && r.scopeFacultyId !== null)
      .map((r) => r.scopeFacultyId as number);
    const departmentIds = user.roles
      .filter((r) => r.role === 'department_head' && r.scopeDepartmentId !== null)
      .map((r) => r.scopeDepartmentId as number);
    // An unscoped admin (no faculty pin) is also institution-wide.
    if (user.roles.some((r) => r.role === 'admin') && facultyIds.length === 0) {
      return { unrestricted: true, facultyIds: [], departmentIds: [] };
    }
    if (facultyIds.length === 0 && departmentIds.length === 0) {
      throw new ForbiddenException('You do not have access to the marking sheet');
    }
    return { unrestricted: false, facultyIds, departmentIds };
  }

  /** The scope as a CoursePart WHERE fragment (empty when unrestricted). Always AND-ed on. */
  private scopeCoursePartWhere(scope: {
    unrestricted: boolean;
    facultyIds: number[];
    departmentIds: number[];
  }): Prisma.CoursePartWhereInput {
    if (scope.unrestricted) return {};
    const or: Prisma.CoursePartWhereInput[] = [];
    if (scope.facultyIds.length) {
      or.push({
        course: { semester: { program: { department: { facultyId: { in: scope.facultyIds } } } } },
      });
    }
    if (scope.departmentIds.length) {
      or.push({ course: { semester: { program: { departmentId: { in: scope.departmentIds } } } } });
    }
    return or.length === 1 ? or[0]! : { OR: or };
  }

  private assertStaff(user: AuthUser): void {
    if (!this.isStaff(user)) {
      throw new ForbiddenException('Only staff can view the final marking sheet');
    }
  }

  // ─────────────────────────── Cascading filter options ───────────────────────────

  async getFilterOptions(
    user: AuthUser,
    filters: {
      faculty?: string;
      department?: string;
      program?: string;
      batch?: string;
      semester?: string;
    },
  ) {
    this.assertStaff(user);
    const scope = this.resolveScope(user);

    // Scope the top two selectors: department heads see only their department(s) and its
    // faculty; faculty-scoped admins see only their faculties.
    const scopedDeptWhere: Prisma.DepartmentWhereInput = { deletedAt: null };
    if (!scope.unrestricted) {
      const or: Prisma.DepartmentWhereInput[] = [];
      if (scope.facultyIds.length) or.push({ facultyId: { in: scope.facultyIds } });
      if (scope.departmentIds.length) or.push({ id: { in: scope.departmentIds } });
      if (or.length) scopedDeptWhere.OR = or;
    }
    // The faculties a scoped user may see = faculties of their in-scope departments.
    const inScopeDepts = await this.prisma.db.department.findMany({
      where: scopedDeptWhere,
      select: { facultyId: true },
    });
    const scopeFacultyIds = scope.unrestricted
      ? null
      : [...new Set(inScopeDepts.map((d) => d.facultyId))];

    const faculties = await this.prisma.db.faculty.findMany({
      where: {
        deletedAt: null,
        ...(scopeFacultyIds ? { id: { in: scopeFacultyIds } } : {}),
      },
      select: { publicId: true, name: true },
      orderBy: { name: 'asc' },
    });

    const departments = await this.prisma.db.department.findMany({
      where: {
        ...scopedDeptWhere,
        ...(filters.faculty ? { faculty: { publicId: filters.faculty } } : {}),
      },
      select: { publicId: true, name: true },
      orderBy: { name: 'asc' },
    });

    const programs = filters.department
      ? await this.prisma.db.program.findMany({
          where: { deletedAt: null, department: { publicId: filters.department } },
          select: { publicId: true, name: true },
          orderBy: { name: 'asc' },
        })
      : [];

    const batches = filters.program
      ? await this.prisma.db.batch.findMany({
          where: { deletedAt: null, program: { publicId: filters.program } },
          select: { publicId: true, name: true, year: true },
          orderBy: { year: 'desc' },
        })
      : [];

    const semesters = filters.program
      ? await this.prisma.db.semester.findMany({
          where: { program: { publicId: filters.program } },
          select: { publicId: true, number: true, name: true },
          orderBy: { number: 'asc' },
        })
      : [];

    const courses = filters.semester
      ? await this.prisma.db.course.findMany({
          where: { deletedAt: null, semester: { publicId: filters.semester } },
          select: { publicId: true, code: true, name: true },
          orderBy: { code: 'asc' },
        })
      : [];

    return {
      faculties: faculties.map((f) => ({ publicId: f.publicId, label: f.name })),
      departments: departments.map((d) => ({ publicId: d.publicId, label: d.name })),
      programs: programs.map((p) => ({ publicId: p.publicId, label: p.name })),
      batches: batches.map((b) => ({ publicId: b.publicId, label: `${b.name} (${b.year})` })),
      semesters: semesters.map((s) => ({
        publicId: s.publicId,
        label: s.name?.trim() ? s.name : `Semester ${s.number}`,
      })),
      courses: courses.map((c) => ({ publicId: c.publicId, label: `${c.code} · ${c.name}` })),
    };
  }

  // ─────────────────────────── Admin final-marking matrix ───────────────────────────

  private async bustMarkingCache(): Promise<void> {
    try {
      const keys = await this.redis.keys('marking:matrix:*');
      if (keys.length) await this.redis.del(...keys);
    } catch {
      /* cache is best-effort; never fail a write because Redis is unavailable */
    }
  }

  async getFinalMarking(
    user: AuthUser,
    filters: {
      faculty?: string;
      department?: string;
      program?: string;
      batch?: string;
      semester?: string;
      course?: string;
    },
  ) {
    this.assertStaff(user);

    // Cache key = user scope signature + filters. Short TTL; busted on finalize/refresh.
    // The admin no longer chooses a metric — each part shows the aggregate its teacher sent.
    const scopeSig = user.roles
      .map((r) => `${r.role}:${r.scopeFacultyId ?? ''}:${r.scopeDepartmentId ?? ''}`)
      .sort()
      .join('|');
    const cacheKey = `marking:matrix:${Buffer.from(JSON.stringify({ scopeSig, filters })).toString(
      'base64',
    )}`;
    try {
      const hit = await this.redis.get(cacheKey);
      if (hit) return JSON.parse(hit);
    } catch {
      /* ignore cache read errors */
    }

    // The user's RBAC scope (always enforced) AND the UI filters (narrowing only).
    const scope = this.resolveScope(user);
    const scopeFragment = this.scopeCoursePartWhere(scope);

    const departmentFilter: Prisma.DepartmentWhereInput = {};
    if (filters.faculty) departmentFilter.faculty = { publicId: filters.faculty };
    const programFilter: Prisma.ProgramWhereInput = {};
    if (filters.department) programFilter.department = { publicId: filters.department };
    else if (Object.keys(departmentFilter).length) programFilter.department = departmentFilter;
    const semesterFilter: Prisma.SemesterWhereInput = {};
    if (filters.program) semesterFilter.program = { publicId: filters.program };
    else if (Object.keys(programFilter).length) semesterFilter.program = programFilter;
    const courseFilter: Prisma.CourseWhereInput = {};
    if (filters.semester) courseFilter.semester = { publicId: filters.semester };
    else if (Object.keys(semesterFilter).length) courseFilter.semester = semesterFilter;
    if (filters.course) courseFilter.publicId = filters.course;

    const filterFragment: Prisma.CoursePartWhereInput = {};
    if (Object.keys(courseFilter).length) filterFragment.course = courseFilter;

    const partWhere: Prisma.CoursePartWhereInput = {
      AND: [{ deletedAt: null }, scopeFragment, filterFragment],
    };

    const parts = await this.prisma.db.coursePart.findMany({
      where: partWhere,
      select: {
        id: true,
        publicId: true,
        name: true,
        course: {
          select: {
            code: true,
            name: true,
            semester: { select: { number: true, name: true } },
          },
        },
      },
      orderBy: [
        { course: { semester: { number: 'asc' } } },
        { course: { code: 'asc' } },
        { name: 'asc' },
      ],
    });
    const partIds = parts.map((p) => p.id);

    // Which parts have been finalized, and which aggregate their teacher chose to send.
    const finalizedRows = partIds.length
      ? await this.prisma.db.coursePartResult.findMany({
          where: { coursePartId: { in: partIds }, finalizedAt: { not: null } },
          select: { coursePartId: true, sentMetric: true },
          distinct: ['coursePartId'],
        })
      : [];
    const finalizedPartIds = new Set(finalizedRows.map((r) => r.coursePartId));
    const sentMetricByPart = new Map<number, MetricKey>(
      finalizedRows.map((r) => [
        r.coursePartId,
        (r.sentMetric as MetricKey | null) ?? DEFAULT_METRIC,
      ]),
    );

    // Read the rollup rows for those parts, optionally narrowed to one batch's students.
    const rollups = partIds.length
      ? await this.prisma.db.coursePartResult.findMany({
          where: {
            coursePartId: { in: partIds },
            ...(filters.batch ? { student: { batch: { publicId: filters.batch } } } : {}),
          },
          select: {
            coursePartId: true,
            averageAll: true,
            bestOne: true,
            bestTwoAverage: true,
            student: {
              select: {
                publicId: true,
                studentId: true,
                rollNumber: true,
                user: { select: { displayName: true } },
                batch: { select: { name: true, program: { select: { name: true } } } },
              },
            },
          },
        })
      : [];

    const partPublicById = new Map(parts.map((p) => [p.id, p.publicId]));

    // Assemble the student rows. Each cell holds the single value the part's teacher chose to
    // send (best two / average / best one) — the admin sees only that, never a metric toggle.
    interface RowAcc {
      studentPublicId: string;
      studentId: string;
      name: string;
      rollNumber: string | null;
      batch: string;
      program: string;
      cells: Record<string, number | null>;
    }
    const byStudent = new Map<string, RowAcc>();
    for (const r of rollups) {
      const key = r.student.publicId;
      let row = byStudent.get(key);
      if (!row) {
        row = {
          studentPublicId: r.student.publicId,
          studentId: r.student.studentId,
          name: r.student.user.displayName,
          rollNumber: r.student.rollNumber,
          batch: r.student.batch.name,
          program: r.student.batch.program.name,
          cells: {},
        };
        byStudent.set(key, row);
      }
      const partPublicId = partPublicById.get(r.coursePartId)!;
      const sent = sentMetricByPart.get(r.coursePartId);
      // Only finalized parts (those with a chosen metric) contribute a value; others stay pending.
      row.cells[partPublicId] = sent ? r[sent] : null;
    }

    const rows = [...byStudent.values()]
      .map((row) => {
        const vals = Object.values(row.cells).filter((v): v is number => v != null);
        const overall = vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
        return { ...row, overall };
      })
      .sort((a, b) => {
        const ra = a.rollNumber ?? '';
        const rb = b.rollNumber ?? '';
        return (
          ra.localeCompare(rb, undefined, { numeric: true }) ||
          a.studentId.localeCompare(b.studentId)
        );
      });

    const columns = parts.map((p) => {
      const sent = sentMetricByPart.get(p.id) ?? null;
      return {
        partPublicId: p.publicId,
        courseCode: p.course.code,
        courseName: p.course.name,
        partName: p.name,
        semesterLabel: p.course.semester.name?.trim()
          ? p.course.semester.name
          : `Semester ${p.course.semester.number}`,
        finalized: finalizedPartIds.has(p.id),
        sentMetric: sent,
        sentMetricLabel: sent ? METRIC_LABELS[sent] : null,
      };
    });

    const result = {
      columns,
      rows,
      pendingColumns: columns.filter((c) => !c.finalized).length,
    };

    try {
      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 60);
    } catch {
      /* ignore cache write errors */
    }
    return result;
  }

  // ─────────────────────────── xlsx export (item 3) ───────────────────────────

  /** The final-marking matrix as an xlsx workbook. Reuses getFinalMarking (scope-enforced). */
  async exportFinalMarking(
    user: AuthUser,
    filters: {
      faculty?: string;
      department?: string;
      program?: string;
      batch?: string;
      semester?: string;
      course?: string;
    },
  ): Promise<{ buffer: Buffer; filename: string }> {
    const matrix = (await this.getFinalMarking(user, filters)) as {
      columns: {
        partPublicId: string;
        courseCode: string;
        partName: string;
        semesterLabel: string;
        finalized: boolean;
        sentMetricLabel: string | null;
      }[];
      rows: {
        studentId: string;
        rollNumber: string | null;
        name: string;
        batch: string;
        program: string;
        cells: Record<string, number | null>;
        overall: number | null;
      }[];
    };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Exam System';
    const ws = wb.addWorksheet('Final Marking', {
      pageSetup: { paperSize: 9, orientation: 'landscape' },
      views: [{ state: 'frozen', xSplit: 4, ySplit: 2 }],
    });

    // Header row (course · part) + sub-header (which aggregate the teacher sent).
    const headerRow = ws.addRow([
      'Roll',
      'Student ID',
      'Name',
      'Session',
      ...matrix.columns.map((c) => `${c.courseCode} ${c.partName}`),
      'Overall',
    ]);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    const subRow = ws.addRow([
      '',
      '',
      '',
      '',
      ...matrix.columns.map((c) => (c.finalized ? (c.sentMetricLabel ?? '') : 'pending')),
      'mean %',
    ]);
    subRow.font = { italic: true, size: 9, color: { argb: 'FF555555' } };
    subRow.eachCell((c) => {
      c.alignment = { horizontal: 'center' };
    });

    for (const r of matrix.rows) {
      ws.addRow([
        r.rollNumber ?? '',
        r.studentId,
        r.name,
        r.batch,
        ...matrix.columns.map((c) => {
          const v = r.cells[c.partPublicId];
          return v == null ? '' : v;
        }),
        r.overall == null ? '' : r.overall,
      ]);
    }

    ws.columns.forEach((col, i) => {
      col.width = i === 2 ? 26 : i < 4 ? 14 : 12;
    });

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { buffer, filename: 'final-marking.xlsx' };
  }
}
