import { Prisma } from '@prisma/client';

/**
 * Soft-delete is enforced globally here, not by remembering to add `deletedAt: null` in every
 * query (§4: "No exam data is ever hard-deleted"). The set of soft-deletable models is derived
 * from the schema at runtime (any model with a `deletedAt` field), so it can never drift.
 *
 * Behaviour on the extended client (PrismaService.db):
 *   - reads (findFirst/findMany/count/aggregate/groupBy) silently exclude soft-deleted rows;
 *   - findUnique/findUniqueOrThrow return null / throw P2025 for a soft-deleted row;
 *   - updateMany won't touch soft-deleted rows;
 *   - delete/deleteMany are rewritten to set `deletedAt = now()` (never a hard DELETE).
 * A caller can still reach deleted rows by passing an explicit `deletedAt` filter.
 *
 * Known limitation: nested relation reads via `include` are not auto-filtered — add an explicit
 * `where: { deletedAt: null }` in the include when that matters.
 */
const SOFT_DELETABLE: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'deletedAt'))
    .map((m) => m.name),
);

const delegateName = (model: string): string => model.charAt(0).toLowerCase() + model.slice(1);

function withNotDeleted(where: Record<string, unknown> | undefined): Record<string, unknown> {
  // Our default wins only when the caller didn't ask about deletedAt themselves.
  return { deletedAt: null, ...(where ?? {}) };
}

export const softDeleteExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: 'soft-delete',
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ model, operation, args, query }): Promise<any> {
          if (!model || !SOFT_DELETABLE.has(model)) return query(args);
          const a = (args ?? {}) as Record<string, any>;

          switch (operation) {
            case 'findFirst':
            case 'findFirstOrThrow':
            case 'findMany':
            case 'count':
            case 'aggregate':
            case 'groupBy':
            case 'updateMany':
              return query({ ...a, where: withNotDeleted(a.where) });

            case 'findUnique':
            case 'findUniqueOrThrow': {
              // findUnique can't take a non-unique where, so post-filter on the result.
              const needsSelectPatch = a.select && a.select.deletedAt !== true;
              const patched = needsSelectPatch
                ? { ...a, select: { ...a.select, deletedAt: true } }
                : a;
              const res = (await query(patched)) as Record<string, any> | null;
              if (res && res.deletedAt != null) {
                if (operation === 'findUniqueOrThrow') {
                  throw new Prisma.PrismaClientKnownRequestError('No record found', {
                    code: 'P2025',
                    clientVersion: Prisma.prismaVersion.client,
                  });
                }
                return null;
              }
              if (res && needsSelectPatch) delete res.deletedAt;
              return res;
            }

            case 'delete':
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return (client as any)[delegateName(model)].update({
                where: a.where,
                data: { deletedAt: new Date() },
              });

            case 'deleteMany':
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return (client as any)[delegateName(model)].updateMany({
                where: withNotDeleted(a.where),
                data: { deletedAt: new Date() },
              });

            default:
              return query(args);
          }
        },
      },
    },
  }),
);
