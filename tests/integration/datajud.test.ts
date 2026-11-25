import 'dotenv/config';
import { and, eq, gte, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * DataJud pelo runner com o banco real e o CNJ simulado: ingere só movimentação recente, não duplica,
 * e uma execução em que um tribunal falha fica "parcial" sem perder o que veio dos outros.
 */
const num = (n: number, j = '8', tr = '21') => `9994${String(n).padStart(3, '0')}00202${6}${j}${tr}0001`; // 20 dígitos
const startedAt = new Date();
const saved = process.env.DATAJUD_API_KEY;
let adminId: string;

async function limpa() {
  const { db } = await import('@/db');
  const { cases, caseProcon, caseParty, caseRisk } = await import('@/db/schema/case');
  const { movement } = await import('@/db/schema/movement');
  const { connectorRun } = await import('@/db/schema/inbox');
  const ids = (await db.select({ id: cases.id }).from(cases).where(like(cases.number, '9994%'))).map((c) => c.id);
  if (ids.length) {
    await db.delete(movement).where(inArray(movement.caseId, ids));
    await db.delete(caseProcon).where(inArray(caseProcon.caseId, ids));
    await db.delete(caseParty).where(inArray(caseParty.caseId, ids));
    await db.delete(caseRisk).where(inArray(caseRisk.caseId, ids));
    await db.delete(cases).where(inArray(cases.id, ids));
  }
  await db.delete(connectorRun).where(and(eq(connectorRun.connector, 'datajud'), gte(connectorRun.startedAt, startedAt)));
}

beforeAll(async () => {
  process.env.DATAJUD_API_KEY = 'chave-de-teste';
  const { db } = await import('@/db');
  const { user } = await import('@/db/schema');
  const [a] = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);
  adminId = a.id;
  await limpa();
});
afterAll(async () => {
  await limpa();
  if (saved === undefined) delete process.env.DATAJUD_API_KEY; else process.env.DATAJUD_API_KEY = saved;
  const { pool } = await import('@/db');
  await pool.end();
});

describe('DataJud pelo runner', () => {
  it('ingere só a movimentação recente, não duplica e marca a execução como parcial se um tribunal falha', async () => {
    const { createCase, caseFormSchema } = await import('@/server/cases');
    const { db } = await import('@/db');
    const { movement } = await import('@/db/schema/movement');
    const { connectorRun } = await import('@/db/schema/inbox');
    const { runConnector } = await import('@/lib/connectors/runner');
    const { datajud } = await import('@/lib/connectors/datajud');

    const mk = async (number: string) => {
      const p = caseFormSchema.parse({
        number, portfolio: 'procon', systemId: '', courtTypeId: '', state: 'RS', city: '', court: '', ownerId: '', receivedAt: '', citedAt: '',
        costCenter: '', details: '', plaintiff: 'Parte Teste', subjectId: '', claimId: '', prognosis: '', riskTotal: '', riskMaterial: '', riskMoral: '', claimValue: '', contractCode: '',
      });
      const r = await createCase(adminId, p);
      if (!r.ok) throw new Error(r.error);
      return r.id;
    };
    const rsNumber = num(1); // tjrs
    const trtNumber = num(2, '5', '01'); // trt1: este tribunal vai falhar
    const rsCase = await mk(rsNumber);
    await mk(trtNumber);

    const recente = new Date(Date.now() - 86_400_000).toISOString();
    const antiga = new Date(Date.now() - 40 * 86_400_000).toISOString();
    let chamadas = 0;
    const fetchFn = (async (url: string, init: RequestInit) => {
      chamadas++;
      if (String(url).includes('trt1')) return new Response('indisponivel', { status: 503 });
      const pedido = JSON.parse(String(init.body)).query.terms.numeroProcesso as string[];
      const hits = pedido.includes(rsNumber)
        ? [{ _source: { numeroProcesso: rsNumber, movimentos: [
            { codigo: 26, nome: 'Distribuição', dataHora: antiga },
            { codigo: 60, nome: 'Juntada de petição', dataHora: recente },
          ] } }]
        : [];
      return new Response(JSON.stringify({ timed_out: false, _shards: { total: 1, failed: 0 }, hits: { hits } }));
    }) as unknown as typeof fetch;
    const sleep = async () => undefined; // sem esperar de verdade nas tentativas

    const r1 = await runConnector(datajud, { fetchFn, sleep, enrich: false });
    expect(r1).toMatchObject({ status: 'ok', found: 1, created: 1 });
    expect((r1 as { warnings: string[] }).warnings.join(' ')).toMatch(/trt1.*503/);

    const movs = await db.select().from(movement).where(eq(movement.caseId, rsCase));
    expect(movs).toHaveLength(1); // só a recente; o histórico de 40 dias ficou de fora
    expect(movs[0]).toMatchObject({ source: 'datajud', title: 'Juntada de petição', triageStatus: 'pending' });

    const run = (await db.select().from(connectorRun).where(and(eq(connectorRun.connector, 'datajud'), gte(connectorRun.startedAt, startedAt))))[0];
    expect(run.status).toBe('partial'); // falhou um tribunal, mas o outro foi aproveitado
    expect(run.error).toMatch(/trt1/);

    // repetir não duplica
    const antes = chamadas;
    const r2 = await runConnector(datajud, { fetchFn, sleep, enrich: false });
    expect(r2).toMatchObject({ status: 'ok', created: 0 });
    expect(chamadas).toBeGreaterThan(antes);
    expect(await db.select().from(movement).where(eq(movement.caseId, rsCase))).toHaveLength(1);
  });

  it('sem chave configurada, não consulta e explica o que falta', async () => {
    const { runConnector } = await import('@/lib/connectors/runner');
    const { datajud } = await import('@/lib/connectors/datajud');
    delete process.env.DATAJUD_API_KEY;
    let chamou = false;
    const r = await runConnector(datajud, { fetchFn: (async () => { chamou = true; return new Response('{}'); }) as unknown as typeof fetch });
    process.env.DATAJUD_API_KEY = 'chave-de-teste';
    expect(chamou).toBe(false);
    expect(r).toMatchObject({ status: 'not_configured' });
  });
});
