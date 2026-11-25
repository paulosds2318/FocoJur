import { db } from '@/db';
import { auditLog } from '@/db/schema';

export type AuditInput = {
  actorId?: string | null;
  entity: string;
  entityId?: string | null;
  action: string;
  diff?: unknown;
};

export async function audit(input: AuditInput) {
  await db.insert(auditLog).values({
    actorId: input.actorId ?? null,
    entity: input.entity,
    entityId: input.entityId ?? null,
    action: input.action,
    diff: input.diff ?? null,
  });
}
