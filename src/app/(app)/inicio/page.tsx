import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { formatCaseNumber } from '@/lib/case-number';
import { todayInSaoPaulo, urgency } from '@/lib/deadlines';
import { dateBr, PORTFOLIO_LABEL } from '@/lib/format';
import { listPendingMovements, localHolidayWarnings } from '@/server/movements';
import { dashboardCounts, dueTodayAndLate, getHolidaySet } from '@/server/tasks';
import { SuggestionBox } from '../triagem/suggestion';

const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export default async function InicioPage() {
  const session = await requireUser();
  const today = todayInSaoPaulo();
  const [counts, rows, holidays, suggestionsPage, warnFor] = await Promise.all([
    dashboardCounts(today), dueTodayAndLate(today), getHolidaySet(),
    listPendingMovements({ withSuggestion: true }, { pageSize: 5 }), localHolidayWarnings(),
  ]);
  const suggestions = suggestionsPage.rows;
  const canWrite = session.user.role !== 'viewer';
  const first = session.user.name.split(' ')[0];
  const hour = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }).format(new Date()));
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  const kpis = [
    { label: 'Prazos hoje', value: counts.prazosHoje, hint: 'Tarefas com prazo para hoje', danger: true, href: '/tarefas' },
    { label: 'Tarefas atrasadas', value: counts.atrasadas, hint: 'Prazo já vencido', danger: true, href: '/tarefas' },
    { label: 'Processos novos a cadastrar', value: counts.inbox, hint: 'Aguardando classificação na Triagem', danger: false, href: '/triagem' },
    { label: 'Movimentações não lidas', value: counts.movimentacoes, hint: 'Alertas pendentes de decisão', danger: false, href: '/alertas' },
  ];

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[28px] font-extrabold">{greeting}, {first}</h1>
          </div>
          <p className="text-[15px] text-text-muted">
            {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full' }).format(new Date())}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-secondary" href="/processos">Buscar processo</Link>
          <Link className="btn" href="/tarefas">Abrir tarefas</Link>
        </div>
      </header>

      <section aria-label="Resumo do dia" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="card flex flex-col gap-1.5 p-5 no-underline hover:border-primary">
            <div className="text-[13px] font-bold text-text-muted">{k.label}</div>
            <div className={`text-[34px] font-extrabold ${k.danger && k.value > 0 ? 'text-link' : 'text-text'}`}>{k.value}</div>
            <div className="text-[13px] text-text-muted">{k.hint}</div>
          </Link>
        ))}
      </section>

      <section className="card flex flex-col gap-3 p-5" aria-labelledby="t-prazos">
        <div className="flex items-center justify-between gap-3">
          <h2 id="t-prazos" className="text-lg font-extrabold">Prazos de hoje e atrasados</h2>
          <Link href="/tarefas" className="text-sm font-bold">Ver quadro completo</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Processo</th><th>Ato</th><th>Carteira</th><th>Prazo</th><th>Responsável</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="text-text-muted">Nenhum prazo para hoje. 🎉</td></tr>}
              {rows.map((r) => {
                const u = urgency(r.dueDate, today, holidays);
                return (
                  <tr key={r.id}>
                    <td>
                      {r.caseId ? <Link className="font-bold" href={`/processos/${r.caseId}`}>{formatCaseNumber(r.caseNumber ?? '')}</Link> : <span className="font-bold">Tarefa geral</span>}
                      <div className="text-xs text-text-muted">{r.plaintiff ? `${r.plaintiff} x Foco` : r.title}</div>
                    </td>
                    <td>{r.typeLabel ?? r.title}</td>
                    <td>{r.portfolio ? <span className="badge b-gray">{PORTFOLIO_LABEL[r.portfolio]}</span> : '—'}</td>
                    <td><span className={`badge ${u === 'late' || u === 'today' ? 'b-red' : 'b-yel'}`}>{u === 'today' ? 'Hoje' : `Atrasado (${dateBr(r.dueDate)})`}</span></td>
                    <td>{r.ownerName ?? 'Sem responsável'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card flex flex-col gap-3 p-5" aria-labelledby="t-mov">
        <div className="flex flex-col gap-1">
          <h2 id="t-mov" className="text-lg font-extrabold">Movimentações com sugestão da IA</h2>
          <p className="text-[13px] text-text-muted">Nenhuma tarefa é criada sem a sua confirmação.</p>
        </div>
        {suggestions.length === 0 && <p className="text-sm text-text-muted">Nenhuma sugestão pendente.</p>}
        {suggestions.map((m) => (
          <article key={m.id} className="flex flex-col gap-2 rounded-xl border border-border p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {m.caseId ? <Link className="text-sm font-extrabold" href={`/processos/${m.caseId}`}>{formatCaseNumber(m.caseNumber ?? '')}</Link> : <span className="text-sm font-extrabold">{m.title ?? 'Sem processo'}</span>}
              <span className="text-xs text-text-muted">{m.source} · {dateBr(m.occurredAt)}</span>
            </div>
            <p className="text-sm leading-normal">{m.aiSummary ?? m.rawText?.slice(0, 200)}</p>
            {canWrite && (
              <SuggestionBox movementId={m.id} suggestionId={m.sugId} act={m.sugAct} days={m.sugDays} dayCount={m.sugCount} dueDate={m.sugDue}
                dueLabel={dateBr(m.sugDue)} basis={m.sugBasis} confidence={m.sugConf ? Number(m.sugConf) : null} warn={warnFor(m.state)} />
            )}
          </article>
        ))}
        {suggestionsPage.total > suggestions.length && <Link href="/alertas?comprazo=1" className="text-sm font-bold">Ver todas em Alertas ({suggestionsPage.total})</Link>}
      </section>
    </>
  );
}
