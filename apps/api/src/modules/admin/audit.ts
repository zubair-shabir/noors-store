import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../lib/prisma.js';

type Db = PrismaClient | Prisma.TransactionClient;

/** Records an admin action, e.g. audit(db, adminId, 'update', 'product', id, { fields }). */
export function audit(
  db: Db,
  adminUserId: string,
  action: string,
  entity: string,
  entityId: string,
  data?: Prisma.InputJsonValue,
) {
  return db.auditLog.create({ data: { adminUserId, action, entity, entityId, data } });
}
