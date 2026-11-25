'use client';

import { useState } from 'react';
import { fallbackBase, parseMoneyBr, riskBreakdown, RISK_CATEGORIES, RISK_CATEGORY_LABEL, type RiskCategory, type RiskFormula } from '@/lib/risk';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Simulador da fórmula (com os valores SALVOS): a pessoa confere os números contra a planilha antes de ligar. */
export function RiskSimulator({ formula: current, versions = [] }: { formula: RiskFormula; versions?: { effectiveFrom: string; formula: RiskFormula }[] }) {
  const [refDate, setRefDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }));
  // versão vigente na data de referência (a mais recente que começou até ela; antes da primeira, a primeira)
  const sorted = [...versions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const picked = sorted.filter((v) => v.effectiveFrom <= refDate).pop() ?? sorted[0];
  const formula = picked ? picked.formula : current;
  const [value, setValue] = useState('13.680,00');
  const [category, setCategory] = useState<RiskCategory>('juizado');
  const base = parseMoneyBr(value);
  const r = base !== null ? riskBreakdown(formula, category, base) : null;
  const cap = fallbackBase(formula);
  return (
    <div className="flex flex-col gap-3 rounded-control border border-border bg-bg p-4" aria-label="Simulador da fórmula">
      <h3 className="text-sm font-extrabold">Simulador (usa a fórmula vigente na data de referência)</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1"><span className="label">Data de referência</span>
          <input className="input w-44" type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} aria-label="Data de referência da fórmula" /></label>
        <label className="flex flex-col gap-1"><span className="label">Valor da causa (R$)</span>
          <input className="input w-44" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Valor da causa para simular" /></label>
        <label className="flex flex-col gap-1"><span className="label">Categoria</span>
          <select className="input w-52" value={category} onChange={(e) => setCategory(e.target.value as RiskCategory)} aria-label="Categoria para simular">
            {RISK_CATEGORIES.map((k) => <option key={k} value={k}>{RISK_CATEGORY_LABEL[k]}</option>)}
          </select></label>
      </div>
      {picked && <p className="text-xs text-text-muted">Versão da fórmula usada: vigente desde {picked.effectiveFrom.split('-').reverse().join('/')}.</p>}
      {r ? (
        <table className="tbl max-w-md" aria-label="Passo a passo do valor de risco">
          <tbody>
            <tr><td>Valor da causa</td><td className="text-right tabular-nums">{brl(r.base)}</td></tr>
            <tr><td>{formula.pct[category].toLocaleString('pt-BR')}% ({RISK_CATEGORY_LABEL[category]})</td><td className="text-right tabular-nums">{brl(r.adjust)}</td></tr>
            <tr><td className="font-bold">Subtotal</td><td className="text-right tabular-nums font-bold">{brl(r.subtotal)}</td></tr>
            <tr><td>{formula.honorariosPct.toLocaleString('pt-BR')}% de honorários</td><td className="text-right tabular-nums">{brl(r.honorarios)}</td></tr>
            <tr><td className="font-extrabold">Valor de risco</td><td className="text-right text-base font-extrabold tabular-nums" data-testid="risco-total">{brl(r.total)}</td></tr>
          </tbody>
        </table>
      ) : <p className="text-sm text-text-muted">Informe um valor da causa válido.</p>}
      {cap !== null && <p className="text-xs text-text-muted">Sem valor da causa quantificado, o sistema usa o teto dos juizados: {brl(cap)} ({formula.fallbackCap === 'sem' ? `${formula.capSem} salários mínimos, sem advogado` : `${formula.capCom} salários mínimos, com advogado`}).</p>}
    </div>
  );
}
