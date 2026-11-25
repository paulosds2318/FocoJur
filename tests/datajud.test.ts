import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chunk, datajud, expandMovements, groupByAlias, movementCutoff, retryDelayMs } from '@/lib/connectors/datajud';
import type { ConnectorContext } from '@/lib/connectors/types';

// números CNJ de teste (dígitos válidos não importam aqui; só J.TR define o tribunal)
const rs = (n: number) => `${String(n).padStart(7, '0')}0020268210001`; // 8.21 → tjrs
const rj = (n: number) => `${String(n).padStart(7, '0')}0020268190001`; // 8.19 → tjrj

const ok = (hits: object[] = [], shards: object = { total: 20, failed: 0 }) =>
  new Response(JSON.stringify({ timed_out: false, _shards: shards, hits: { hits } }));
const hit = (n: string) => ({ _source: { numeroProcesso: n, movimentos: [{ codigo: 1, nome: 'Juntada', dataHora: '2026-11-17T10:00:00.000Z' }] } });

function ctxWith(numbers: string[], fetchFn: typeof fetch, sleeps: number[] = []): ConnectorContext {
  return { terms: [], rejectedNames: [], monitoredNumbers: numbers, fetchFn, sleep: async (ms) => { sleeps.push(ms); }, now: new Date('2026-11-18T12:00:00Z') };
}

