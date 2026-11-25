import 'dotenv/config';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERIOD_MODES_CUSTOS, PERIOD_MODES_PAINEIS, parsePeriod } from '@/lib/period';

/** Consultas de Painéis e Custos de IA com período. Usa 2021 (sem dados reais) e remove tudo no fim. */
const TAG = 'TESTE-PERIODO';
const pn = (i: Parameters<typeof parsePeriod>[0]) => parsePeriod(i, { allowed: PERIOD_MODES_PAINEIS, fallback: 'all' });
const cs = (i: Parameters<typeof parsePeriod>[0]) => parsePeriod(i, { allowed: PERIOD_MODES_CUSTOS, fallback: 'month' });

async function limpa() {
  const { db } = await import('@/db');
  const { cases } = await import('@/db/schema/case');
  const { aiCall } = await import('@/db/schema/ai');
  await db.delete(cases).where(like(cases.number, '99999%'));
  await db.delete(aiCall).where(eq(aiCall.model, TAG));
}

beforeAll(async () => {
  const { db } = await import('@/db');
  const { cases } = await import('@/db/schema/case');
  const { aiCall } = await import('@/db/schema/ai');
  await limpa();
  // três processos que entraram em mar/abr de 2021 (um deles encerrado em março) e um de jan/2021 encerrado em março
  await db.insert(cases).values([
    { number: '9999900000001', portfolio: 'civil', receivedAt: '2021-03-10' },
    { number: '9999900000002', portfolio: 'civil', receivedAt: '2021-03-31' },
    { number: '9999900000003', portfolio: 'labor', receivedAt: '2021-04-05' },
    { number: '9999900000004', portfolio: 'civil', receivedAt: '2021-01-20', closedAt: '2021-03-20' },
  ]);
  // chamadas de IA: 15/03 ao meio-dia, 01/04 às 01h UTC (= 31/03 22h em São Paulo, ainda março) e 15/05
  await db.insert(aiCall).values([
    { task: 'movement_summary', model: TAG, status: 'ok', promptTokens: 100, completionTokens: 50, costUsd: '0.100000', fxRate: '5.0000', costBrl: '0.500000', at: new Date('2021-03-15T12:00:00Z') },
    { task: 'movement_summary', model: TAG, status: 'ok', promptTokens: 10, completionTokens: 5, costUsd: '0.020000', fxRate: '5.0000', costBrl: '0.100000', at: new Date('2021-04-01T01:00:00Z') },
    { task: 'deadline_suggestion', model: TAG, status: 'ok', promptTokens: 1, completionTokens: 1, costUsd: '1.000000', fxRate: '5.0000', costBrl: '5.000000', at: new Date('2021-05-15T12:00:00Z') },
  ]);
});
afterAll(async () => {
  await limpa();
  const { pool } = await import('@/db');
  await pool.end();
});

