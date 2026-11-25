import Link from 'next/link';
import { PeriodFilter } from '@/components/period-filter';
import { requireUser } from '@/lib/auth/session';
import { money, PROGNOSIS_LABEL } from '@/lib/format';
import { MONTH_NAMES, PERIOD_MODES_PAINEIS, parsePeriod, periodParams } from '@/lib/period';
import { dashboardData } from '@/server/dashboards';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default async function PaineisPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser();
  const sp = await searchParams;
  const pf = (['civil', 'labor', 'procon'].includes(one(sp.carteira)) ? one(sp.carteira) : '') as 'civil' | 'labor' | 'procon' | '';
  const period = parsePeriod({ periodo: one(sp.periodo), mes: one(sp.mes), ano: one(sp.ano), de: one(sp.de), ate: one(sp.ate) }, { allowed: PERIOD_MODES_PAINEIS, fallback: 'all' });
  const ranged = period.mode !== 'all';
  const d = await dashboardData(pf, period);
  const carteiraHref = (v: string) => `/paineis?${new URLSearchParams({ ...(v ? { carteira: v } : {}), ...(ranged ? periodParams(period) : {}) })}`;
  const k = d.kpi;
  const avoidPct = k.avoid_known > 0 ? Math.round((k.avoid_yes / k.avoid_known) * 100) : null;
  const totalRisk = d.contingency.reduce((s, c) => s + Number(c.total), 0);
  const maxMonth = Math.max(1, ...d.months.flatMap((m) => [m.entries, m.closed]));
  const maxSubject = Math.max(1, ...d.bySubject.map((s) => s.n));

  const kpis = [
    { label: 'Em andamento', value: String(k.open), hint: ranged ? 'Dos processos recebidos no período' : 'Cível, Trabalhista e Procon' },
    { label: 'Valor de risco total', value: money(k.risk_total), hint: 'Provável + possível' },
    { label: ranged ? 'Entradas no período' : 'Entradas no mês', value: String(k.entries_period), hint: ranged ? 'Processos recebidos no período' : 'Processos recebidos' },
    { label: ranged ? 'Encerrados no período' : 'Encerrados no mês', value: String(k.closed_period), hint: ranged ? 'Com data de encerramento no período' : 'Com data de encerramento no mês' },
    { label: 'Evitáveis', value: avoidPct === null ? '—' : `${avoidPct}%`, hint: 'Dos processos com análise preenchida' },
    { label: 'Carteira parada', value: String(k.stale), hint: 'Em andamento sem movimentação há 90+ dias' },
  ];

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-extrabold">Painéis</h1>
          <p className="text-[15px] text-text-muted">Contingência e causa raiz, atualizados sozinhos. Substitui as abas Gráficos, Painel Inicial e Indicadores Procon.</p>
        </div>
        <div role="group" aria-label="Carteira" className="flex flex-wrap gap-2">
          {[['', 'Todas'], ['civil', 'Cível'], ['labor', 'Trabalhista'], ['procon', 'Procon']].map(([v, l]) => (
            <Link key={v} href={carteiraHref(v)} aria-current={pf === v ? 'true' : undefined}
              className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-bold no-underline ${pf === v ? 'border-text bg-text text-on-text hover:text-on-text' : 'border-input-border bg-surface text-soft'}`}>{l}</Link>
          ))}
        </div>
      </header>

      <section aria-label="Filtro de período" className="flex flex-col gap-2">
        <PeriodFilter
          basePath="/paineis" period={period} keep={pf ? { carteira: pf } : {}}
          modes={[{ key: 'all', label: 'Visão geral' }, { key: 'ym', label: 'Mês e ano' }, { key: 'custom', label: 'Período personalizado' }]}
        />
        <p className="text-[13px] text-text-muted">
          {ranged
            ? <>Período: <strong>{period.label}</strong>. Entradas, valor de risco, contingência, objetos, lojas, evitáveis, carteira parada e Procon consideram os processos <strong>recebidos</strong> no período; “Encerrados” conta os encerrados no período, qualquer que seja a entrada; o gráfico mostra {period.mode === 'ym' ? 'os 12 meses até o mês escolhido' : 'os meses do período'}.</>
            : <>Sem filtro de período: retrato de hoje; o gráfico mostra os últimos 12 meses. Escolha “Mês e ano” ou “Período personalizado” para analisar os processos recebidos em um intervalo.</>}
        </p>
      </section>

      <section aria-label="Indicadores" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {kpis.map((x) => (
          <div key={x.label} className="card flex flex-col gap-1 p-[18px]">
            <div className="text-[13px] font-bold text-text-muted">{x.label}</div>
            <div className="text-[28px] font-extrabold">{x.value}</div>
            <div className="text-[13px] text-text-muted">{x.hint}</div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-4">
        <section className="card flex flex-col gap-3.5 p-5" aria-labelledby="h-ent">
          <div><h2 id="h-ent" className="text-[17px] font-extrabold">Entradas e encerramentos por mês</h2><p className="mt-1 text-[13px] text-text-muted">{period.mode === 'ym' ? `12 meses até ${MONTH_NAMES[period.month - 1]} de ${period.year}` : period.mode === 'custom' ? period.label : 'Últimos 12 meses'}</p></div>
          <div className="flex gap-4 text-xs font-bold text-soft">
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] bg-primary" />Entradas</span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] bg-[#9a9aa0]" />Encerramentos</span>
          </div>
          <div className={`flex h-[200px] items-end border-b border-input-border ${d.months.length > 12 ? 'gap-px' : 'gap-2.5'}`}>
            {d.months.map((m) => (
              <div key={m.m} className="flex h-full min-w-0 flex-1 items-end justify-center gap-px">
                <div title={`Entradas: ${m.entries}`} className="w-[40%] rounded-t bg-primary" style={{ height: `${(m.entries / maxMonth) * 190}px` }} />
                <div title={`Encerramentos: ${m.closed}`} className="w-[40%] rounded-t bg-[#9a9aa0]" style={{ height: `${(m.closed / maxMonth) * 190}px` }} />
              </div>
            ))}
          </div>
          <div className={`flex text-xs text-text-muted ${d.months.length > 12 ? 'gap-px text-[9px]' : 'gap-2.5'}`}>
            {d.months.map((m) => <div key={m.m} className="min-w-0 flex-1 overflow-hidden text-center">{MONTHS[Number(m.m.slice(5)) - 1]}{d.months.length > 12 ? `/${m.m.slice(2, 4)}` : ''}</div>)}
          </div>
          <table className="sr-only"><caption>Dados do gráfico</caption><tbody>{d.months.map((m) => <tr key={m.m}><td>{m.m}</td><td>{m.entries} entradas</td><td>{m.closed} encerramentos</td></tr>)}</tbody></table>
        </section>

        <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-obj">
          <div><h2 id="h-obj" className="text-[17px] font-extrabold">Processos ativos por objeto</h2><p className="mt-1 text-[13px] text-text-muted">Barra escura: parcela marcada como evitável pela Foco</p></div>
          {d.bySubject.length === 0 && <p className="text-sm text-text-muted">Sem dados ainda.</p>}
          {d.bySubject.map((s) => (
            <div key={s.label} className="grid grid-cols-[minmax(110px,200px)_minmax(0,1fr)_40px] items-center gap-3 text-sm">
              <span className="font-bold">{s.label}</span>
              <div className="h-3.5 overflow-hidden rounded-[7px] bg-surface-3">
                <div className="flex h-full rounded-[7px] bg-[#f4a3a3]" style={{ width: `${(s.n / maxSubject) * 100}%` }}>
                  <div className="h-full rounded-[7px] bg-primary" style={{ width: `${(s.avoidable / s.n) * 100}%` }} />
                </div>
              </div>
              <span className="text-right font-extrabold tabular-nums">{s.n}</span>
            </div>
          ))}
        </section>

        <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-prog">
          <h2 id="h-prog" className="text-[17px] font-extrabold">Contingência por prognóstico</h2>
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Prognóstico</th><th className="text-right">Processos</th><th className="text-right">Valor de risco</th><th className="text-right">% do risco</th></tr></thead>
            <tbody>
              {(['probable', 'possible', 'remote'] as const).map((p) => {
                const row = d.contingency.find((c) => c.prognosis === p);
                return (
                  <tr key={p}>
                    <td className="font-bold">{PROGNOSIS_LABEL[p]}</td>
                    <td className="text-right tabular-nums">{row?.n ?? 0}</td>
                    <td className="text-right tabular-nums">{money(row?.total ?? 0)}</td>
                    <td className="text-right tabular-nums">{totalRisk ? `${Math.round((Number(row?.total ?? 0) / totalRisk) * 100)}%` : '—'}</td>
                  </tr>
                );
              })}
              <tr><td className="font-extrabold">Total</td><td className="text-right font-extrabold tabular-nums">{d.contingency.reduce((s, c) => s + c.n, 0)}</td><td className="text-right font-extrabold tabular-nums">{money(totalRisk)}</td><td className="text-right font-extrabold">{totalRisk ? '100%' : '—'}</td></tr>
            </tbody>
          </table></div>
        </section>

        <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-loja">
          <h2 id="h-loja" className="text-[17px] font-extrabold">Lojas com mais processos evitáveis</h2>
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Loja</th><th>Principal objeto</th><th className="text-right">Evitáveis</th><th className="text-right">Valor pago</th></tr></thead>
            <tbody>
              {d.stores.length === 0 && <tr><td colSpan={4} className="text-text-muted">Marque processos como evitáveis na causa raiz para alimentar este quadro.</td></tr>}
              {d.stores.map((s) => (
                <tr key={s.store}><td className="font-bold">{s.store}</td><td>{s.subject ?? '—'}</td><td className="text-right tabular-nums">{s.n}</td><td className="text-right tabular-nums">{money(s.paid)}</td></tr>
              ))}
            </tbody>
          </table></div>
        </section>

        {(pf === '' || pf === 'procon') && (
          <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-procon">
            <div><h2 id="h-procon" className="text-[17px] font-extrabold">Procon: reclamações em andamento por órgão</h2><p className="mt-1 text-[13px] text-text-muted">Indicadores do Procon a validar com o Jurídico (RF-55).</p></div>
            <div className="overflow-x-auto"><table className="tbl">
              <thead><tr><th>Órgão</th><th className="text-right">Em andamento</th></tr></thead>
              <tbody>
                {d.procon.length === 0 && <tr><td colSpan={2} className="text-text-muted">Sem reclamações do Procon cadastradas.</td></tr>}
                {d.procon.map((p) => <tr key={p.label}><td className="font-bold">{p.label}</td><td className="text-right tabular-nums">{p.n}</td></tr>)}
              </tbody>
            </table></div>
          </section>
        )}
      </div>
    </>
  );
}
