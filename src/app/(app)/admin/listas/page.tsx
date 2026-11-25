import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { ActionForm } from '@/components/action-form';
import { requireAdmin } from '@/lib/auth/session';
import { LOOKUP_LABELS, LOOKUP_TYPES, type LookupType } from '@/db/schema/lookups';
import { DESCRIPTION_MAX, getLookups, setLookupActive } from '@/server/lookups';
import { RISK_CATEGORIES, RISK_CATEGORY_LABEL } from '@/lib/risk';
import { getRiskFormula, listRiskFormulaVersions } from '@/server/risk';
import { RiskSimulator } from './risk-simulator';
import { addLookupAction, saveRiskFormulaAction, updateDescriptionAction, updateInternalDaysAction } from './actions';

async function toggleAction(formData: FormData) {
  'use server';
  const s = await requireAdmin();
  await setLookupActive(s.user.id, String(formData.get('id')), formData.get('active') === 'true');
  revalidatePath('/admin/listas');
}

export default async function ListasPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await requireAdmin();
  const { tipo } = await searchParams;
  const isFormula = tipo === 'formula-risco';
  const type = (LOOKUP_TYPES.includes(tipo as LookupType) ? tipo : 'subject') as LookupType;
  const items = isFormula ? [] : (await getLookups([type], { includeInactive: true }))[type];
  const formula = isFormula ? await getRiskFormula() : null;
  const versions = isFormula ? await listRiskFormulaVersions() : [];
  const isTask = type === 'task_type';
  return (
    <>
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-extrabold">Listas oficiais</h1>
        <p className="text-[15px] text-text-muted">Valores fechados usados nos cadastros. Desativar um item não apaga o histórico.</p>
      </header>
      <div className="flex flex-wrap items-start gap-5">
        <nav aria-label="Tipos de lista" className="card flex flex-[1_1_240px] flex-col gap-0.5 p-2">
          {LOOKUP_TYPES.map((t) => (
            <Link key={t} href={`/admin/listas?tipo=${t}`} className="nav-link" aria-current={!isFormula && t === type ? 'page' : undefined}>{LOOKUP_LABELS[t]}</Link>
          ))}
          <Link href="/admin/listas?tipo=formula-risco" className="nav-link" aria-current={isFormula ? 'page' : undefined}>Fórmula do valor de risco</Link>
        </nav>
        {formula && (
          <section className="card flex min-w-0 flex-[3_1_480px] flex-col gap-3 p-5" aria-labelledby="h-formula">
            <h2 id="h-formula" className="text-[17px] font-extrabold">Fórmula do valor de risco</h2>
            <p className="text-sm leading-normal text-soft">
              Como na planilha do Jurídico: <strong>subtotal = valor da causa + valor da causa × percentual da categoria</strong>; <strong>honorários = subtotal × percentual de honorários</strong>;
              <strong> valor de risco = subtotal + honorários</strong>. A categoria vem do <strong>Foro / esfera</strong> do processo (Juizado ou Vara Cível); processo com mais meses que o limite
              (contados da data de recebimento ou citação) entra em <strong>Casos antigos (ajuste)</strong>. Trabalhista e Procon não usam esta fórmula.
              Quando está ligada e o campo “Valor de risco total” fica em branco (cadastro do processo e revisão de prognóstico), o sistema calcula; o que for digitado nunca é sobrescrito e processos já cadastrados não mudam.
              A mudança vale daqui para frente e fica na auditoria.
            </p>
            <ActionForm action={saveRiskFormulaAction} submitLabel="Salvar fórmula" className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="enabled" defaultChecked={formula.enabled} className="size-[18px] accent-primary" /> Calcular o valor de risco automaticamente quando estiver em branco</label>
              <div className="grid gap-3 sm:grid-cols-3">
                {RISK_CATEGORIES.map((k) => (
                  <label key={k} className="flex flex-col gap-1"><span className="label">{RISK_CATEGORY_LABEL[k]}: % sobre o valor da causa</span>
                    <input className="input" name={`pct_${k}`} inputMode="decimal" defaultValue={String(formula.pct[k]).replace('.', ',')} required /></label>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1"><span className="label">Honorários (% do subtotal)</span>
                  <input className="input" name="honorariosPct" inputMode="decimal" defaultValue={String(formula.honorariosPct).replace('.', ',')} required /></label>
                <label className="flex flex-col gap-1"><span className="label">“Casos antigos” a partir de (meses)</span>
                  <input className="input" name="oldMonths" type="number" min={1} defaultValue={formula.oldMonths} required /></label>
                <label className="flex flex-col gap-1"><span className="label">Salário mínimo vigente (R$)</span>
                  <input className="input" name="minimumWage" inputMode="decimal" defaultValue={formula.minimumWage === null ? '' : String(formula.minimumWage).replace('.', ',')} placeholder="ex.: 1.621,00" /></label>
              </div>
              <label className="flex flex-col gap-1 sm:max-w-md"><span className="label">Sem valor da causa quantificado, usar o teto dos juizados</span>
                <select className="input" name="fallbackCap" defaultValue={formula.fallbackCap}>
                  <option value="none">Não usar (deixa o valor de risco em branco)</option>
                  <option value="sem">{formula.capSem} salários mínimos (sem advogado)</option>
                  <option value="com">{formula.capCom} salários mínimos (com advogado)</option>
                </select></label>
            </ActionForm>
            <RiskSimulator formula={formula} versions={versions.map((v) => ({ effectiveFrom: v.effectiveFrom, formula: v.formula }))} />
            <div className="flex flex-col gap-2" aria-label="Histórico da fórmula">
              <h3 className="text-sm font-extrabold">Histórico de mudanças</h3>
              <p className="text-xs text-text-muted">Cada mudança vale a partir da data em que foi salva. Consultas de períodos anteriores usam a fórmula vigente na época.</p>
              <table className="tbl">
                <thead><tr><th>Vale desde</th><th>Juizado</th><th>Vara Cível</th><th>Casos antigos</th><th>Honorários</th><th>Ligada</th></tr></thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.id}>
                      <td>{v.effectiveFrom.split('-').reverse().join('/')}</td>
                      <td>{v.formula.pct.juizado}%</td><td>{v.formula.pct.vara}%</td><td>{v.formula.pct.antigo}% (&gt; {v.formula.oldMonths} meses)</td>
                      <td>{v.formula.honorariosPct}%</td><td>{v.formula.enabled ? 'Sim' : 'Não'}</td>
                    </tr>
                  ))}
                  {versions.length === 0 && <tr><td colSpan={6} className="text-text-muted">Nenhuma mudança salva ainda.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-text-muted">Exemplos da planilha para conferir no simulador: Juizado R$ 13.680,00 → R$ 19.370,88; Vara Cível R$ 5.000,00 → R$ 7.440,00; Casos antigos R$ 28.625,90 → R$ 46.373,96.</p>
          </section>
        )}
        {!formula && <section className="card flex min-w-0 flex-[3_1_480px] flex-col gap-3 p-5" aria-labelledby="h-lista">
          <h2 id="h-lista" className="text-[17px] font-extrabold">{LOOKUP_LABELS[type]}</h2>
          <div className="rounded-control bg-ai-bg px-3 py-2.5 text-[13px] leading-normal text-soft">
            <strong className="text-ai">Descrição de cada item:</strong> a IA lê esse texto na Triagem para escolher objeto, pedido e tipo de tarefa e para sugerir o prazo.
            Escreva <strong>quando usar o item</strong>
            {isTask ? <> e, nos tipos de tarefa, o <strong>prazo legal e a forma de contagem</strong>, se houver (ex.: “Contestação: 15 dias úteis a partir da juntada do mandado de citação”)</> : <> (ex.: situações em que se aplica e em que não se aplica)</>}.
            A IA só sugere; o prazo final é calculado pelo sistema e confirmado por uma advogada. Não coloque dados de pessoas.
          </div>
          <ActionForm action={addLookupAction} submitLabel="Adicionar" className="flex flex-col gap-2">
            <input type="hidden" name="type" value={type} />
            <input className="input" name="label" placeholder="Novo item" required aria-label="Novo item" />
            <textarea className="input min-h-16 py-2" name="description" maxLength={DESCRIPTION_MAX} placeholder="Descrição (opcional): quando usar este item" aria-label="Descrição do novo item" />
          </ActionForm>
          <table className="tbl">
            <thead><tr><th>Item e descrição</th><th>Situação</th><th></th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="min-w-0">
                    <div className="font-bold">{i.label}</div>
                    {i.description ? <p className="mt-0.5 max-w-prose whitespace-pre-line text-[13px] leading-normal text-soft">{i.description}</p> : <p className="mt-0.5 text-xs text-text-muted">Sem descrição</p>}
                    {isTask && (
                      <ActionForm action={updateInternalDaysAction} submitLabel="Salvar" variant="btn-secondary" className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={i.id} />
                        <label className="flex flex-col gap-1"><span className="label">Prazo interno: dias úteis antes do limite</span>
                          <input key={String(i.internalDays ?? '')} className="input w-28" name="internalDays" type="number" min={1} max={60} defaultValue={i.internalDays ?? ''} placeholder="sem regra" aria-label={`Dias úteis do prazo interno de ${i.label}`} /></label>
                      </ActionForm>
                    )}
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[13px] font-bold">{i.description ? 'Editar descrição' : 'Adicionar descrição'}</summary>
                      <ActionForm action={updateDescriptionAction} submitLabel="Salvar" variant="btn-secondary" className="mt-2 flex flex-col gap-2">
                        <input type="hidden" name="id" value={i.id} />
                        <textarea key={i.description ?? ''} className="input min-h-20 py-2" name="description" maxLength={DESCRIPTION_MAX} defaultValue={i.description ?? ''} aria-label={`Descrição de ${i.label}`} />
                        <span className="text-xs text-text-muted">Até {DESCRIPTION_MAX} caracteres.</span>
                      </ActionForm>
                    </details>
                  </td>
                  <td><span className={`badge ${i.active ? 'b-teal' : 'b-gray'}`}>{i.active ? 'Ativo' : 'Inativo'}</span></td>
                  <td className="text-right">
                    <form action={toggleAction}>
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="active" value={String(!i.active)} />
                      <button className="btn-ghost" type="submit">{i.active ? 'Desativar' : 'Reativar'}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>}
      </div>
    </>
  );
}
