import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Histórico da fórmula do valor de risco: cada mudança vira versão; consulta por data usa a vigente na época. */
let adminId: string;
let backupSetting: string | undefined;
let backupVersions: { formula: string; effectiveFrom: string; createdBy: string | null }[] = [];

const input = (juizado: string) => ({
  enabled: true, pct: { juizado, vara: '24', antigo: '35' }, honorariosPct: '20', oldMonths: '36', minimumWage: '', fallbackCap: 'none',
});

beforeAll(async () => {
  const { db } = await import('@/db');
  const { user } = await import('@/db/schema');
  const { appSetting, riskFormulaVersion } = await import('@/db/schema/inbox');
  const [a] = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);
  adminId = a.id;
  backupSetting = (await db.select().from(appSetting).where(eq(appSetting.key, 'risk_formula')))[0]?.value;
  backupVersions = (await db.select().from(riskFormulaVersion)).map((v) => ({ formula: v.formula, effectiveFrom: v.effectiveFrom, createdBy: v.createdBy }));
  await db.delete(riskFormulaVersion);
});

afterAll(async () => {
  const { db } = await import('@/db');
  const { appSetting, riskFormulaVersion } = await import('@/db/schema/inbox');
  const { auditLog } = await import('@/db/schema');
  await db.delete(riskFormulaVersion);
  if (backupVersions.length) await db.insert(riskFormulaVersion).values(backupVersions);
  if (backupSetting === undefined) await db.delete(appSetting).where(eq(appSetting.key, 'risk_formula'));
  else await db.update(appSetting).set({ value: backupSetting }).where(eq(appSetting.key, 'risk_formula'));
  await db.delete(auditLog).where(eq(auditLog.entityId, 'risk_formula_test_marker'));
});

describe('histórico da fórmula do risco', () => {
  it('salvar cria versão válida desde hoje; no mesmo dia a edição substitui a versão', async () => {
    const { getRiskFormula, listRiskFormulaVersions, setRiskFormula } = await import('@/server/risk');
    const { todayInSaoPaulo } = await import('@/lib/deadlines');
    expect((await setRiskFormula(adminId, input('18'))).ok).toBe(true);
    expect((await setRiskFormula(adminId, input('19'))).ok).toBe(true);
    const v = await listRiskFormulaVersions();
    expect(v).toHaveLength(1);
    expect(v[0].effectiveFrom).toBe(todayInSaoPaulo());
    expect(v[0].formula.pct.juizado).toBe(19);
    expect((await getRiskFormula()).pct.juizado).toBe(19);
  });

  it('consulta por data usa a versão vigente na época', async () => {
    const { getRiskFormula } = await import('@/server/risk');
    const { db } = await import('@/db');
    const { riskFormulaVersion } = await import('@/db/schema/inbox');
    const { DEFAULT_RISK_FORMULA } = await import('@/lib/risk');
    const old = { ...DEFAULT_RISK_FORMULA, enabled: true, pct: { ...DEFAULT_RISK_FORMULA.pct, juizado: 10 } };
    await db.insert(riskFormulaVersion).values({ formula: JSON.stringify(old), effectiveFrom: '2026-01-01' });
    expect((await getRiskFormula('2026-06-30')).pct.juizado).toBe(10); // antes da mudança de hoje
    expect((await getRiskFormula('2026-01-01')).pct.juizado).toBe(10);
    expect((await getRiskFormula('2025-01-01')).pct.juizado).toBe(10); // antes da primeira: usa a primeira
    expect((await getRiskFormula('2099-01-01')).pct.juizado).toBe(19); // depois: a mais recente
    expect((await getRiskFormula()).pct.juizado).toBe(19);
  });
});
