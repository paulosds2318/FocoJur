import 'dotenv/config';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// estes testes cobrem a Triagem: o que vem do DJEN vai para ela (o cadastro direto em Processos é testado em djen-processo-direto.test.ts)
process.env.DJEN_AUTO_REGISTER = 'false';

/**
 * Busca em segundo plano ao criar/ativar um termo + paginação da caixa de entrada.
 * Postgres local; DJEN simulado com fetch; remove tudo que cria (números 9995…, termo "TESTEBUSCA").
 */
const num = (n: number) => `9995${String(n).padStart(4, '0')}1120268210001`;
const termo = 'TESTEBUSCA PARTE LTDA';
let termId: string;

const item = (id: string, n: number) => ({
  id, numero_processo: num(n), texto: `Intimação ${id}`, tipoComunicacao: 'Citação', data_disponibilizacao: '2026-11-13',
  siglaTribunal: 'TJRS', nomeOrgao: '1ª Vara', destinatarios: [{ nome: 'TESTEBUSCA PARTE LTDA', polo: 'P' }],
});

async function limpa() {
  const { db } = await import('@/db');
  const { inboxItem, monitoredTerm, connectorRun } = await import('@/db/schema/inbox');
  await db.delete(inboxItem).where(like(inboxItem.caseNumber, '9995%'));
  await db.delete(monitoredTerm).where(eq(monitoredTerm.term, termo));
  await db.delete(connectorRun).where(like(connectorRun.error, '%TESTEBUSCA%'));
}

beforeAll(async () => {
  await limpa();
  const { addTerm } = await import('@/server/monitoring');
  const { db } = await import('@/db');
  const { user } = await import('@/db/schema');
  const [admin] = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);
  const r = await addTerm(admin.id, { kind: 'name', term: termo, document: '45.723.174/0001-10' });
  if (!r.ok) throw new Error(r.error);
  termId = r.id;
});
afterAll(async () => {
  await limpa();
  const { pool } = await import('@/db');
  await pool.end();
});

describe('busca de um termo em segundo plano', () => {
  it('consulta só aquele termo, grava o resultado nele e não adianta o ponto de retomada global', async () => {
    const { markSearchPending, runTermSearch } = await import('@/server/term-search');
    const { db } = await import('@/db');
    const { connectorRun, monitoredTerm } = await import('@/db/schema/inbox');
    const { desc, and, isNotNull } = await import('drizzle-orm');

    const cursorAntes = (await db.select().from(connectorRun).where(and(eq(connectorRun.connector, 'djen'), eq(connectorRun.status, 'ok'), isNotNull(connectorRun.cursor))).orderBy(desc(connectorRun.startedAt)).limit(1))[0]?.cursor ?? null;

    const chamadas: string[] = [];
    const fetchFn = (async (url: string) => {
      chamadas.push(String(url));
      return new Response(JSON.stringify({ items: [item('bt-b1', 1), item('bt-b2', 2), item('bt-b3', 3)] }));
    }) as unknown as typeof fetch;

    await markSearchPending(termId, 12);
    expect((await db.select().from(monitoredTerm).where(eq(monitoredTerm.id, termId)))[0].searchStatus).toBe('pending');

    const r = await runTermSearch(termId, 12, { fetchFn, now: new Date('2026-11-17T12:00:00Z') });
    expect(r).toMatchObject({ status: 'ok', found: 3, created: 3 });

    // só o termo pedido foi consultado, com o período certo (últimas 12 horas)
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toContain('nomeParte=TESTEBUSCA');
    expect(chamadas[0]).toContain('dataDisponibilizacaoInicio=2026-11-16'); // 12 h antes de 09h de 17/11 = ontem

    const [t] = await db.select().from(monitoredTerm).where(eq(monitoredTerm.id, termId));
    expect(t).toMatchObject({ searchStatus: 'ok', searchFound: 3, searchNew: 3, searchHours: 12 });

    const cursorDepois = (await db.select().from(connectorRun).where(and(eq(connectorRun.connector, 'djen'), eq(connectorRun.status, 'ok'), isNotNull(connectorRun.cursor))).orderBy(desc(connectorRun.startedAt)).limit(1))[0]?.cursor ?? null;
    expect(cursorDepois).toBe(cursorAntes); // busca parcial não pula dias dos outros termos
  });

  it('termo inativo não é buscado; erro da API fica registrado no termo', async () => {
    const { runTermSearch } = await import('@/server/term-search');
    const { setTermActive } = await import('@/server/monitoring');
    const { db } = await import('@/db');
    const { monitoredTerm } = await import('@/db/schema/inbox');
    const { user } = await import('@/db/schema');
    const [admin] = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);

    await setTermActive(admin.id, termId, false);
    let chamou = false;
    const spy = (async () => { chamou = true; return new Response('{}'); }) as unknown as typeof fetch;
    expect(await runTermSearch(termId, 30, { fetchFn: spy })).toEqual({ status: 'skipped' });
    expect(chamou).toBe(false);

    await setTermActive(admin.id, termId, true);
    const bloqueada = (async () => new Response('proibido', { status: 403 })) as unknown as typeof fetch;
    const r = await runTermSearch(termId, 30, { fetchFn: bloqueada });
    expect(r.status).toBe('error'); // o conector registra e NÃO tenta contornar o bloqueio
    const [t] = await db.select().from(monitoredTerm).where(eq(monitoredTerm.id, termId));
    expect(t.searchStatus).toBe('error');
    expect(t.searchError).toContain('403');
  });
});

