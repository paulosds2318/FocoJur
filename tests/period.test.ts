import { describe, expect, it } from 'vitest';
import { chartMonths } from '@/server/dashboards';
import { daysBetween, isIsoDate, monthsBetween, parsePeriod, periodParams, PERIOD_MODES_CUSTOS, PERIOD_MODES_PAINEIS } from '@/lib/period';

const TODAY = '2026-11-24'; // terça
const custos = (i: Parameters<typeof parsePeriod>[0]) => parsePeriod(i, { allowed: PERIOD_MODES_CUSTOS, fallback: 'month', today: TODAY });
const paineis = (i: Parameters<typeof parsePeriod>[0]) => parsePeriod(i, { allowed: PERIOD_MODES_PAINEIS, fallback: 'all', today: TODAY });

describe('parsePeriod: atalhos', () => {
  it('sem parâmetro cai no padrão da tela, sem aviso', () => {
    expect(custos({})).toMatchObject({ mode: 'month', from: '2026-11-01', to: TODAY, notice: null, pick: null });
    expect(paineis({})).toMatchObject({ mode: 'all', from: null, to: null, notice: null });
  });
  it('hoje, 7 dias e mês atual', () => {
    expect(custos({ periodo: 'today' })).toMatchObject({ mode: 'today', from: TODAY, to: TODAY });
    expect(custos({ periodo: '7d' })).toMatchObject({ from: '2026-11-18', to: TODAY }); // 7 dias contando hoje
    expect(custos({ periodo: 'month' })).toMatchObject({ from: '2026-11-01', to: TODAY });
  });
  it('modo que a tela não aceita avisa e cai no padrão', () => {
    expect(paineis({ periodo: 'today' })).toMatchObject({ mode: 'all', notice: expect.stringContaining('desconhecido') });
    expect(custos({ periodo: 'xyz' })).toMatchObject({ mode: 'month', notice: expect.any(String) });
  });
});

describe('parsePeriod: mês e ano', () => {
  it('cobre o mês inteiro, inclusive fevereiro de ano bissexto', () => {
    expect(custos({ periodo: 'ym', mes: '3', ano: '2025' })).toMatchObject({ mode: 'ym', from: '2025-03-01', to: '2025-03-31', month: 3, year: 2025, pick: 'ym', notice: null });
    expect(custos({ periodo: 'ym', mes: '2', ano: '2024' })).toMatchObject({ from: '2024-02-01', to: '2024-02-29' });
    expect(custos({ periodo: 'ym', mes: '2', ano: '2025' })).toMatchObject({ to: '2025-02-28' });
  });
  it('sem mês/ano usa o atual, o mês inteiro (não "até hoje")', () => {
    expect(custos({ periodo: 'ym' })).toMatchObject({ from: '2026-11-01', to: '2026-11-30', pick: 'ym' });
  });
  it('mês ou ano inválidos caem no padrão com aviso e mantêm o formulário aberto', () => {
    for (const i of [{ mes: '0', ano: '2026' }, { mes: '13', ano: '2026' }, { mes: 'x', ano: '2026' }, { mes: '5', ano: '1999' }, { mes: '5', ano: '2099' }, { mes: '5', ano: '26' }]) {
      expect(custos({ periodo: 'ym', ...i })).toMatchObject({ mode: 'month', notice: expect.stringContaining('inválido'), pick: 'ym' });
    }
  });
  it('aceita o ano seguinte (planejamento), recusa depois disso', () => {
    expect(custos({ periodo: 'ym', mes: '1', ano: '2027' })).toMatchObject({ from: '2027-01-01', notice: null });
    expect(custos({ periodo: 'ym', mes: '1', ano: '2028' }).notice).not.toBeNull();
  });
});

describe('parsePeriod: período personalizado', () => {
  it('aceita datas válidas (inclusivas), inclusive de um dia só', () => {
    expect(custos({ periodo: 'custom', de: '2026-01-10', ate: '2026-03-05' })).toMatchObject({ mode: 'custom', from: '2026-01-10', to: '2026-03-05', pick: 'custom', notice: null, label: '10/01/2026 a 05/03/2026' });
    expect(custos({ periodo: 'custom', de: '2026-05-05', ate: '2026-05-05' })).toMatchObject({ from: '2026-05-05', to: '2026-05-05', notice: null });
  });
  it('escolheu o modo mas ainda sem datas: mostra o formulário sem erro', () => {
    expect(custos({ periodo: 'custom' })).toMatchObject({ mode: 'month', pick: 'custom', notice: null });
  });
  it('recusa data inexistente, formato errado, só uma data, fim antes do início, mais de 5 anos e antes de 2020', () => {
    const bad = [
      { de: '2026-02-30', ate: '2026-03-01' }, { de: '10/01/2026', ate: '2026-03-01' }, { de: '2026-01-10', ate: '' },
      { de: '2026-05-10', ate: '2026-05-01' }, { de: '2020-01-01', ate: '2025-01-02' }, { de: '2019-12-31', ate: '2020-02-01' },
    ];
    for (const i of bad) expect(custos({ periodo: 'custom', ...i }), JSON.stringify(i)).toMatchObject({ mode: 'month', notice: expect.any(String), pick: 'custom' });
    expect(custos({ periodo: 'custom', de: '2020-01-01', ate: '2025-01-01' }).notice).toBeNull(); // exatamente 5 anos
  });
  it('nunca lança, mesmo com lixo', () => {
    for (const v of ['<script>', 'x; drop table y', '９９９', ' ', '2026-1-1', '0000-00-00']) {
      expect(() => custos({ periodo: 'custom', de: v, ate: v })).not.toThrow();
      expect(() => custos({ periodo: 'ym', mes: v, ano: v })).not.toThrow();
    }
  });
});

describe('periodParams e auxiliares', () => {
  it('reproduz exatamente o período (links e CSV)', () => {
    const roundTrip = (i: Parameters<typeof parsePeriod>[0]) => {
      const p = custos(i);
      expect(custos(periodParams(p))).toMatchObject({ mode: p.mode, from: p.from, to: p.to });
    };
    roundTrip({ periodo: 'today' }); roundTrip({ periodo: '7d' }); roundTrip({ periodo: 'month' });
    roundTrip({ periodo: 'ym', mes: '8', ano: '2025' }); roundTrip({ periodo: 'custom', de: '2026-02-01', ate: '2026-04-30' });
  });
  it('isIsoDate, monthsBetween e daysBetween', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2025-02-29')).toBe(false);
    expect(monthsBetween('2025-11-15', '2026-02-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(daysBetween('2026-11-01', '2026-11-30')).toBe(30);
  });
  it('meses do gráfico: 12 até hoje, 12 até o mês escolhido, ou os do período', () => {
    expect(chartMonths(paineis({}), TODAY)).toEqual(['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    const ym = chartMonths(paineis({ periodo: 'ym', mes: '3', ano: '2025' }), TODAY);
    expect(ym).toHaveLength(12);
    expect(ym[11]).toBe('2025-03');
    expect(ym[0]).toBe('2024-04');
    expect(chartMonths(paineis({ periodo: 'custom', de: '2026-01-15', ate: '2026-03-10' }), TODAY)).toEqual(['2026-01', '2026-02', '2026-03']);
  });
});
