/**
 * Fórmula do valor de risco (planilha do Jurídico), editável em Listas oficiais:
 *   subtotal = valor da causa + valor da causa x percentual da categoria
 *   honorários = subtotal x percentual de honorários
 *   valor de risco = subtotal + honorários
 * Categorias: Juizado (18%), Vara Cível (24%) e Casos antigos/ajuste (35%, processos com mais de 36 meses).
 * As contas usam centavos inteiros, com arredondamento para cima na metade, como a planilha.
 */
export type RiskCategory = 'juizado' | 'vara' | 'antigo';
export const RISK_CATEGORIES: RiskCategory[] = ['juizado', 'vara', 'antigo'];
export const RISK_CATEGORY_LABEL: Record<RiskCategory, string> = { juizado: 'Juizado', vara: 'Vara Cível', antigo: 'Casos antigos (ajuste)' };

export type RiskFormula = {
  enabled: boolean;
  /** percentual somado ao valor da causa, por categoria */
  pct: Record<RiskCategory, number>;
  /** percentual de honorários sobre o subtotal */
  honorariosPct: number;
  /** processo com mais meses que isto entra em "Casos antigos" (3 anos = 36) */
  oldMonths: number;
  /** salário mínimo vigente (R$), para o teto dos juizados */
  minimumWage: number | null;
  /** sem valor da causa quantificado: usar o teto dos juizados (20 salários sem advogado, 40 com advogado) */
  fallbackCap: 'none' | 'sem' | 'com';
  capSem: number;
  capCom: number;
};

export const DEFAULT_RISK_FORMULA: RiskFormula = {
  enabled: false, pct: { juizado: 18, vara: 24, antigo: 35 }, honorariosPct: 20, oldMonths: 36, minimumWage: null, fallbackCap: 'none', capSem: 20, capCom: 40,
};

const num = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/** Lê o JSON salvo; qualquer coisa fora do esperado volta ao padrão (desligada). */
export function parseRiskFormula(raw: string | null | undefined): RiskFormula {
  const d = DEFAULT_RISK_FORMULA;
  try {
    const v = JSON.parse(raw ?? '') as Partial<RiskFormula> & { pct?: Partial<Record<RiskCategory, number>> };
    return {
      enabled: v.enabled === true,
      pct: Object.fromEntries(RISK_CATEGORIES.map((k) => [k, num(v.pct?.[k], 0, 1000) ?? d.pct[k]])) as Record<RiskCategory, number>,
      honorariosPct: num(v.honorariosPct, 0, 1000) ?? d.honorariosPct,
      oldMonths: num(v.oldMonths, 1, 1200) ?? d.oldMonths,
      minimumWage: num(v.minimumWage, 0, 1_000_000),
      fallbackCap: v.fallbackCap === 'sem' || v.fallbackCap === 'com' ? v.fallbackCap : 'none',
      capSem: num(v.capSem, 1, 1000) ?? d.capSem,
      capCom: num(v.capCom, 1, 1000) ?? d.capCom,
    };
  } catch {
    return { ...d, pct: { ...d.pct } };
  }
}

/** Meses (dias / 30, como na planilha) entre a data de distribuição/recebimento e hoje; nulo sem data válida. */
export function monthsSince(date: string | null | undefined, today: string): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const days = (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${date}T00:00:00Z`).getTime()) / 86_400_000;
  return Number.isFinite(days) ? days / 30 : null;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/**
 * Categoria do processo: "Casos antigos" quando passa do limite de meses; senão Juizado ou Vara Cível pelo foro/esfera.
 * Trabalhista, Procon e foro desconhecido ficam sem categoria (a fórmula não se aplica).
 */
export function riskCategoryOf(f: RiskFormula, p: { portfolio?: string | null; courtTypeLabel?: string | null; months?: number | null }): RiskCategory | null {
  if (p.portfolio && p.portfolio !== 'civil') return null;
  if (p.months !== null && p.months !== undefined && p.months > f.oldMonths) return 'antigo';
  const c = fold(p.courtTypeLabel ?? '');
  if (c.includes('JUIZADO')) return 'juizado';
  if (c.includes('VARA') && c.includes('CIVEL')) return 'vara';
  return null;
}

const cents = (v: number) => Math.round(v * 100);
const pctOf = (valueCents: number, pct: number) => Math.round((valueCents * pct) / 100);

export type RiskBreakdown = { base: number; adjust: number; subtotal: number; honorarios: number; total: number };

/** Passo a passo da planilha (valores em reais). */
export function riskBreakdown(f: RiskFormula, category: RiskCategory, base: number): RiskBreakdown {
  const b = cents(base);
  const adjust = pctOf(b, f.pct[category]);
  const subtotal = b + adjust;
  const honorarios = pctOf(subtotal, f.honorariosPct);
  return { base: b / 100, adjust: adjust / 100, subtotal: subtotal / 100, honorarios: honorarios / 100, total: (subtotal + honorarios) / 100 };
}

/** Teto dos juizados em reais (salário mínimo x 20 ou x 40), quando a regra está ligada e o salário foi informado. */
export function fallbackBase(f: RiskFormula): number | null {
  if (f.fallbackCap === 'none' || f.minimumWage === null || f.minimumWage <= 0) return null;
  return Math.round(f.minimumWage * (f.fallbackCap === 'sem' ? f.capSem : f.capCom) * 100) / 100;
}

/**
 * Valor de risco: base = valor da causa (ou o teto dos juizados, se não há valor e a regra está ligada).
 * Nulo se a fórmula está desligada, sem categoria ou sem base.
 */
export function computeRisk(f: RiskFormula, category: RiskCategory | null, claimValue: number | null): RiskBreakdown | null {
  if (!f.enabled || !category) return null;
  const base = claimValue !== null && claimValue > 0 ? claimValue : fallbackBase(f);
  if (base === null) return null;
  return riskBreakdown(f, category, base);
}

/** "12.450,00" -> 12450; vazio ou inválido -> null. */
export function parseMoneyBr(v: string | undefined): number | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** 12450 -> "12450,00" (aceito pelos formulários). */
export const formatMoneyInput = (n: number) => n.toFixed(2).replace('.', ',');