const saved = { key: process.env.DATAJUD_API_KEY, batch: process.env.DATAJUD_BATCH_SIZE, max: process.env.DATAJUD_MAX_REQUESTS };
beforeEach(() => { process.env.DATAJUD_API_KEY = 'chave-de-teste'; delete process.env.DATAJUD_BATCH_SIZE; delete process.env.DATAJUD_MAX_REQUESTS; });
afterEach(() => {
  for (const [k, v] of [['DATAJUD_API_KEY', saved.key], ['DATAJUD_BATCH_SIZE', saved.batch], ['DATAJUD_MAX_REQUESTS', saved.max]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe('DataJud: agrupamento e espera', () => {
  it('agrupa por tribunal, sem repetir número, e divide em lotes', () => {
    const g = groupByAlias([rs(1), rs(2), rs(1), rj(3), 'lixo']);
    expect([...g.keys()].sort()).toEqual(['tjrj', 'tjrs']);
    expect(g.get('tjrs')).toHaveLength(2);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('espera o Retry-After do CNJ (até 60 s) ou 2, 4, 8, 16 s', () => {
    expect(retryDelayMs(0, '5')).toBe(5000);
    expect(retryDelayMs(0, '999')).toBe(60_000);
    expect([0, 1, 2, 3].map((a) => retryDelayMs(a))).toEqual([2000, 4000, 8000, 16000]);
    expect(retryDelayMs(9)).toBe(30_000);
  });
});

describe('DataJud: consulta em lote', () => {
  it('manda lotes de 50 números por tribunal, identificado e com a chave', async () => {
    const calls: { url: string; body: { size: number; query: { terms: { numeroProcesso: string[] } } }; headers: Record<string, string> }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
      return ok();
    }) as unknown as typeof fetch;
    const numbers = [...Array.from({ length: 120 }, (_, i) => rs(i + 1)), rj(900)];
    const r = await datajud.fetchSince(null, ctxWith(numbers, fetchFn));

    const tjrs = calls.filter((c) => c.url.endsWith('api_publica_tjrs/_search'));
    expect(tjrs.map((c) => c.body.query.terms.numeroProcesso.length)).toEqual([50, 50, 20]); // 120 números = 3 requisições, não 120
    expect(calls.filter((c) => c.url.endsWith('api_publica_tjrj/_search'))).toHaveLength(1);
    expect(calls[0].headers.Authorization).toBe('APIKey chave-de-teste');
    expect(calls[0].headers['User-Agent']).toMatch(/FocoJurBot/); // identificado, nunca fingindo ser navegador
    expect(r.errors).toEqual([]);
  });

  it('429 com Retry-After: espera e tenta de novo; devolve os processos achados', async () => {
    let n = 0;
    const sleeps: number[] = [];
    const fetchFn = (async () => (++n === 1 ? new Response('muitas', { status: 429, headers: { 'Retry-After': '3' } }) : ok([hit(rs(1))]))) as unknown as typeof fetch;
    const r = await datajud.fetchSince(null, ctxWith([rs(1)], fetchFn, sleeps));
    expect(sleeps).toEqual([3000]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ _number: rs(1), _alias: 'tjrs' });
    expect(r.errors).toEqual([]);
  });

  it('índice sobrecarregado (partes falharam): não confia no "0 resultados" e tenta de novo', async () => {
    let n = 0;
    const sleeps: number[] = [];
    const fetchFn = (async () => (++n === 1 ? ok([], { total: 20, failed: 13 }) : ok([hit(rs(1))]))) as unknown as typeof fetch;
    const r = await datajud.fetchSince(null, ctxWith([rs(1)], fetchFn, sleeps));
    expect(n).toBe(2);
    expect(sleeps).toEqual([2000]);
    expect(r.items).toHaveLength(1);
  });

  it('um tribunal que continua falhando vira erro registrado, sem perder os outros', async () => {
    const sleeps: number[] = [];
    const fetchFn = (async (url: string) => (String(url).includes('tjrj') ? new Response('', { status: 503 }) : ok([hit(rs(1))]))) as unknown as typeof fetch;
    const r = await datajud.fetchSince(null, ctxWith([rs(1), rj(2)], fetchFn, sleeps));
    expect(r.items).toHaveLength(1); // o TJRS veio
    expect(r.errors).toHaveLength(1);
    expect(r.errors![0]).toMatch(/tjrj.*503.*5 tentativas/);
    expect(sleeps).toEqual([2000, 4000, 8000, 16000]); // espera crescente antes de desistir
  });

  it('tempo esgotado ou falha de rede: tenta de novo e, se persistir, registra o erro sem derrubar a execução', async () => {
    const timeout = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    let n = 0;
    const sleeps: number[] = [];
    const umaVez = (async () => { if (++n === 1) throw timeout(); return ok([hit(rs(1))]); }) as unknown as typeof fetch;
    const r1 = await datajud.fetchSince(null, ctxWith([rs(1)], umaVez, sleeps));
    expect(r1.items).toHaveLength(1); // a segunda tentativa deu certo
    expect(sleeps).toEqual([2000]);

    const sempre = (async (url: string) => { if (String(url).includes('tjrj')) throw new TypeError('fetch failed'); return ok([hit(rs(1))]); }) as unknown as typeof fetch;
    const r2 = await datajud.fetchSince(null, ctxWith([rs(1), rj(2)], sempre, []));
    expect(r2.items).toHaveLength(1); // o TJRS veio mesmo com o TJRJ fora do ar
    expect(r2.errors![0]).toMatch(/tjrj.*falha de rede.*5 tentativas/);

    const lento = (async () => { throw timeout(); }) as unknown as typeof fetch;
    const r3 = await datajud.fetchSince(null, ctxWith([rs(1)], lento, []));
    expect(r3.errors![0]).toMatch(/tjrs.*sem resposta em 60 s.*5 tentativas/);
  });

  it('chave recusada (401/403): para na hora, sem insistir', async () => {
    let n = 0;
    const fetchFn = (async () => { n++; return new Response('', { status: 401 }); }) as unknown as typeof fetch;
    const r = await datajud.fetchSince(null, ctxWith([rs(1), rj(2)], fetchFn));
    expect(n).toBe(1);
    expect(r.errors![0]).toMatch(/chave recusada.*wiki do CNJ/);
  });

  it('respeita o teto de requisições por execução', async () => {
    process.env.DATAJUD_MAX_REQUESTS = '2';
    process.env.DATAJUD_BATCH_SIZE = '1';
    let n = 0;
    const fetchFn = (async () => { n++; return ok(); }) as unknown as typeof fetch;
    const r = await datajud.fetchSince(null, ctxWith([rs(1), rs(2), rs(3), rs(4)], fetchFn));
    expect(n).toBe(2);
    expect(r.errors!.join(' ')).toMatch(/teto de 2 requisições atingido: 2 de 4 processos não foram consultados/);
  });
});

describe('DataJud: só movimentações recentes viram movimento', () => {
  it('ignora o histórico antigo (senão a triagem seria inundada) e mantém id estável', () => {
    const item = {
      _number: rs(1),
      movimentos: [
        { codigo: 26, nome: 'Distribuição', dataHora: '2021-03-01T10:00:00.000Z' }, // antiga
        { codigo: 60, nome: 'Juntada', dataHora: '2026-11-17T10:00:00.000Z' }, // recente
      ],
    };
    const cutoff = movementCutoff(new Date('2026-11-18T12:00:00Z')); // 7 dias para trás
    expect(cutoff).toBe('2026-11-11');
    const m = expandMovements(item, cutoff);
    expect(m).toHaveLength(1);
    expect(m[0].title).toBe('Juntada');
    expect(m[0].externalId).toBe(`datajud:${rs(1)}:60:2026-11-17T10:00:00.000Z`);
    expect(expandMovements(item)).toHaveLength(2); // sem corte, entram todas
  });
});
