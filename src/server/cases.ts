import { and, desc, eq, exists, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { user } from '@/db/schema';
import { caseCivil, caseLabor, caseParty, caseProcon, caseRisk, cases, rentalLink } from '@/db/schema/case';
import { audit } from '@/lib/audit';
import { normalizeCaseNumber } from '@/lib/case-number';

const PAGE_SIZE = 20;

// ---------- validação (regras de negócio 1, 6, 7 e RF-48) ----------
const money = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : Number(v.replace(/\./g, '').replace(',', '.'))))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0), 'Valor inválido.');
const optText = z.string().trim().transform((v) => v || null);
const optId = z.string().trim().transform((v) => v || null);
const optDate = z.string().trim().transform((v) => v || null);

export const caseFormSchema = z
  .object({
    number: z.string().trim().min(5, 'Informe o número do processo.'),
    portfolio: z.enum(['civil', 'labor', 'procon']),
    systemId: optId,
    courtTypeId: optId,
    state: optText,
    city: optText,
    court: optText,
    ownerId: optId,
    receivedAt: optDate,
    citedAt: optDate,
    costCenter: optText,
    details: optText,
    plaintiff: optText,
    subjectId: optId,
    claimId: optId,
    prognosis: z.enum(['probable', 'possible', 'remote', '']).transform((v) => v || null),
    riskTotal: money,
    riskMaterial: money,
    riskMoral: money,
    claimValue: money,
    contractCode: optText,
  })
  .superRefine((d, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if ((d.riskMaterial ?? 0) + (d.riskMoral ?? 0) > (d.riskTotal ?? 0) + 0.001) {
      add('riskMaterial', 'Material + moral não pode passar do valor de risco total.');
    }
    if (d.contractCode && !/^[A-Z]{3}\d{6}-\d{2}$/.test(d.contractCode)) {
      add('contractCode', 'Contrato no formato AAA000000-00 (ex.: POA004871-26).');
    }
    if (d.portfolio === 'civil') {
      if (!d.ownerId) add('ownerId', 'Informe o(a) advogado(a) responsável.');
      if (!d.subjectId) add('subjectId', 'Informe o objeto.');
      if (!d.prognosis) add('prognosis', 'Informe o prognóstico.');
      if (d.riskTotal === null) add('riskTotal', 'Informe o valor de risco.');
    }
  });
export type CaseForm = z.infer<typeof caseFormSchema>;

const num = (v: number | null) => (v === null ? null : v.toFixed(2));

// ---------- consulta ----------
export type CaseFilters = {
  q?: string;
  portfolio?: string;
  status?: 'open' | 'closed' | 'all';
  prognosis?: string;
  subjectId?: string;
  state?: string;
  ownerId?: string;
  monitoring?: 'on' | 'off' | 'stale';
  page?: number;
};

const latestRisk = (alias = 'r') =>
  sql.raw(`(select distinct on (case_id) * from case_risk order by case_id, reviewed_at desc) ${alias}`);

