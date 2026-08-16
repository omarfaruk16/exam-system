import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface AuditEntry {
  actorUserId?: number | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Append-only audit trail. Only ever inserts — there is no update/delete path in code, and
 * in production the DB role is granted INSERT/SELECT only on "AuditLog".
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Best-effort standalone write: a failed audit insert is logged but never breaks the request. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: this.toData(entry) });
    } catch (e) {
      this.logger.error(
        `Failed to write audit log (${entry.action} ${entry.entity}): ${(e as Error).message}`,
      );
    }
  }

  /** Transactional write — use inside a $transaction so the audit row commits atomically with the change. */
  async recordTx(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: this.toData(entry) });
  }

  private toData(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
    return {
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId != null ? String(entry.entityId) : null,
      beforeJson: entry.before == null ? undefined : (entry.before as Prisma.InputJsonValue),
      afterJson: entry.after == null ? undefined : (entry.after as Prisma.InputJsonValue),
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    };
  }
}
