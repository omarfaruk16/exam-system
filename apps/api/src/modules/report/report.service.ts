import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Env } from '../../common/config/env.validation';
import { PrismaService } from '../../common/prisma/prisma.service';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import type { AuthUser } from '../../common/types/auth';
import { ExamAccessService } from '../exam/exam-access.service';
import { QUEUE_REPORT } from '../../queue/queue.constants';
import type { RequestReportDto } from './dto/report.dto';
import type { ReportJobData } from './report.processor';

const examScopeSelect = {
  id: true,
  publicId: true,
  status: true,
  settings: true,
  coursePart: {
    select: {
      assignedTeacherId: true,
      course: {
        select: {
          semester: {
            select: {
              batch: {
                select: {
                  program: {
                    select: { departmentId: true, department: { select: { facultyId: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ExamSelect;

type ExamScope = Prisma.ExamGetPayload<{ select: typeof examScopeSelect }>;

@Injectable()
export class ReportService {
  constructor(
    @InjectQueue(QUEUE_REPORT) private readonly queue: Queue<ReportJobData>,
    private readonly prisma: PrismaService,
    private readonly access: ExamAccessService,
    private readonly config: ConfigService<Env, true>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private isAdmin(user: AuthUser): boolean {
    return user.roles.some((r) => r.role === 'admin' || r.role === 'super_admin');
  }

  private async assertReportAccess(user: AuthUser, exam: ExamScope): Promise<void> {
    const program = exam.coursePart.course.semester.batch.program;
    const scope = {
      departmentId: program.departmentId,
      facultyId: program.department.facultyId,
    };
    // super_admin, faculty-scoped admin, and the department's head are all authorized by scope
    // (assertAdminScope delegates to acl.assertDepartment, which understands each of those roles).
    const isDeptHead = user.roles.some((r) => r.role === 'department_head');
    if (this.isAdmin(user) || isDeptHead) {
      this.access.assertAdminScope(user, scope);
      return;
    }
    const teacher = await this.access.requireTeacher(user);
    if (exam.coursePart.assignedTeacherId !== teacher.id) {
      throw new ForbiddenException('You are not assigned to this exam');
    }
  }

  private reportFilesExist(jobId: string): boolean {
    const safeId = jobId.replace(/[^A-Za-z0-9_-]/g, '');
    const dir = join(this.config.getOrThrow('STORAGE_DIR', { infer: true }), 'reports');
    return existsSync(join(dir, `${safeId}.xlsx`)) && existsSync(join(dir, `${safeId}.pdf`));
  }

  async request(user: AuthUser, dto: RequestReportDto): Promise<{ jobId: string }> {
    const exam = await this.prisma.db.exam.findFirst({
      where: { publicId: dto.examPublicId },
      select: examScopeSelect,
    });
    if (!exam) throw new NotFoundException('Exam not found');

    // Reports need computed marks, which exist once the exam is over. Staff may
    // export during grading; students only once results are actually visible to them.
    const RESULT_READY: string[] = ['ended', 'grading', 'results_published'];
    if (!RESULT_READY.includes(exam.status)) {
      throw new ForbiddenException('Reports are available only after the exam has ended');
    }

    // Students may download their own individual mark sheet.
    const isStudent = user.roles.some((r) => r.role === 'student');
    if (isStudent) {
      if (dto.type !== 'individual' || !dto.studentPublicId) {
        throw new ForbiddenException('Students may only download their own individual mark sheet');
      }
      const student = await this.prisma.db.student.findFirst({
        where: { userId: user.id },
        select: { publicId: true },
      });
      if (student?.publicId !== dto.studentPublicId) {
        throw new ForbiddenException('You can only download your own mark sheet');
      }
      // Respect the teacher's "withhold marks until published" setting.
      const settings = (exam.settings as { showMarksAfterSubmit?: boolean } | null) ?? {};
      const marksVisible =
        settings.showMarksAfterSubmit !== false || exam.status === 'results_published';
      if (!marksVisible) {
        throw new ForbiddenException('Your marks have not been released yet');
      }
    } else {
      await this.assertReportAccess(user, exam);
    }

    if (dto.type === 'individual' && !dto.studentPublicId) {
      throw new BadRequestException('studentPublicId is required for an individual report');
    }

    // Idempotent within an hour: reuse the same job/file rather than regenerating.
    const cacheKey = `report:cache:${exam.id}:${dto.type}:${dto.studentPublicId ?? 'all'}`;
    const existing = await this.redis.get(cacheKey);
    if (existing) {
      const job = await this.queue.getJob(existing);
      if (job) {
        const state = await job.getState();
        // Only reuse if still in-flight OR completed with files present.
        // If completed but files are missing (e.g. server restart mid-write), fall through to re-queue.
        if (state !== 'completed' || this.reportFilesExist(String(job.id))) {
          return { jobId: existing };
        }
        await this.redis.del(cacheKey);
      }
    }

    const job = await this.queue.add('generate', {
      examId: exam.id,
      examPublicId: exam.publicId,
      type: dto.type,
      studentPublicId: dto.studentPublicId ?? null,
      requestedByUserId: user.id,
    });
    await this.redis.set(cacheKey, String(job.id), 'EX', 3600);
    return { jobId: String(job.id) };
  }

  async status(jobId: string): Promise<{
    status: 'pending' | 'ready' | 'failed';
    downloads?: { excel: string; pdf: string };
    message?: string;
  }> {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new NotFoundException('Report job not found');
    const state = await job.getState();
    if (state === 'completed') {
      if (!this.reportFilesExist(jobId)) {
        return {
          status: 'failed',
          message: 'Report files were not found. Please generate the report again.',
        };
      }
      return {
        status: 'ready',
        downloads: {
          excel: this.signedUrl(jobId, 'xlsx'),
          pdf: this.signedUrl(jobId, 'pdf'),
        },
      };
    }
    if (state === 'failed') return { status: 'failed', message: job.failedReason };
    return { status: 'pending' };
  }

  private sign(jobId: string, format: string, exp: number): string {
    return createHmac('sha256', this.config.getOrThrow('SESSION_SECRET', { infer: true }))
      .update(`${jobId}.${format}.${exp}`)
      .digest('hex');
  }

  private signedUrl(jobId: string, format: 'xlsx' | 'pdf'): string {
    const exp = Date.now() + 60 * 60 * 1000;
    return `/api/v1/reports/${jobId}/download?format=${format}&exp=${exp}&sig=${this.sign(jobId, format, exp)}`;
  }

  /** Validates the signed URL and returns the on-disk file path for streaming. */
  resolveDownload(jobId: string, format: string, exp: string, sig: string): string {
    if (format !== 'xlsx' && format !== 'pdf') throw new BadRequestException('Invalid format');
    const expNum = Number(exp);
    if (!Number.isFinite(expNum) || Date.now() > expNum)
      throw new ForbiddenException('Download link expired');
    const expected = this.sign(jobId, format, expNum);
    const a = Buffer.from(sig ?? '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Invalid download signature');
    }
    const safeId = jobId.replace(/[^A-Za-z0-9_-]/g, '');
    const path = join(
      this.config.getOrThrow('STORAGE_DIR', { infer: true }),
      'reports',
      `${safeId}.${format}`,
    );
    if (!existsSync(path)) throw new NotFoundException('Report file not found');
    return path;
  }
}
