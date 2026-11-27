import 'dotenv/config';
import { and, eq, isNull, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Regra (27/11/2026): um número de processo nunca pode virar duas linhas em `case`, nem em carteiras diferentes —
 * o número já identifica o processo real, a carteira é só uma classificação. Cobre o índice único (`case_number_uq`,
 * parcial por `deleted_at`), `createCase` (cadastro manual/Triagem) e `registerOngoingCase` (DJEN/Projuris).
 */
const TAG = 'TESTE-DUP';
const NUM = `9994${String(Date.now()).slice(-9)}1120268210001`;
let adminId: string;

async function limpa() {
  const { db } = await import('@/db');
  const { cases, caseCivil, caseLabor, caseProcon } = await import('@/db/schema/case');
  const rows = await db.select({ id: cases.id }).from(cases).where(like(cases.number, '9994%'));
  for (const r of rows) {
    await db.delete(caseCivil).where(eq(caseCivil.caseId, r.id));
    await db.delete(caseLabor).where(eq(caseLabor.caseId, r.id));
    await db.delete(caseProcon).where(eq(caseProcon.caseId, r.id));
  }
  await db.delete(cases).where(like(cases.number, '9994%'));
}

beforeAll(async () => {
  await limpa();
  const { db } = await import('@/db');
  const { user } = await import('@/db/schema');
  const [a] = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);
  adminId = a.id;
});
afterAll(limpa);

describe('número de processo nunca duplica entre carteiras', () => {
  it('createCase recusa o mesmo número numa carteira diferente da já cadastrada', async () => {
    const { createCase } = await import('@/server/cases');
    const base = { number: NUM, systemId: null, courtTypeId: null, state: null, city: null, court: null, ownerId: null, receivedAt: null, citedAt: null, costCenter: null, details: null, plaintiff: null, subjectId: null, claimId: null, prognosis: null, riskTotal: null, riskMaterial: null, riskMoral: null, claimValue: null, contractCode: null };
    const a = await createCase(adminId, { ...base, portfolio: 'civil' } as never);
    expect(a.ok).toBe(true);
    const b = await createCase(adminId, { ...base, portfolio: 'labor' } as never); // mesmo número, carteira diferente
    expect(b).toMatchObject({ ok: false, error: expect.stringMatching(/Já existe um processo com esse número/) });
    const { db } = await import('@/db');
    const { cases } = await import('@/db/schema/case');
    expect(await db.select().from(cases).where(eq(cases.number, NUM))).toHaveLength(1);
  });

  it('o índice do banco também impede (defesa em profundidade, mesmo pulando a checagem da aplicação)', async () => {
    const { db } = await import('@/db');
    const { cases } = await import('@/db/schema/case');
    let falhou = false;
    try {
      await db.insert(cases).values({ number: NUM, portfolio: 'procon' });
    } catch (e) {
      falhou = true;
      expect(String((e as { cause?: unknown }).cause ?? e)).toMatch(/case_number_uq|duplicate key/i);
    }
    expect(falhou).toBe(true);
  });

  it('depois de excluído logicamente, o número pode ser reaproveitado (regra 7)', async () => {
    const { db } = await import('@/db');
    const { cases } = await import('@/db/schema/case');
    await db.update(cases).set({ deletedAt: new Date() }).where(eq(cases.number, NUM));
    const { createCase } = await import('@/server/cases');
    const r = await createCase(adminId, { number: NUM, portfolio: 'procon', systemId: null, courtTypeId: null, state: null, city: null, court: null, ownerId: null, receivedAt: null, citedAt: null, costCenter: null, details: null, plaintiff: null, subjectId: null, claimId: null, prognosis: null, riskTotal: null, riskMaterial: null, riskMoral: null, claimValue: null, contractCode: null } as never);
    expect(r.ok).toBe(true);
    expect(await db.select().from(cases).where(and(eq(cases.number, NUM), isNull(cases.deletedAt)))).toHaveLength(1);
  });

  it('registerOngoingCase (DJEN/Projuris) nunca cria um segundo processo pro mesmo número', async () => {
    const { db } = await import('@/db');
    const { cases, caseCivil } = await import('@/db/schema/case');
    const n2 = `9994${NUM.slice(4, 13)}9998210001`;
    await db.insert(cases).values({ number: n2, portfolio: 'civil', source: 'manual' });
    const [c] = await db.select().from(cases).where(eq(cases.number, n2));
    await db.insert(caseCivil).values({ caseId: c.id });
    const { registerOngoingCase } = await import('@/server/auto-register');
    const r = await registerOngoingCase({ source: 'djen_term', caseNumber: n2, externalId: `${TAG}-x`, parsed: { portfolio: 'labor' } }); // mesma coisa, carteira "detectada" diferente
    expect(r.createdCase).toBe(false);
    expect(r.caseId).toBe(c.id);
    expect(await db.select().from(cases).where(eq(cases.number, n2))).toHaveLength(1);
  });
});
