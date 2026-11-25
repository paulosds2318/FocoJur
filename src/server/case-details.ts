import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { caseCivil, caseParty, rentalLink } from '@/db/schema/case';
import { audit } from '@/lib/audit';

// ---------- ficha: causa raiz, partes e contrato ----------
export async function updateRootCause(
  actorId: string,
  caseId: string,
  raw: { avoidable: string; rootCauseArea: string; rootCause: string },
) {
  const avoidable = raw.avoidable === 'true' ? true : raw.avoidable === 'false' ? false : null;
  const patch = { avoidable, rootCauseArea: raw.rootCauseArea.trim() || null, rootCause: raw.rootCause.trim() || null };
  const [before] = await db.select().from(caseCivil).where(eq(caseCivil.caseId, caseId));
  if (!before) return { ok: false as const, error: 'A causa raiz existe só para processos cíveis.' };
  await db.update(caseCivil).set(patch).where(eq(caseCivil.caseId, caseId));
  await audit({
    actorId, entity: 'case', entityId: caseId, action: 'update',
    diff: { avoidable: { before: before.avoidable, after: avoidable }, rootCause: { before: before.rootCause, after: patch.rootCause } },
  });
  return { ok: true as const };
}

export async function addParty(
  actorId: string,
  caseId: string,
  raw: { role: string; name: string; document: string; lawyerName: string },
) {
  const role = z.enum(['plaintiff', 'defendant', 'other_defendant']).safeParse(raw.role);
  if (!role.success || !raw.name.trim()) return { ok: false as const, error: 'Informe o polo e o nome da parte.' };
  const [row] = await db
    .insert(caseParty)
    .values({ caseId, role: role.data, name: raw.name.trim(), document: raw.document.trim() || null, lawyerName: raw.lawyerName.trim() || null })
    .returning();
  await audit({ actorId, entity: 'case', entityId: caseId, action: 'update', diff: { partyAdded: { after: { role: role.data, name: row.name } } } });
  return { ok: true as const };
}

export async function removeParty(actorId: string, caseId: string, partyId: string) {
  const [row] = await db.delete(caseParty).where(and(eq(caseParty.id, partyId), eq(caseParty.caseId, caseId))).returning();
  if (row) await audit({ actorId, entity: 'case', entityId: caseId, action: 'update', diff: { partyRemoved: { before: { role: row.role, name: row.name } } } });
  return { ok: true as const };
}

/** Regra 7: o código segue o padrão e só fica "validado" após consulta ao sistema de locação (etapa 1b). */
export async function addRental(
  actorId: string,
  caseId: string,
  raw: { contractCode: string; store: string; plate: string; vehicleModel: string; rentalType: string },
) {
  const code = raw.contractCode.trim().toUpperCase();
  if (!/^[A-Z]{3}\d{6}-\d{2}$/.test(code)) return { ok: false as const, error: 'Contrato no formato AAA000000-00 (ex.: POA004871-26).' };
  const [dup] = await db
    .select({ id: rentalLink.id })
    .from(rentalLink)
    .where(and(eq(rentalLink.caseId, caseId), eq(rentalLink.contractCode, code)))
    .limit(1);
  if (dup) return { ok: false as const, error: 'Esse contrato já está vinculado ao processo.' };
  await db.insert(rentalLink).values({
    caseId, contractCode: code, store: raw.store.trim().toUpperCase() || null, plate: raw.plate.trim().toUpperCase() || null,
    vehicleModel: raw.vehicleModel.trim() || null, rentalType: raw.rentalType.trim() || null, source: 'manual',
  });
  await audit({ actorId, entity: 'case', entityId: caseId, action: 'update', diff: { rentalAdded: { after: { contractCode: code } } } });
  return { ok: true as const };
}

export async function removeRental(actorId: string, caseId: string, rentalId: string) {
  const [row] = await db.delete(rentalLink).where(and(eq(rentalLink.id, rentalId), eq(rentalLink.caseId, caseId))).returning();
  if (row) await audit({ actorId, entity: 'case', entityId: caseId, action: 'update', diff: { rentalRemoved: { before: { contractCode: row.contractCode } } } });
  return { ok: true as const };
}