describe('painéis com período', () => {
  it('mês e ano: entradas pela data de recebimento; encerrados pela data de encerramento (qualquer entrada)', async () => {
    const { dashboardData } = await import('@/server/dashboards');
    const mar = (await dashboardData('', pn({ periodo: 'ym', mes: '3', ano: '2021' }))).kpi;
    expect(mar.entries_period).toBe(2); // 10/03 e 31/03; o de 05/04 e o de 20/01 ficam de fora
    expect(mar.closed_period).toBe(1); // o de 20/01 foi encerrado em 20/03
    expect(mar.open).toBe(2); // dos recebidos em março, os dois seguem em andamento
    const abr = (await dashboardData('', pn({ periodo: 'ym', mes: '4', ano: '2021' }))).kpi;
    expect(abr.entries_period).toBe(1);
    expect(abr.closed_period).toBe(0);
  });

  it('período personalizado inclui as duas pontas e recorta o gráfico por mês', async () => {
    const { dashboardData } = await import('@/server/dashboards');
    const d = await dashboardData('', pn({ periodo: 'custom', de: '2021-03-31', ate: '2021-04-05' }));
    expect(d.kpi.entries_period).toBe(2); // 31/03 e 05/04, inclusive
    expect(d.months.map((m) => [m.m, m.entries])).toEqual([['2021-03', 1], ['2021-04', 1]]);
    const larga = await dashboardData('', pn({ periodo: 'custom', de: '2021-01-01', ate: '2021-04-30' }));
    expect(larga.months.map((m) => [m.m, m.entries, m.closed])).toEqual([['2021-01', 1, 0], ['2021-02', 0, 0], ['2021-03', 2, 1], ['2021-04', 1, 0]]);
  });

  it('o filtro de carteira continua valendo junto com o período', async () => {
    const { dashboardData } = await import('@/server/dashboards');
    const per = pn({ periodo: 'custom', de: '2021-01-01', ate: '2021-12-31' });
    expect((await dashboardData('labor', per)).kpi.entries_period).toBe(1);
    expect((await dashboardData('civil', per)).kpi.entries_period).toBe(3);
  });

  it('sem período mantém o retrato de hoje e os últimos 12 meses', async () => {
    const { dashboardData } = await import('@/server/dashboards');
    const d = await dashboardData('', pn({}));
    expect(d.months).toHaveLength(12);
    expect(d.months.at(-1)!.m).toBe(new Date().toISOString().slice(0, 7).replace(/^(\d{4}-\d{2}).*/, '$1'));
  });
});

describe('custos de IA com período', () => {
  it('mês e ano usa o dia de São Paulo (01/04 01h UTC ainda é março)', async () => {
    const { costOverview } = await import('@/server/ai-admin');
    const d = await costOverview(cs({ periodo: 'ym', mes: '3', ano: '2021' }));
    expect(d.t.period_n).toBe(2);
    expect(Number(d.t.period_brl)).toBeCloseTo(0.6, 6);
    expect(Number(d.t.period_tokens)).toBe(165);
    expect(d.granularity).toBe('day');
    expect(d.perDay.map((x) => x.k)).toEqual(['2021-03-15', '2021-03-31']);
    expect(d.byTask.filter((r) => r.model === TAG).map((r) => [r.task, r.calls])).toEqual([['movement_summary', 2]]);
  });

  it('período personalizado: pontas inclusivas e granularidade mensal acima de 62 dias', async () => {
    const { costOverview } = await import('@/server/ai-admin');
    const uma = await costOverview(cs({ periodo: 'custom', de: '2021-05-15', ate: '2021-05-15' }));
    expect(uma.t.period_n).toBe(1);
    expect(Number(uma.t.period_brl)).toBeCloseTo(5, 6);
    const longo = await costOverview(cs({ periodo: 'custom', de: '2021-03-01', ate: '2021-05-31' }));
    expect(longo.granularity).toBe('month');
    expect(longo.perDay.map((x) => x.k)).toEqual(['2021-03', '2021-05']);
    expect(longo.t.period_n).toBe(3);
    expect(Number(longo.t.period_brl)).toBeCloseTo(5.6, 6);
    const fora = await costOverview(cs({ periodo: 'custom', de: '2021-06-01', ate: '2021-06-30' }));
    expect(fora.t.period_n).toBe(0);
    expect(fora.byTask.filter((r) => r.model === TAG)).toHaveLength(0);
  });

  it('"Custo hoje" e a projeção seguem sendo do mês atual, independentes do período escolhido', async () => {
    const { costOverview } = await import('@/server/ai-admin');
    const a = await costOverview(cs({ periodo: 'ym', mes: '3', ano: '2021' }));
    const b = await costOverview(cs({ periodo: 'today' }));
    expect(Number(a.t.today_brl)).toBeCloseTo(Number(b.t.today_brl), 6);
    expect(a.projectionBrl).toBeCloseTo(b.projectionBrl, 6);
  });
});