export async function searchCases(f: CaseFilters, opts: { all?: boolean } = {}) {
  const conds: SQL[] = [isNull(cases.deletedAt)];
  const q = f.q?.trim();
  if (q) {
    const digits = normalizeCaseNumber(q);
    const like = `%${q}%`;
    conds.push(
      or(
        digits.length >= 4 ? ilike(cases.number, `%${digits}%`) : undefined,
        exists(db.select({ x: sql`1` }).from(caseParty).where(and(eq(caseParty.caseId, cases.id), ilike(caseParty.name, like)))),
        exists(
          db
            .select({ x: sql`1` })
            .from(rentalLink)
            .where(and(eq(rentalLink.caseId, cases.id), or(ilike(rentalLink.contractCode, like), ilike(rentalLink.plate, like)))),
        ),
      )!,
    );
  }
  if (f.portfolio) conds.push(eq(cases.portfolio, f.portfolio as 'civil'));
  if (f.status === 'closed') conds.push(sql`${cases.closedAt} is not null`);
  else if (f.status !== 'all') conds.push(isNull(cases.closedAt));
  if (f.state) conds.push(eq(cases.state, f.state));
  if (f.ownerId) conds.push(eq(cases.ownerId, f.ownerId));
  if (f.subjectId) conds.push(exists(db.select({ x: sql`1` }).from(caseCivil).where(and(eq(caseCivil.caseId, cases.id), eq(caseCivil.subjectId, f.subjectId)))));
  if (f.prognosis) {
    conds.push(
      sql`exists (select 1 from ${latestRisk('lr')} where lr.case_id = ${cases.id} and lr.prognosis = ${f.prognosis})`,
    );
  }
  if (f.monitoring === 'on') conds.push(eq(cases.monitoring, true));
  if (f.monitoring === 'off') conds.push(eq(cases.monitoring, false));
  if (f.monitoring === 'stale') {
    conds.push(isNull(cases.closedAt), sql`coalesce(${cases.lastMovementAt}, ${cases.createdAt}) < now() - interval '90 days'`);
  }

  const where = and(...conds);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(cases).where(where);
  // página além do fim cai na última (como nas outras listas)
  const page = Math.min(Math.max(1, f.page ?? 1), Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const rows = await db
    .select({
      id: cases.id,
      number: cases.number,
      portfolio: cases.portfolio,
      state: cases.state,
      city: cases.city,
      costCenter: cases.costCenter,
      closedAt: cases.closedAt,
      monitoring: cases.monitoring,
      lastMovementAt: cases.lastMovementAt,
      createdAt: cases.createdAt,
      ownerName: user.name,
      subjectId: caseCivil.subjectId,
      plaintiff: sql<string | null>`(select name from case_party p where p.case_id = ${cases.id} and p.role = 'plaintiff' limit 1)`,
      prognosis: sql<string | null>`(select prognosis from case_risk r where r.case_id = ${cases.id} order by reviewed_at desc limit 1)`,
      riskTotal: sql<string | null>`(select risk_total from case_risk r where r.case_id = ${cases.id} order by reviewed_at desc limit 1)`,
    })
    .from(cases)
    .leftJoin(user, eq(user.id, cases.ownerId))
    .leftJoin(caseCivil, eq(caseCivil.caseId, cases.id))
    .where(where)
    .orderBy(desc(cases.createdAt))
    .limit(opts.all ? 50_000 : PAGE_SIZE)
    .offset(opts.all ? 0 : (page - 1) * PAGE_SIZE);
  return { rows, total, page, pageSize: PAGE_SIZE };
}

export async function getCase(id: string) {
  const [c] = await db.select().from(cases).where(and(eq(cases.id, id), isNull(cases.deletedAt))).limit(1);
  if (!c) return null;
  const [civil] = await db.select().from(caseCivil).where(eq(caseCivil.caseId, id));
  const [labor] = await db.select().from(caseLabor).where(eq(caseLabor.caseId, id));
  const [procon] = await db.select().from(caseProcon).where(eq(caseProcon.caseId, id));
  const parties = await db.select().from(caseParty).where(eq(caseParty.caseId, id));
  const risks = await db.select().from(caseRisk).where(eq(caseRisk.caseId, id)).orderBy(desc(caseRisk.reviewedAt));
  const rentals = await db.select().from(rentalLink).where(eq(rentalLink.caseId, id));
  const [owner] = c.ownerId ? await db.select({ name: user.name }).from(user).where(eq(user.id, c.ownerId)) : [];
  return { case: c, civil, labor, procon, parties, risks, risk: risks[0], rentals, ownerName: owner?.name ?? null };
}

// ---------- escrita ----------
export async function createCase(actorId: string, d: CaseForm): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const number = normalizeCaseNumber(d.number);
  // um número nunca pode virar dois processos, mesmo em carteira diferente (RF-104/regra do CNJ: o número já identifica o processo real)
  const [dup] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.number, number), isNull(cases.deletedAt)))
    .limit(1);
  if (dup) return { ok: false, error: 'Já existe um processo com esse número (pode estar em outra carteira).' };

  const id = await db.transaction(async (tx) => {
    const [c] = await tx
      .insert(cases)
      .values({
        number, portfolio: d.portfolio, systemId: d.systemId, courtTypeId: d.courtTypeId,
        state: d.state?.toUpperCase() ?? null, city: d.city, court: d.court, ownerId: d.ownerId,
        receivedAt: d.receivedAt, citedAt: d.citedAt, costCenter: d.costCenter?.toUpperCase() ?? null,
        details: d.details, source: 'manual',
      })
      .returning({ id: cases.id });
    if (d.portfolio === 'civil') await tx.insert(caseCivil).values({ caseId: c.id, subjectId: d.subjectId, claimId: d.claimId });
    if (d.portfolio === 'labor') await tx.insert(caseLabor).values({ caseId: c.id });
    if (d.portfolio === 'procon') await tx.insert(caseProcon).values({ caseId: c.id });
    if (d.plaintiff) await tx.insert(caseParty).values({ caseId: c.id, role: 'plaintiff', name: d.plaintiff });
    if (d.prognosis || d.riskTotal !== null || d.claimValue !== null) {
      await tx.insert(caseRisk).values({
        caseId: c.id, prognosis: d.prognosis, riskTotal: num(d.riskTotal), riskMaterial: num(d.riskMaterial),
        riskMoral: num(d.riskMoral), claimValue: num(d.claimValue), reviewedBy: actorId,
      });
    }
    if (d.contractCode) await tx.insert(rentalLink).values({ caseId: c.id, contractCode: d.contractCode });
    return c.id;
  });
  await audit({ actorId, entity: 'case', entityId: id, action: 'create', diff: { after: { number, portfolio: d.portfolio } } });
  return { ok: true, id };
}

