import { describe, expect, it } from 'vitest';
import { djen, numberSlice } from '@/lib/connectors/djen';
import { addBusinessDays, subBusinessDays } from '@/lib/deadlines';
import { FORENSIC_RECESS, recessoForense } from '@/db/seed/holidays-data';
import type { ConnectorContext } from '@/lib/connectors/types';

const NOW = new Date('2026-11-24T12:00:00Z');

describe('busca do DJEN pelo número do processo', () => {
  it('consulta cada processo monitorado por numeroProcesso e marca o item como vindo do número', async () => {
    const urls: string[] = [];
    const fetchFn = (async (u: string) => {
      urls.push(String(u));
      const isNumber = String(u).includes('numeroProcesso=');
      return new Response(JSON.stringify({ items: isNumber ? [{ id: '99', numero_processo: '5011870-02.2026.8.21.0001', texto: 'x', tipoComunicacao: 'Intimação', data_disponibilizacao: '2026-11-23' }] : [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const ctx = { terms: [], rejectedNames: [], monitoredNumbers: ['50118700220268210001', '01005846020195010062'], fetchFn, now: NOW } as unknown as ConnectorContext;
    const r = await djen.fetchSince(null, ctx);
    const porNumero = urls.filter((u) => u.includes('numeroProcesso='));
    expect(porNumero).toHaveLength(2);
    expect(porNumero[0]).toContain('numeroProcesso=50118700220268210001');
    expect(porNumero[0]).toContain('dataDisponibilizacaoInicio=2026-11-21'); // 3 dias para trás
    expect(r.items).toHaveLength(2);
    expect(r.items[0]._termKind).toBe('number');
    expect(djen.toMovement!(r.items[0], ctx)?.externalId).toBe('djen:99');
  });

  it('consulta por número só serve para processo cadastrado: nunca gera item novo na Triagem', () => {
    const item = { id: '1', numero_processo: '5011870-02.2026.8.21.0001', texto: 'Intimem-se.', tipoComunicacao: 'Intimação', data_disponibilizacao: '2026-11-13', _termKind: 'number', _term: '50118700220268210001' };
    expect(djen.toInbox!(item, { terms: [], rejectedNames: [], now: NOW } as unknown as ConnectorContext)).toBeNull();
  });

  it('um erro 429 interrompe as consultas por número e fica registrado (sem perder o que veio)', async () => {
    let calls = 0;
    const fetchFn = (async () => { calls++; return new Response('', { status: 429 }); }) as unknown as typeof fetch;
    const ctx = { terms: [], rejectedNames: [], monitoredNumbers: ['1', '2', '3'].map((n) => n.padStart(20, '0')), fetchFn, now: NOW } as unknown as ConnectorContext;
    const r = await djen.fetchSince(null, ctx);
    expect(calls).toBe(1);
    expect(r.errors?.[0]).toMatch(/429/);
  });

  it('com muitos processos, cada rodada consulta uma fatia diferente (gira de hora em hora)', () => {
    const all = Array.from({ length: 250 }, (_, i) => String(i).padStart(20, '0'));
    const h0 = numberSlice(all, new Date('2026-11-24T00:00:00Z'), 100);
    const h1 = numberSlice(all, new Date('2026-11-24T01:00:00Z'), 100);
    expect(h0).toHaveLength(100);
    expect(h0[0]).not.toBe(h1[0]);
    expect(numberSlice(all.slice(0, 50), NOW, 100)).toHaveLength(50); // poucos: todos
    const seen = new Set<string>();
    for (let h = 0; h < 3; h++) numberSlice(all, new Date(Date.UTC(2026, 10, 24, h)), 100).forEach((x) => seen.add(x));
    expect(seen.size).toBe(250); // em um ciclo todos são consultados
  });
});

describe('prazo interno e recesso', () => {
  it('subBusinessDays volta dias úteis (pulando fim de semana e feriado) e é o inverso de addBusinessDays', () => {
    const hol = new Set(['2026-12-08']);
    expect(subBusinessDays('2026-12-10', 2, hol)).toBe('2026-12-07'); // quinta -> volta 2 úteis pulando o feriado de terça
    expect(subBusinessDays('2026-11-30', 1, new Set())).toBe('2026-11-27'); // segunda -> sexta
    expect(addBusinessDays(subBusinessDays('2026-12-10', 3, hol), 3, hol)).toBe('2026-12-10');
  });

  it('recesso forense cobre de 20/12 a 20/01', () => {
    const dias = recessoForense(2026).map(([d]) => d);
    expect(dias[0]).toBe('2026-12-20');
    expect(dias).toContain('2026-12-31');
    expect(dias).toContain('2027-01-20');
    expect(dias).not.toContain('2027-01-21');
    expect(FORENSIC_RECESS.length).toBe(3 * (12 + 20));
  });
});