describe('período padrão da busca de termo = intervalo configurado', () => {
  it('sem período escolhido usa o intervalo de Monitoramento (padrão 1 h); só aceita 1, 6, 12 ou 24', async () => {
    const { markSearchPending, runTermSearch } = await import('@/server/term-search');
    const { getDjenIntervalHours, setDjenIntervalHours, DJEN_INTERVAL_KEY } = await import('@/server/settings');
    const { db } = await import('@/db');
    const { appSetting, monitoredTerm } = await import('@/db/schema/inbox');
    const { user } = await import('@/db/schema');
    const [admin] = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);
    const original = (await db.select().from(appSetting).where(eq(appSetting.key, DJEN_INTERVAL_KEY)))[0]?.value;
    const horasDoTermo = async () => (await db.select().from(monitoredTerm).where(eq(monitoredTerm.id, termId)))[0].searchHours;
    const now = new Date('2026-11-17T12:00:00Z'); // 09h em Brasília
    try {
      let url = '';
      const fetchFn = (async (u: string) => { url = String(u); return new Response(JSON.stringify({ items: [] })); }) as unknown as typeof fetch;

      // intervalo de 1 h: busca só o dia de hoje
      await setDjenIntervalHours(admin.id, 1);
      await markSearchPending(termId);
      await runTermSearch(termId, undefined, { fetchFn, now });
      expect(await horasDoTermo()).toBe(1);
      expect(url).toContain('dataDisponibilizacaoInicio=2026-11-17');

      // o admin muda o intervalo para 24 h: a busca do termo passa a usar 24 h (vale para tudo)
      await setDjenIntervalHours(admin.id, 24);
      await markSearchPending(termId);
      await runTermSearch(termId, undefined, { fetchFn, now });
      expect(await horasDoTermo()).toBe(24);
      expect(url).toContain('dataDisponibilizacaoInicio=2026-11-16');
      expect(url).toContain('dataDisponibilizacaoFim=2026-11-17');

      // escolha explícita vale no lugar do padrão; valor fora das opções (ex.: 720 h) cai no intervalo configurado
      await markSearchPending(termId, 6);
      expect(await horasDoTermo()).toBe(6);
      await markSearchPending(termId, 720);
      expect(await horasDoTermo()).toBe(await getDjenIntervalHours());
    } finally {
      if (original === undefined) await db.delete(appSetting).where(eq(appSetting.key, DJEN_INTERVAL_KEY));
      else await setDjenIntervalHours(admin.id, Number(original));
    }
  });
});

describe('caixa de entrada paginada', () => {
  it('divide em páginas de 25, na ordem, sem repetir nem perder item, e busca por número', async () => {
    const { addInboxItem, listInbox, INBOX_PAGE_SIZE } = await import('@/server/inbox');
    const { djen } = await import('@/lib/connectors/djen');
    const ctx = { terms: [{ id: 'x', term: termo, kind: 'name' as const, document: null }], rejectedNames: [], monitoredNumbers: [], fetchFn: fetch, now: new Date() };
    for (let n = 100; n < 160; n++) {
      const input = djen.toInbox!({ ...item(`bt-p${n}`, n), _termKind: 'name', _term: termo }, ctx)!;
      await addInboxItem(input);
    }
    expect(INBOX_PAGE_SIZE).toBe(25);

    const mine = (rows: { caseNumber: string | null }[]) => rows.filter((r) => r.caseNumber?.startsWith('9995')).map((r) => r.caseNumber!);
    const busca = '99950';
    const p1 = await listInbox('djen', { page: 1, q: busca });
    const p2 = await listInbox('djen', { page: 2, q: busca });
    const p3 = await listInbox('djen', { page: 3, q: busca });
    expect(p1.total).toBeGreaterThanOrEqual(60);
    expect(p1.rows).toHaveLength(25);
    expect(p2.rows).toHaveLength(25);
    const all = [...mine(p1.rows), ...mine(p2.rows), ...mine(p3.rows)];
    expect(new Set(all).size).toBe(all.length); // nenhum item repetido entre páginas

    // página além do fim volta para a última; busca por número específico acha 1 item
    expect((await listInbox('djen', { page: 999, q: busca })).page).toBe(Math.ceil(p1.total / 25));
    const um = await listInbox('djen', { q: num(120) });
    expect(um.total).toBe(1);
  });
});