const editSchema = z.object({
  ownerId: optId, systemId: optId, courtTypeId: optId, state: optText, city: optText, court: optText,
  costCenter: optText, details: optText, receivedAt: optDate, citedAt: optDate,
});

export async function updateCaseData(actorId: string, id: string, raw: Record<string, FormDataEntryValue>) {
  const parsed = editSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const [before] = await db.select().from(cases).where(eq(cases.id, id));
  if (!before) return { ok: false as const, error: 'Processo não encontrado.' };
  const d = parsed.data;
  const patch = { ...d, state: d.state?.toUpperCase() ?? null, costCenter: d.costCenter?.toUpperCase() ?? null };
  await db.update(cases).set(patch).where(eq(cases.id, id));
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const [k, v] of Object.entries(patch)) {
    const old = (before as Record<string, unknown>)[k] ?? null;
    if (old !== v) diff[k] = { before: old, after: v };
  }
  if (Object.keys(diff).length) await audit({ actorId, entity: 'case', entityId: id, action: 'update', diff });
  return { ok: true as const };
}

/** RF-42: revisão de prognóstico gera nova linha; a vigente é a mais recente. */
export async function reviewRisk(
  actorId: string,
  caseId: string,
  raw: { prognosis: string; riskTotal: string; riskMaterial: string; riskMoral: string; claimValue: string; settlementLimit: string },
) {
  const schema = z.object({
    prognosis: z.enum(['probable', 'possible', 'remote']),
    riskTotal: money, riskMaterial: money, riskMoral: money, claimValue: money, settlementLimit: money,
  });
  const p = schema.safeParse(raw);
  if (!p.success) return { ok: false as const, error: 'Confira o prognóstico e os valores.' };
  const d = p.data;
  if ((d.riskMaterial ?? 0) + (d.riskMoral ?? 0) > (d.riskTotal ?? 0) + 0.001) {
    return { ok: false as const, error: 'Material + moral não pode passar do valor de risco total.' };
  }
  const [before] = await db.select().from(caseRisk).where(eq(caseRisk.caseId, caseId)).orderBy(desc(caseRisk.reviewedAt)).limit(1);
  await db.insert(caseRisk).values({
    caseId, prognosis: d.prognosis, riskTotal: num(d.riskTotal), riskMaterial: num(d.riskMaterial),
    riskMoral: num(d.riskMoral), claimValue: num(d.claimValue), settlementLimit: num(d.settlementLimit), reviewedBy: actorId,
  });
  await audit({
    actorId, entity: 'case_risk', entityId: caseId, action: 'update',
    diff: { before: before ?? null, after: { ...d } },
  });
  return { ok: true as const };
}

/** RF-47: encerrar exige motivo e data. */
export async function closeCase(actorId: string, id: string, closingReasonId: string, closedAt: string) {
  if (!closingReasonId || !closedAt) return { ok: false as const, error: 'Informe o motivo e a data de encerramento.' };
  await db
    .update(cases)
    .set({ closingReasonId, closedAt, monitoring: false }) // encerrar desliga o monitoramento (RF-34)
    .where(eq(cases.id, id));
  await audit({ actorId, entity: 'case', entityId: id, action: 'update', diff: { after: { closingReasonId, closedAt, monitoring: false } } });
  return { ok: true as const };
}

export async function reopenCase(actorId: string, id: string) {
  await db.update(cases).set({ closingReasonId: null, closedAt: null }).where(eq(cases.id, id));
  await audit({ actorId, entity: 'case', entityId: id, action: 'update', diff: { after: { closedAt: null } } });
}

export async function setMonitoring(actorId: string, id: string, on: boolean) {
  await db.update(cases).set({ monitoring: on }).where(eq(cases.id, id));
  await audit({ actorId, entity: 'case', entityId: id, action: 'update', diff: { after: { monitoring: on } } });
}

/** RF-72: exclusão lógica, só admin (checado na action). */
export async function softDeleteCase(actorId: string, id: string) {
  await db.update(cases).set({ deletedAt: new Date() }).where(eq(cases.id, id));
  await audit({ actorId, entity: 'case', entityId: id, action: 'delete' });
}

export async function caseHistory(id: string) {
  const { auditLog } = await import('@/db/schema');
  return db
    .select({ id: auditLog.id, at: auditLog.at, action: auditLog.action, diff: auditLog.diff, entity: auditLog.entity, actor: user.name })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorId))
    .where(and(eq(auditLog.entityId, id), or(eq(auditLog.entity, 'case'), eq(auditLog.entity, 'case_risk'))))
    .orderBy(desc(auditLog.at));
}
