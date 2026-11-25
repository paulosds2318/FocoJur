import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { financialEntry, type FinancialKind } from '@/db/schema/financial';
import { audit } from '@/lib/audit';

export const FINANCIAL_KINDS: [FinancialKind, string][] = [
  ['judgment', 'Condenação'],
  ['settlement', 'Acordo'],
  ['court_fees', 'Custas'],
  ['deposit', 'Depósito judicial'],
  ['attorney_fees', 'Honorários'],
  ['correspondent', 'Correspondente'],
  ['external_firm', 'Escritório externo'],
];
export const KIND_LABEL = Object.fromEntries(FINANCIAL_KINDS) as Record<FinancialKind, string>;

const entrySchema = z.object({
  kind: z.enum(['judgment', 'settlement', 'court_fees', 'deposit', 'attorney_fees', 'correspondent', 'external_firm']),
  amount: z
    .string()
    .trim()
    .transform((v) => Number(v.replace(/\./g, '').replace(',', '.')))
    .refine((v) => Number.isFinite(v) && v > 0, 'Informe um valor maior que zero.'),
  paidAt: z.string().trim().transform((v) => v || null),
  sensTicket: z.string().trim().transform((v) => v || null),
  notes: z.string().trim().transform((v) => v || null),
});

export function listEntries(caseId: string) {
  return db
    .select()
    .from(financialEntry)
    .where(and(eq(financialEntry.caseId, caseId), isNull(financialEntry.deletedAt)))
    .orderBy(desc(sql`coalesce(${financialEntry.paidAt}, ${financialEntry.createdAt}::date)`), desc(financialEntry.createdAt));
}

export async function addEntry(actorId: string, caseId: string, raw: Record<string, FormDataEntryValue>) {
  const p = entrySchema.safeParse(raw);
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message };
  const [row] = await db
    .insert(financialEntry)
    .values({ caseId, ...p.data, amount: p.data.amount.toFixed(2) })
    .returning({ id: financialEntry.id });
  await audit({ actorId, entity: 'financial_entry', entityId: row.id, action: 'create', diff: { after: { caseId, ...p.data } } });
  return { ok: true as const };
}

/** RF-72: exclusão lógica; só admin (checado na action). */
export async function deleteEntry(actorId: string, entryId: string) {
  const [row] = await db.update(financialEntry).set({ deletedAt: new Date() }).where(eq(financialEntry.id, entryId)).returning();
  if (row) await audit({ actorId, entity: 'financial_entry', entityId: entryId, action: 'delete', diff: { before: { kind: row.kind, amount: row.amount } } });
}

/** Total pago = lançamentos com data de pagamento (condenação e acordo pagos, custas, honorários etc.). */
export function totalPaid(entries: { amount: string; paidAt: string | null }[]) {
  return entries.filter((e) => e.paidAt).reduce((s, e) => s + Number(e.amount), 0);
}
