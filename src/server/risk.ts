import { desc, eq, lte } from 'drizzle-orm';
import { db } from '@/db';
import { cases } from '@/db/schema/case';
import { appSetting, riskFormulaVersion } from '@/db/schema/inbox';
import { lookup } from '@/db/schema/lookups';
import { audit } from '@/lib/audit';
import { todayInSaoPaulo } from '@/lib/deadlines';
import { computeRisk, formatMoneyInput, monthsSince, parseMoneyBr, parseRiskFormula, riskCategoryOf, RISK_CATEGORIES, type RiskCategory, type RiskFormula } from '@/lib/risk';

export const RISK_FORMULA_KEY = 'risk_formula';

/**
 * Fórmula vigente. Com `asOf` (AAAA-MM-DD), devolve a versão que valia naquela data (a mais recente com início até ela);
 * antes da primeira versão usa a primeira. Sem histórico, cai na fórmula atual.
 */
export async function getRiskFormula(asOf?: string | null): Promise<RiskFormula> {
  if (asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    const [v] = await db.select().from(riskFormulaVersion).where(lte(riskFormulaVersion.effectiveFrom, asOf)).orderBy(desc(riskFormulaVersion.effectiveFrom), desc(riskFormulaVersion.createdAt)).limit(1);
    if (v) return parseRiskFormula(v.formula);
    const [first] = await db.select().from(riskFormulaVersion).orderBy(riskFormulaVersion.effectiveFrom, riskFormulaVersion.createdAt).limit(1);
    if (first) return parseRiskFormula(first.formula);
  }
  const [row] = await db.select().from(appSetting).where(eq(appSetting.key, RISK_FORMULA_KEY));
  return parseRiskFormula(row?.value);
}

/** Histórico de versões, da mais recente para a mais antiga. */
export async function listRiskFormulaVersions() {
  const rows = await db.select().from(riskFormulaVersion).orderBy(desc(riskFormulaVersion.effectiveFrom), desc(riskFormulaVersion.createdAt));
  return rows.map((r) => ({ id: r.id, effectiveFrom: r.effectiveFrom, createdBy: r.createdBy, createdAt: r.createdAt, formula: parseRiskFormula(r.formula) }));
}

export type RiskFormulaInput = {
  enabled: boolean; pct: Record<RiskCategory, string>; honorariosPct: string; oldMonths: string; minimumWage: string; fallbackCap: string;
};

/** Salva a fórmula (só admin, chamado pela action). Valida cada número. */
export async function setRiskFormula(actorId: string, input: RiskFormulaInput) {
  const n = (v: string) => Number(v.trim().replace(/\./g, '').replace(',', '.'));
  const pct = {} as RiskFormula['pct'];
  for (const k of RISK_CATEGORIES) {
    const v = Number(input.pct[k].trim().replace(',', '.'));
    if (!Number.isFinite(v) || v < 0 || v > 1000) return { ok: false as const, error: 'Informe percentuais entre 0 e 1000.' };
    pct[k] = v;
  }
  const honorariosPct = Number(input.honorariosPct.trim().replace(',', '.'));
  if (!Number.isFinite(honorariosPct) || honorariosPct < 0 || honorariosPct > 1000) return { ok: false as const, error: 'Honorários: informe um percentual entre 0 e 1000.' };
  const oldMonths = Number(input.oldMonths.trim());
  if (!Number.isInteger(oldMonths) || oldMonths < 1 || oldMonths > 1200) return { ok: false as const, error: 'Casos antigos: informe os meses (um número inteiro de 1 a 1200).' };
  const wage = input.minimumWage.trim() === '' ? null : n(input.minimumWage);
  if (wage !== null && (!Number.isFinite(wage) || wage <= 0)) return { ok: false as const, error: 'Salário mínimo inválido.' };
  const fallbackCap = input.fallbackCap === 'sem' || input.fallbackCap === 'com' ? input.fallbackCap : 'none';
  if (fallbackCap !== 'none' && wage === null) return { ok: false as const, error: 'Para usar o teto dos juizados, informe o salário mínimo.' };

  const before = await getRiskFormula();
  const after: RiskFormula = { ...before, enabled: input.enabled, pct, honorariosPct, oldMonths, minimumWage: wage, fallbackCap };
  await db
    .insert(appSetting)
    .values({ key: RISK_FORMULA_KEY, value: JSON.stringify(after), updatedBy: actorId })
    .onConflictDoUpdate({ target: appSetting.key, set: { value: JSON.stringify(after), updatedBy: actorId, updatedAt: new Date() } });
  // histórico: cada mudança vira uma versão válida a partir de hoje (várias edições no mesmo dia ficam numa só versão)
  const today = todayInSaoPaulo();
  const [same] = await db.select({ id: riskFormulaVersion.id }).from(riskFormulaVersion).where(eq(riskFormulaVersion.effectiveFrom, today)).limit(1);
  if (same) await db.update(riskFormulaVersion).set({ formula: JSON.stringify(after), createdBy: actorId, createdAt: new Date() }).where(eq(riskFormulaVersion.id, same.id));
  else await db.insert(riskFormulaVersion).values({ formula: JSON.stringify(after), effectiveFrom: today, createdBy: actorId });
  await audit({ actorId, entity: 'app_setting', entityId: RISK_FORMULA_KEY, action: 'update', diff: { before, after } });
  return { ok: true as const };
}

const courtLabel = async (id: string | null | undefined) => {
  if (!id) return null;
  const [l] = await db.select({ label: lookup.label }).from(lookup).where(eq(lookup.id, id));
  return l?.label ?? null;
};

/**
 * Se o valor de risco veio em branco e a fórmula está ligada, calcula pela planilha (valor da causa + percentual da categoria + honorários).
 * A categoria vem do foro/esfera e da idade do processo; sem categoria (trabalhista, Procon, foro desconhecido) não calcula.
 * Nunca sobrescreve o que foi digitado. Na revisão de prognóstico passe `caseId` para usar o foro e as datas do processo.
 */
export async function withRiskFormula<T extends Record<string, string>>(raw: T, opts: { caseId?: string } = {}): Promise<T> {
  if ((raw.riskTotal ?? '').trim()) return raw;
  const formula = await getRiskFormula();
  if (!formula.enabled) return raw;

  let portfolio: string | null = raw.portfolio || null;
  let courtTypeId: string | null = raw.courtTypeId || null;
  let date: string | null = raw.receivedAt || raw.citedAt || null;
  if (opts.caseId) {
    const [c] = await db.select({ portfolio: cases.portfolio, courtTypeId: cases.courtTypeId, receivedAt: cases.receivedAt, citedAt: cases.citedAt }).from(cases).where(eq(cases.id, opts.caseId));
    if (c) { portfolio = c.portfolio; courtTypeId = c.courtTypeId; date = c.receivedAt ?? c.citedAt; }
  }
  const category = riskCategoryOf(formula, { portfolio, courtTypeLabel: await courtLabel(courtTypeId), months: monthsSince(date, todayInSaoPaulo()) });
  const res = computeRisk(formula, category, parseMoneyBr(raw.claimValue));
  return res ? { ...raw, riskTotal: formatMoneyInput(res.total) } : raw;
}
