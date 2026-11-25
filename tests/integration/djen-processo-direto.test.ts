import 'dotenv/config';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Tudo que o DJEN traz já é processo em andamento: entra direto em Processos; só as atualizações seguintes viram alerta. */
const PFX = '99822';
const num = (nn: number, j = '8') => `${PFX}${String(nn).padStart(2, '0')}022026${j}010001`;
const fmt = (d: string) => `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
const TERM = 'FOCO TESTEDJ';
const pub = (id: string, n: string, nome = TERM) => ({
  id, numero_processo: fmt(n), texto: `Texto ${id}`, tipoComunicacao: 'Intimação', data_disponibilizacao: '2026-11-13', siglaTribunal: 'TJRS', nomeOrgao: '1ª Vara', destinatarios: [{ nome }],
});
const fetchOf = (items: unknown[]) => (async () => new Response(JSON.stringify({ items }))) as unknown as typeof fetch;

async function limpa() {
  const { db } = await import('@/db');
  const { sql } = await import('drizzle-orm');
  const { cases } = await import('@/db/schema/case');
  const { inboxItem, monitoredTerm } = await import('@/db/schema/inbox');
  const { movement } = await import('@/db/schema/movement');
  await db.execute(sql`delete from movement where case_id in (select id from "case" where number like ${PFX + '%'})`);
  await db.delete(movement).where(like(movement.externalId, 'djen:dd-%'));
  for (const t of ['case_civil', 'case_labor', 'case_procon', 'case_party']) {
    await db.execute(sql.raw(`delete from ${t} where case_id in (select id from "case" where number like '${PFX}%')`));
  }
  await db.delete(inboxItem).where(like(inboxItem.caseNumber, `${PFX}%`));
  await db.execute(sql`delete from audit_log where entity = 'case' and entity_id in (select id::text from "case" where number like ${PFX + '%'})`);
  await db.delete(cases).where(like(cases.number, `${PFX}%`));
  await db.delete(monitoredTerm).where(eq(monitoredTerm.term, TERM));
}

beforeAll(async () => {
  const { db } = await import('@/db');
  const { monitoredTerm } = await import('@/db/schema/inbox');
  await limpa();
  await db.insert(monitoredTerm).values({ term: TERM, kind: 'name', document: null });
  delete process.env.DJEN_AUTO_REGISTER;
});
afterAll(async () => { delete process.env.DJEN_AUTO_REGISTER; await limpa(); });

describe('DJEN: processo entra direto em Processos', () => {
  it('cria o processo (carteira pelo número); as publicações que o trouxeram ficam como histórico lido, sem alerta, e nada vai para a Triagem', async () => {
    const { runConnector } = await import('@/lib/connectors/runner');
    const { djen } = await import('@/lib/connectors/djen');
    const { db } = await import('@/db');
    const { cases } = await import('@/db/schema/case');
    const { movement } = await import('@/db/schema/movement');
    const { inboxItem } = await import('@/db/schema/inbox');

    // duas publicações do mesmo processo novo na mesma rodada, e um processo trabalhista
    const items = [pub('dd-1', num(1, '8')), pub('dd-2', num(1, '8')), pub('dd-3', num(2, '5'))];
    const r = await runConnector(djen, { fetchFn: fetchOf(items), enrich: false, termFilter: (t) => t.term === TERM });
    expect(r.status).toBe('ok');

    const [c1] = await db.select().from(cases).where(eq(cases.number, num(1, '8')));
    expect(c1).toMatchObject({ portfolio: 'civil', source: 'djen_term', monitoring: true, state: 'RS', court: '1ª Vara' });
    const [c2] = await db.select().from(cases).where(eq(cases.number, num(2, '5')));
    expect(c2.portfolio).toBe('labor'); // justiça do trabalho (J = 5)

    const m1 = await db.select().from(movement).where(eq(movement.caseId, c1.id));
    expect(m1).toHaveLength(2);
    expect(m1.every((m) => m.triageStatus === 'linked' && m.readAt !== null)).toBe(true); // histórico lido: não é alerta
    expect(await db.select().from(inboxItem).where(like(inboxItem.caseNumber, `${PFX}%`))).toHaveLength(0); // nada esperando na Triagem

    // reexecutar não duplica
    await runConnector(djen, { fetchFn: fetchOf(items), enrich: false, termFilter: (t) => t.term === TERM });
    expect(await db.select().from(cases).where(like(cases.number, `${PFX}%`))).toHaveLength(2);
    expect(await db.select().from(movement).where(eq(movement.caseId, c1.id))).toHaveLength(2);
  });

  it('cada publicação NOVA de um processo que já está em Processos vira alerta', async () => {
    const { runConnector } = await import('@/lib/connectors/runner');
    const { djen } = await import('@/lib/connectors/djen');
    const { db } = await import('@/db');
    const { cases } = await import('@/db/schema/case');
    const { movement } = await import('@/db/schema/movement');
    await runConnector(djen, { fetchFn: fetchOf([pub('dd-4', num(1, '8'))]), enrich: false, termFilter: (t) => t.term === TERM });
    const [c] = await db.select().from(cases).where(eq(cases.number, num(1, '8')));
    const movs = await db.select().from(movement).where(eq(movement.caseId, c.id));
    expect(movs).toHaveLength(3);
    const novo = movs.find((m) => m.externalId === 'djen:dd-4')!;
    expect(novo).toMatchObject({ triageStatus: 'pending', readAt: null }); // este é alerta
    expect(await db.select().from(cases).where(eq(cases.number, num(1, '8')))).toHaveLength(1);
  });

  it('parte duvidosa NÃO vira processo sozinha: vai à Triagem para uma advogada confirmar', async () => {
    const { runConnector } = await import('@/lib/connectors/runner');
    const { djen } = await import('@/lib/connectors/djen');
    const { db } = await import('@/db');
    const { cases } = await import('@/db/schema/case');
    const { inboxItem } = await import('@/db/schema/inbox');
    await runConnector(djen, { fetchFn: fetchOf([pub('dd-5', num(3), 'FOCO TESTEDJ COMERCIO DE PECAS LTDA')]), enrich: false, termFilter: (t) => t.term === TERM });
    expect(await db.select().from(cases).where(eq(cases.number, num(3)))).toHaveLength(0);
    const box = await db.select().from(inboxItem).where(eq(inboxItem.caseNumber, num(3)));
    expect(box).toHaveLength(1);
    expect((box[0].parsed as { obtainedBy: string }).obtainedBy).toMatch(/^Conferir parte/);
  });

  it('com DJEN_AUTO_REGISTER=false tudo vai para a Triagem, como antes', async () => {
    process.env.DJEN_AUTO_REGISTER = 'false';
    const { runConnector } = await import('@/lib/connectors/runner');
    const { djen } = await import('@/lib/connectors/djen');
    const { db } = await import('@/db');
    const { cases } = await import('@/db/schema/case');
    const { inboxItem } = await import('@/db/schema/inbox');
    await runConnector(djen, { fetchFn: fetchOf([pub('dd-6', num(4))]), enrich: false, termFilter: (t) => t.term === TERM });
    expect(await db.select().from(cases).where(eq(cases.number, num(4)))).toHaveLength(0);
    expect(await db.select().from(inboxItem).where(eq(inboxItem.caseNumber, num(4)))).toHaveLength(1);
  });

  it('o item que já esperava na Triagem passa a ser do processo criado, sem gerar alerta', async () => {
    const { registerOngoingCase } = await import('@/server/auto-register');
    const { addInboxItem } = await import('@/server/inbox');
    const { db } = await import('@/db');
    const { cases } = await import('@/db/schema/case');
    const { inboxItem } = await import('@/db/schema/inbox');
    const { movement } = await import('@/db/schema/movement');
    const publications = [{ id: 'dd-7', data: '2026-11-10', tipo: 'Intimação', orgao: 'Vara', texto: 'Texto antigo', link: '' }];
    await addInboxItem({ source: 'djen_term', caseNumber: num(5), externalId: 'djen:dd-7', payload: { publications }, parsed: { portfolio: 'civil' } });
    const r = await registerOngoingCase({ source: 'djen_term', caseNumber: num(5), externalId: 'djen:dd-7', payload: { publications }, parsed: { portfolio: 'civil' } });
    expect(r.createdCase).toBe(true);
    const [c] = await db.select().from(cases).where(eq(cases.number, num(5)));
    const movs = await db.select().from(movement).where(eq(movement.caseId, c.id));
    expect(movs).toHaveLength(1);
    expect(movs[0].triageStatus).toBe('linked');
    const [it] = await db.select().from(inboxItem).where(eq(inboxItem.caseNumber, num(5)));
    expect(it).toMatchObject({ status: 'confirmed', caseId: c.id });
  });
});
