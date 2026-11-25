import { describe, expect, it } from 'vitest';
import { computeRisk, DEFAULT_RISK_FORMULA, fallbackBase, formatMoneyInput, monthsSince, parseMoneyBr, parseRiskFormula, riskBreakdown, riskCategoryOf, type RiskFormula } from '@/lib/risk';

const ON: RiskFormula = { ...DEFAULT_RISK_FORMULA, enabled: true };

describe('fórmula do valor de risco (planilha do Jurídico)', () => {
  it('Juizado: R$ 13.680,00 + 18% + 20% de honorários = R$ 19.370,88', () => {
    expect(riskBreakdown(ON, 'juizado', 13680)).toEqual({ base: 13680, adjust: 2462.4, subtotal: 16142.4, honorarios: 3228.48, total: 19370.88 });
  });

  it('Vara Cível: R$ 5.000,00 + 24% + 20% = R$ 7.440,00', () => {
    expect(riskBreakdown(ON, 'vara', 5000)).toEqual({ base: 5000, adjust: 1200, subtotal: 6200, honorarios: 1240, total: 7440 });
  });

  it('Casos antigos (ajuste): R$ 28.625,90 + 35% + 20% = R$ 46.373,96 (arredonda a metade para cima, como a planilha)', () => {
    expect(riskBreakdown(ON, 'antigo', 28625.9)).toEqual({ base: 28625.9, adjust: 10019.07, subtotal: 38644.97, honorarios: 7728.99, total: 46373.96 });
  });

  it('os percentuais são editáveis', () => {
    const f = { ...ON, pct: { ...ON.pct, juizado: 10 }, honorariosPct: 10 };
    expect(riskBreakdown(f, 'juizado', 1000).total).toBe(1210); // 1000 + 10% = 1100; + 10% = 1210
  });

  it('categoria: "casos antigos" passa do limite de meses; senão Juizado ou Vara Cível pelo foro; trabalhista e Procon não usam', () => {
    expect(riskCategoryOf(ON, { portfolio: 'civil', courtTypeLabel: 'Juizado', months: 10 })).toBe('juizado');
    expect(riskCategoryOf(ON, { portfolio: 'civil', courtTypeLabel: 'Vara Cível', months: 10 })).toBe('vara');
    expect(riskCategoryOf(ON, { portfolio: 'civil', courtTypeLabel: 'Juizado', months: 97.2 })).toBe('antigo');
    expect(riskCategoryOf(ON, { portfolio: 'civil', courtTypeLabel: 'Juizado', months: 36 })).toBe('juizado'); // no limite ainda não é antigo
    expect(riskCategoryOf(ON, { portfolio: 'civil', courtTypeLabel: 'Juizado', months: 36.1 })).toBe('antigo');
    expect(riskCategoryOf(ON, { portfolio: 'labor', courtTypeLabel: 'Vara do Trabalho', months: 1 })).toBeNull();
    expect(riskCategoryOf(ON, { portfolio: 'procon', courtTypeLabel: 'Procon', months: 1 })).toBeNull();
    expect(riskCategoryOf(ON, { portfolio: 'civil', courtTypeLabel: null, months: 1 })).toBeNull(); // foro desconhecido
  });

  it('meses = dias / 30, como o "cálculo de meses" da planilha (01/12/2018 a 24/11/2026 = 97,17)', () => {
    expect(monthsSince('2018-12-01', '2026-11-24')).toBeCloseTo(97.1667, 3);
    expect(monthsSince(null, '2026-11-24')).toBeNull();
    expect(monthsSince('lixo', '2026-11-24')).toBeNull();
  });

  it('desligada, sem categoria ou sem base não calcula', () => {
    expect(computeRisk(DEFAULT_RISK_FORMULA, 'juizado', 1000)).toBeNull();
    expect(computeRisk(ON, null, 1000)).toBeNull();
    expect(computeRisk(ON, 'juizado', null)).toBeNull();
    expect(computeRisk(ON, 'juizado', 1000)?.total).toBe(1416); // 1180 + 20%
  });

  it('sem valor da causa, usa o teto dos juizados (20 salários sem advogado, 40 com) quando a regra está ligada', () => {
    const f: RiskFormula = { ...ON, minimumWage: 1500, fallbackCap: 'com' };
    expect(fallbackBase(f)).toBe(60000); // 40 x 1.500
    expect(computeRisk(f, 'juizado', null)?.base).toBe(60000);
    expect(computeRisk({ ...f, fallbackCap: 'sem' }, 'juizado', null)?.base).toBe(30000); // 20 x 1.500
    expect(computeRisk({ ...f, fallbackCap: 'none' }, 'juizado', null)).toBeNull();
    expect(computeRisk({ ...f, minimumWage: null }, 'juizado', null)).toBeNull();
    expect(computeRisk(f, 'juizado', 2000)?.base).toBe(2000); // com valor da causa, o teto não entra
  });

  it('JSON inválido volta ao padrão desligado; números fora da faixa são ignorados; configuração antiga (por prognóstico) não quebra', () => {
    expect(parseRiskFormula('lixo')).toEqual(DEFAULT_RISK_FORMULA);
    expect(parseRiskFormula(null).enabled).toBe(false);
    const f = parseRiskFormula(JSON.stringify({ enabled: true, pct: { juizado: 20, vara: -5, antigo: 'x' }, honorariosPct: 15, oldMonths: 0 }));
    expect(f).toMatchObject({ enabled: true, pct: { juizado: 20, vara: 24, antigo: 35 }, honorariosPct: 15, oldMonths: 36 });
    expect(parseRiskFormula(JSON.stringify({ enabled: true, pct: { probable: 100, possible: 50, remote: 0 } })).pct).toEqual(DEFAULT_RISK_FORMULA.pct);
  });

  it('converte valores no formato brasileiro', () => {
    expect(parseMoneyBr('12.450,00')).toBe(12450);
    expect(parseMoneyBr('')).toBeNull();
    expect(parseMoneyBr('abc')).toBeNull();
    expect(formatMoneyInput(19370.88)).toBe('19370,88');
  });
});
