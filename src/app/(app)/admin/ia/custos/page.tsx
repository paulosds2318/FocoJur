import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { PeriodFilter } from '@/components/period-filter';
import { requireAdmin } from '@/lib/auth/session';
import { dateBr } from '@/lib/format';
import { PERIOD_MODES_CUSTOS, parsePeriod, periodParams } from '@/lib/period';
import { costOverview, fetchCredits, TASK_LABEL } from '@/server/ai-admin';
import type { AiTask } from '@/db/schema/ai';
import { budgetAction, fxAction } from '../actions';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function CustosPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const period = parsePeriod({ periodo: one(sp.periodo), mes: one(sp.mes), ano: one(sp.ano), de: one(sp.de), ate: one(sp.ate) }, { allowed: PERIOD_MODES_CUSTOS, fallback: 'month' });
  const cur = one(sp.moeda) === 'USD' ? 'USD' : 'BRL';
  const [d, credits] = await Promise.all([costOverview(period), fetchCredits()]);
  const fmt = (brl: number | string, usd: number | string) =>
    cur === 'BRL' ? `R$ ${Number(brl).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `US$ ${Number(usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  const usdOfBrl = (brl: number) => (d.ptax || d.manual ? brl / Number((d.manual && Number(d.manual.rate) > 0 ? d.manual : d.ptax)!.rate) : 0);
  const maxDay = Math.max(0.0001, ...d.perDay.map((x) => Number(x.brl)));
  const b = d.budget;
  const link = (o: Record<string, string>) => `/admin/ia/custos?${new URLSearchParams({ ...periodParams(period), moeda: cur, ...o })}`;
  const chip = (on: boolean) => `inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-bold no-underline ${on ? 'border-text bg-text text-on-text hover:text-on-text' : 'border-input-border bg-surface text-soft'}`;

  const kpis = [
    { label: 'Custo no período', value: fmt(d.t.period_brl, d.t.period_usd), hint: period.label },
    { label: 'Chamadas no período', value: String(d.t.period_n), hint: 'Todas as tarefas' },
    { label: 'Tokens no período', value: `${(Number(d.t.period_tokens) / 1_000_000).toFixed(2)} mi`, hint: 'Entrada + saída' },
    { label: 'Custo hoje', value: fmt(d.t.today_brl, usdOfBrl(Number(d.t.today_brl))), hint: `${d.t.today_n} chamadas` },
    { label: 'Projeção do mês atual', value: fmt(d.projectionBrl, usdOfBrl(d.projectionBrl)), hint: 'No ritmo atual' },
    { label: 'Saldo no OpenRouter', value: credits ? `US$ ${(credits.total - credits.usage).toFixed(2)}` : '—', hint: credits ? 'Créditos disponíveis' : 'Exige chave de gerenciamento' },
  ];

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-extrabold">Custos de IA</h1>
          <p className="text-[15px] text-text-muted">Custo e tokens de cada chamada ao OpenRouter, em reais e dólares.</p>
        </div>
        <div role="group" aria-label="Moeda" className="flex gap-2">
          {([['BRL', 'R$'], ['USD', 'US$']] as const).map(([k, l]) => <Link key={k} className={chip(cur === k)} href={link({ moeda: k })}>{l}</Link>)}
        </div>
      </header>

      <section aria-label="Filtro de período" className="flex flex-col gap-2">
        <PeriodFilter
          basePath="/admin/ia/custos" period={period} keep={{ moeda: cur }}
          modes={[{ key: 'today', label: 'Hoje' }, { key: '7d', label: '7 dias' }, { key: 'month', label: 'Mês atual' }, { key: 'ym', label: 'Mês e ano' }, { key: 'custom', label: 'Período personalizado' }]}
        />
        <p className="text-[13px] text-text-muted">Período mostrado: <strong>{period.label}</strong>. Resumo, custo por dia e tabela por tarefa e modelo seguem este período; “Custo hoje”, a projeção e o limite mensal são sempre do mês atual.</p>
      </section>

      <section aria-label="Resumo de custos" className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="card flex flex-col gap-1 p-[18px]"><div className="text-[13px] font-bold text-text-muted">{k.label}</div><div className="text-[26px] font-extrabold">{k.value}</div><div className="text-[13px] text-text-muted">{k.hint}</div></div>
        ))}
      </section>

      <section className="card flex flex-col gap-2.5 px-5 py-[18px]" aria-labelledby="h-lim">
        <div className="flex flex-wrap justify-between gap-2">
          <h2 id="h-lim" className="text-base font-extrabold">Limite mensal: {b.pct === null ? 'não definido' : `${Math.round(b.pct)}% usado`}</h2>
          <span className="badge b-yel">Alerta em 80% e 100%</span>
        </div>
        <div className="h-3.5 overflow-hidden rounded-[7px] bg-surface-3"><div className="h-full rounded-[7px] bg-primary" style={{ width: `${Math.min(100, b.pct ?? 0)}%` }} /></div>
        <div className="text-[13px] text-text-muted">R$ {b.spent.toFixed(2)} de {b.limit === null ? '—' : `R$ ${b.limit.toFixed(2)}`} no mês. Ao atingir 100%: {process.env.AI_SUSPEND_AT_LIMIT === 'true' ? 'a IA é suspensa até um admin liberar' : 'só alerta (decisão em aberto no PRD, questão 5)'}.</div>
        <ActionForm action={budgetAction} submitLabel="Salvar limite" variant="btn-secondary" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1"><span className="label">Limite do mês (R$)</span><input className="input w-48" name="limit" inputMode="decimal" defaultValue={b.limit ?? ''} placeholder="500,00" /></label>
        </ActionForm>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-4">
        <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-dia">
          <div><h2 id="h-dia" className="text-[17px] font-extrabold">{d.granularity === 'day' ? 'Custo por dia' : 'Custo por mês'}</h2><p className="mt-1 text-[13px] text-text-muted">{period.label}, em R$</p></div>
          {d.perDay.length === 0 ? <p className="text-sm text-text-muted">Nenhuma chamada neste período.</p> : (
            <>
              <div className="flex h-[180px] items-end gap-1.5 border-b border-input-border">
                {d.perDay.map((x) => <div key={x.k} title={`${x.k}: R$ ${Number(x.brl).toFixed(4)}`} className="min-w-[3px] flex-1 rounded-t bg-[#f4a3a3]" style={{ height: `${(Number(x.brl) / maxDay) * 170}px` }} />)}
              </div>
              <div className="flex gap-1.5 text-[11px] text-text-muted">{d.perDay.map((x) => <div key={x.k} className="min-w-[3px] flex-1 overflow-hidden text-center">{x.label}</div>)}</div>
            </>
          )}
        </section>

        <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-cambio">
          <h2 id="h-cambio" className="text-[17px] font-extrabold">Câmbio usado na conversão</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><div className="label">PTAX mais recente (Banco Central)</div><div className="text-[22px] font-extrabold">{d.ptax ? `R$ ${Number(d.ptax.rate).toFixed(4)}` : '—'}</div><div className="text-xs text-text-muted">{d.ptax ? `de ${dateBr(d.ptax.date)}` : 'Ainda não buscada (job diário às 13h30)'}</div></div>
            <div><div className="label">Cotação fixada pelo admin</div><div className="text-[22px] font-extrabold">{d.manual && Number(d.manual.rate) > 0 ? `R$ ${Number(d.manual.rate).toFixed(4)}` : 'Usando PTAX'}</div></div>
          </div>
          <ActionForm action={fxAction} submitLabel="Salvar cotação" variant="btn-secondary" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1"><span className="label">Nova cotação (vazio remove a manual)</span><input className="input w-48" name="rate" inputMode="decimal" placeholder="Usar PTAX automática" /></label>
          </ActionForm>
          <p className="text-[13px] text-text-muted">Cada chamada guarda a cotação do dia em que aconteceu. Mudar a cotação não altera o histórico.</p>
        </section>
      </div>

      <section className="card flex flex-col gap-2 pt-5" aria-labelledby="h-mod">
        <h2 id="h-mod" className="mx-3 text-[17px] font-extrabold">Por tarefa e modelo</h2>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Tarefa</th><th>Modelo</th><th className="text-right">Chamadas</th><th className="text-right">Tokens entrada</th><th className="text-right">Tokens saída</th><th className="text-right">Custo</th><th className="text-right">Tempo médio</th><th className="text-right">Erros</th><th className="text-right">Aceite</th></tr></thead>
            <tbody>
              {d.byTask.length === 0 && <tr><td colSpan={9} className="text-text-muted">Sem chamadas no período.</td></tr>}
              {d.byTask.map((r, i) => (
                <tr key={i}>
                  <td className="font-extrabold">{TASK_LABEL[r.task as AiTask]?.name ?? String(r.task)}</td><td>{String(r.model)}</td>
                  <td className="text-right tabular-nums">{r.calls}</td><td className="text-right tabular-nums">{Number(r.tin).toLocaleString('pt-BR')}</td><td className="text-right tabular-nums">{Number(r.tout).toLocaleString('pt-BR')}</td>
                  <td className="text-right tabular-nums">{fmt(r.brl as string, r.usd as string)}</td>
                  <td className="text-right tabular-nums">{r.latency ? `${(Number(r.latency) / 1000).toFixed(1)} s` : '—'}</td>
                  <td className="text-right tabular-nums">{Math.round(Number(r.err) * 100)}%</td>
                  <td className="text-right tabular-nums">{r.accept === null ? '—' : `${Math.round(Number(r.accept) * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-[13px] text-text-muted">
          <span>Também disponível por usuária e por processo no CSV.</span>
          <a className="btn-secondary" href={`/admin/ia/custos/export?${new URLSearchParams(periodParams(period))}`}>Exportar CSV</a>
        </div>
      </section>
    </>
  );
}
