import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { lookup, type LookupType } from '@/db/schema/lookups';
import { audit } from '@/lib/audit';
import { slug } from '@/db/seed/lookups-data';

export async function getLookups(types: LookupType[], opts: { includeInactive?: boolean } = {}) {
  const rows = await db
    .select()
    .from(lookup)
    .where(
      opts.includeInactive ? inArray(lookup.type, types) : and(inArray(lookup.type, types), eq(lookup.active, true)),
    )
    .orderBy(asc(lookup.sort), asc(lookup.label));
  const out = {} as Record<LookupType, typeof rows>;
  for (const t of types) out[t] = rows.filter((r) => r.type === t);
  return out;
}

export const DESCRIPTION_MAX = 600;
const descriptionSchema = z.string().trim().max(DESCRIPTION_MAX, `A descrição aceita até ${DESCRIPTION_MAX} caracteres.`).transform((v) => v || null);

export async function addLookup(actorId: string, type: LookupType, label: string, description = '') {
  const clean = label.trim();
  if (!clean) return { ok: false as const, error: 'Informe o nome do item.' };
  const d = descriptionSchema.safeParse(description);
  if (!d.success) return { ok: false as const, error: d.error.issues[0].message };
  const code = slug(clean);
  const [dup] = await db.select().from(lookup).where(and(eq(lookup.type, type), eq(lookup.code, code))).limit(1);
  if (dup) return { ok: false as const, error: 'Já existe um item com esse nome.' };
  const [row] = await db.insert(lookup).values({ type, code, label: clean, description: d.data }).returning();
  await audit({ actorId, entity: 'lookup', entityId: row.id, action: 'create', diff: { after: { type, label: clean, description: d.data } } });
  return { ok: true as const };
}

/** Desativar não apaga histórico (RF-66). */
export async function setLookupActive(actorId: string, id: string, active: boolean) {
  await db.update(lookup).set({ active }).where(eq(lookup.id, id));
  await audit({ actorId, entity: 'lookup', entityId: id, action: 'update', diff: { after: { active } } });
}

/** Descrição do item: lida pela IA na Triagem para escolher objeto, pedido e tipo de tarefa e sugerir prazo. Só admin chama (a action exige). */
export async function updateLookupDescription(actorId: string, id: string, raw: string) {
  const d = descriptionSchema.safeParse(raw);
  if (!d.success) return { ok: false as const, error: d.error.issues[0].message };
  const [cur] = await db.select().from(lookup).where(eq(lookup.id, id));
  if (!cur) return { ok: false as const, error: 'Item não encontrado.' };
  if ((cur.description ?? null) === d.data) return { ok: true as const, changed: false };
  await db.update(lookup).set({ description: d.data }).where(eq(lookup.id, id));
  await audit({ actorId, entity: 'lookup', entityId: id, action: 'update', diff: { description: { before: cur.description ?? null, after: d.data } } });
  return { ok: true as const, changed: true };
}

/** Tipo de tarefa: prazo interno = prazo limite menos N dias úteis (vazio = sem regra). Só admin; audita. */
export async function setLookupInternalDays(actorId: string, id: string, raw: string) {
  const t = raw.trim();
  const n = t === '' ? null : Number(t);
  if (n !== null && (!Number.isInteger(n) || n < 1 || n > 60)) return { ok: false as const, error: 'Informe um número de dias úteis entre 1 e 60, ou deixe em branco.' };
  const [cur] = await db.select().from(lookup).where(eq(lookup.id, id));
  if (!cur) return { ok: false as const, error: 'Item não encontrado.' };
  if (cur.type !== 'task_type') return { ok: false as const, error: 'A regra de prazo interno vale só para tipos de tarefa.' };
  if ((cur.internalDays ?? null) === n) return { ok: true as const, changed: false };
  await db.update(lookup).set({ internalDays: n }).where(eq(lookup.id, id));
  await audit({ actorId, entity: 'lookup', entityId: id, action: 'update', diff: { internalDays: { before: cur.internalDays ?? null, after: n } } });
  return { ok: true as const, changed: true };
}
