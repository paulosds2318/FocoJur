import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { coverFromSource, lookupCaseCover } from '@/lib/connectors/datajud';

/** "Buscar no portal" sem adaptador: uma consulta curta ao DataJud, completando só campos vazios. */
const NUM = '99900770020268210099'; // 8.21 → tjrs
const json = (body: object, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const hits = (src?: object, shards = { total: 5, failed: 0 }) => json({ timed_out: false, _shards: shards, hits: { hits: src ? [{ _source: src }] : [] } });
const FULL = {
  numeroProcesso: NUM, classe: { codigo: 436, nome: 'Procedimento do Juizado Especial Cível' }, orgaoJulgador: { nome: '2º Juizado Especial Cível de Porto Alegre' },
  dataAjuizamento: '2026-03-10T00:00:00.000Z', assuntos: [{ codigo: 1, nome: 'Indenização por Dano Moral' }, { codigo: 2, nome: 'Outro' }], grau: 'JE', sistema: { nome: 'Eproc' },
};
const sleeps: number[] = [];
const sleep = async (ms: number) => { sleeps.push(ms); };
const saved = process.env.DATAJUD_API_KEY;
beforeEach(() => { process.env.DATAJUD_API_KEY = 'chave-de-teste'; sleeps.length = 0; });
afterEach(async () => {
  if (saved === undefined) delete process.env.DATAJUD_API_KEY; else process.env.DATAJUD_API_KEY = saved;
  await limpa();
});

async function limpa() {
  const { db } = await import('@/db');
  const { auditLog } = await import('@/db/schema');
  const { inboxItem, portalFetch } = await import('@/db/schema/inbox');
  for (const i of await db.select({ id: inboxItem.id }).from(inboxItem).where(eq(inboxItem.caseNumber, NUM))) await db.delete(auditLog).where(eq(auditLog.entityId, i.id));
  await db.delete(inboxItem).where(eq(inboxItem.caseNumber, NUM));
  await db.delete(portalFetch).where(eq(portalFetch.caseNumber, NUM));
}
const novoItem = async (parsed: object = {}) => {
  const { db } = await import('@/db');
  const { inboxItem } = await import('@/db/schema/inbox');
  const [r] = await db.insert(inboxItem).values({ source: 'manual', caseNumber: NUM, parsed, status: 'new' }).returning();
  return r;
};
afterAll(async () => { await limpa(); await (await import('@/db')).pool.end(); });

describe('lookupCaseCover', () => {
  it('lê os campos de capa; nada é inventado', async () => {
    const r = await lookupCaseCover(NUM, { fetchFn: async () => hits(FULL), sleep });
    expect(r).toEqual({ ok: true, cover: { court: '2º Juizado Especial Cível de Porto Alegre', classe: 'Procedimento do Juizado Especial Cível', subject: 'Indenização por Dano Moral', distributedAt: '2026-03-10', system: 'Eproc', grau: 'JE' } });
    expect(coverFromSource({ numeroProcesso: NUM })).toEqual({});
  });

  it('sem chave: mensagem clara e nenhuma chamada', async () => {
    delete process.env.DATAJUD_API_KEY;
    let calls = 0;
    const r = await lookupCaseCover(NUM, { fetchFn: async () => { calls++; return hits(FULL); } });
    expect(r).toMatchObject({ ok: false, kind: 'no_key' });
    expect(calls).toBe(0);
  });

  it('429: registra e PARA (uma única requisição, sem espera)', async () => {
    let calls = 0;
    const r = await lookupCaseCover(NUM, { fetchFn: async () => { calls++; return json({}, 429, { 'retry-after': '5' }); }, sleep });
    expect(r).toMatchObject({ ok: false, kind: 'rate_limited' });
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it('401/403: chave recusada, sem repetir', async () => {
    let calls = 0;
    expect(await lookupCaseCover(NUM, { fetchFn: async () => { calls++; return json({}, 401); }, sleep })).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(calls).toBe(1);
  });

  it('5xx e timeout: no máximo 1 nova tentativa', async () => {
    let calls = 0;
    const r = await lookupCaseCover(NUM, { fetchFn: async () => { calls++; return json({}, 503); }, sleep });
    expect(r).toMatchObject({ ok: false, kind: 'error' });
    expect(calls).toBe(2);
    calls = 0;
    const t = await lookupCaseCover(NUM, { fetchFn: async () => { calls++; throw Object.assign(new Error('x'), { name: 'TimeoutError' }); }, sleep });
    expect(t).toMatchObject({ ok: false, kind: 'timeout' });
    expect(calls).toBe(2);
    calls = 0; // 1ª falha, 2ª funciona
    const ok = await lookupCaseCover(NUM, { fetchFn: async () => (++calls === 1 ? json({}, 502) : hits(FULL)), sleep });
    expect(ok.ok).toBe(true);
  });

  it('sem hits = não encontrado; resposta incompleta não vale como "não existe"', async () => {
    expect(await lookupCaseCover(NUM, { fetchFn: async () => hits(), sleep })).toMatchObject({ ok: false, kind: 'not_found' });
    const inc = await lookupCaseCover(NUM, { fetchFn: async () => hits(undefined, { total: 5, failed: 2 }), sleep });
    expect(inc).toMatchObject({ ok: false, kind: 'error', message: expect.stringContaining('incompleto') });
  });

  it('número sem tribunal reconhecido', async () => {
    expect(await lookupCaseCover('123', { fetchFn: async () => hits(FULL) })).toMatchObject({ ok: false, kind: 'no_court' });
  });
});

describe('enqueuePortalFetch sem adaptador (DataJud)', () => {
  it('sucesso completa só o que está vazio e não sobrescreve o que foi digitado; audita e registra', async () => {
    const { enqueuePortalFetch, lastPortalFetch } = await import('@/server/portal');
    const { db } = await import('@/db');
    const { inboxItem } = await import('@/db/schema/inbox');
    const { auditLog } = await import('@/db/schema');
    const item = await novoItem({ court: 'Vara digitada pela advogada', plaintiff: 'Fulana' });
    const r = await enqueuePortalFetch(NUM, 'manual', { enabled: new Set(), fetchFn: async () => hits(FULL), sleep });
    expect(r).toMatchObject({ ok: true, queued: false });
    expect([...r.filled].sort()).toEqual(['assunto (objeto sugerido)', 'classe', 'data de ajuizamento', 'sistema']);

    const [after] = await db.select().from(inboxItem).where(eq(inboxItem.id, item.id));
    const p = after.parsed as Record<string, string>;
    expect(p.court).toBe('Vara digitada pela advogada'); // não sobrescreveu
    expect(p).toMatchObject({ plaintiff: 'Fulana', subject: 'Indenização por Dano Moral', distributedAt: '2026-03-10', system: 'Eproc' });
    expect(p.details).toContain('Classe: Procedimento do Juizado Especial Cível');
    expect(p.obtainedBy).toContain('DataJud (API pública do CNJ)');
    expect(after.status).toBe('in_review');
    expect((await db.select().from(auditLog).where(eq(auditLog.entityId, item.id))).some((l) => l.action === 'update')).toBe(true);
    expect(await lastPortalFetch(NUM)).toMatchObject({ portal: 'datajud', status: 'ok', fieldsFilled: 4 });
  });

  it('tudo já preenchido: nada muda e a mensagem diz isso', async () => {
    const { enqueuePortalFetch } = await import('@/server/portal');
    await novoItem({ court: 'A', subject: 'B', distributedAt: '2026-01-01', system: 'C', details: 'D' });
    const r = await enqueuePortalFetch(NUM, 'manual', { enabled: new Set(), fetchFn: async () => hits(FULL), sleep });
    expect(r).toMatchObject({ ok: true, filled: [], message: expect.stringContaining('nada foi alterado') });
  });

  it('429 vira erro registrado, o item não muda e há uma só requisição', async () => {
    const { enqueuePortalFetch, lastPortalFetch } = await import('@/server/portal');
    const { db } = await import('@/db');
    const { inboxItem } = await import('@/db/schema/inbox');
    const item = await novoItem();
    let calls = 0;
    const r = await enqueuePortalFetch(NUM, 'manual', { enabled: new Set(), fetchFn: async () => { calls++; return json({}, 429); }, sleep });
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining('limitou') });
    expect(calls).toBe(1);
    expect((await db.select().from(inboxItem).where(eq(inboxItem.id, item.id)))[0]).toMatchObject({ status: 'new', parsed: {} });
    expect(await lastPortalFetch(NUM)).toMatchObject({ portal: 'datajud', status: 'error', error: expect.stringContaining('429') });
  });

  it('processo não encontrado e sem chave são registrados como erro com mensagem clara', async () => {
    const { enqueuePortalFetch } = await import('@/server/portal');
    await novoItem();
    expect(await enqueuePortalFetch(NUM, 'manual', { enabled: new Set(), fetchFn: async () => hits(), sleep })).toMatchObject({ ok: false, message: expect.stringContaining('não tem dados') });
    delete process.env.DATAJUD_API_KEY;
    expect(await enqueuePortalFetch(NUM, 'manual', { enabled: new Set(), fetchFn: async () => hits(FULL), sleep })).toMatchObject({ ok: false, message: expect.stringContaining('DATAJUD_API_KEY') });
  });
});
