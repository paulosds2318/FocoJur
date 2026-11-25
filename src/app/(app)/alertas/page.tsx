import Link from 'next/link';
import { BatchBar } from '@/components/batch-bar';
import { Pager } from '@/components/pager';
import { SelectAll } from '@/components/select-all';
import { requireUser } from '@/lib/auth/session';
import { formatCaseNumber } from '@/lib/case-number';
import { dateBr, dateTimeBr, PORTFOLIO_LABEL } from '@/lib/format';
import { parsePage } from '@/lib/pagination';
import { alertHistory, alertTotals, daysPending, describeAlertEvent, getAlert, listAlerts, type AlertRow, type AlertView } from '@/server/alerts';
import { ownersForReview } from '@/server/inbox';
import { getLookups } from '@/server/lookups';
import { DISCARD_REASONS, localHolidayWarnings } from '@/server/movements';
import { batchAction } from '../triagem/actions';
import { DiscardBox, LinkBox, SuggestionBox, TaskBox } from '../triagem/suggestion';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const SOURCES: Record<string, string> = { djen: 'DJEN', domicilio: 'Domicílio Judicial', datajud: 'DataJud', portal: 'Portal do tribunal' };
const VIEWS: [AlertView, string][] = [['pending', 'Pendentes'], ['handled', 'Tratados'], ['all', 'Todos']];
const OUTCOME: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendente', cls: 'b-red' }, task_created: { label: 'Tarefa criada', cls: 'b-teal' },
  discarded: { label: 'Ignorado', cls: 'b-gray' }, linked: { label: 'Lido', cls: 'b-gray' },
};
const snippet = (r: AlertRow) => (r.aiSummary ?? r.rawText ?? '').replace(/\s+/g, ' ').slice(0, 110);

export default async function AlertasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireUser();
  const sp = await searchParams;
  const view = (VIEWS.some(([k]) => k === one(sp.vista)) ? one(sp.vista) : 'pending') as AlertView;
  const f = {
    view, source: one(sp.fonte), state: one(sp.uf), portfolio: one(sp.carteira), unlinked: one(sp.semprocesso) === '1', withSuggestion: one(sp.comprazo) === '1',
    outcome: one(sp.desfecho), decidedBy: one(sp.por), from: one(sp.de), to: one(sp.ate),
  };
  const canWrite = session.user.role !== 'viewer';
  const [data, totals, warnFor, lk, people] = await Promise.all([
    listAlerts(f, { page: parsePage(sp.p) }), alertTotals(), localHolidayWarnings(), getLookups(['task_type']), ownersForReview(),
  ]);
  const types = lk.task_type.map((t) => ({ id: t.id, label: t.label, description: t.description }));
  const owners = people.map((u) => ({ id: u.id, label: u.name }));
  const rows = data.rows;

  // painel: o alerta escolhido; se ele saiu da fila (foi decidido) ou nada foi escolhido, abre o próximo da lista
  const wanted = one(sp.item);
  const sel = rows.find((r) => r.id === wanted) ?? (view === 'pending' || !wanted ? rows[0] : null) ?? (wanted ? await getAlert(wanted) : null);
  const history = sel ? await alertHistory(sel.id) : [];

  const chip = (on: boolean) => `inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-bold no-underline ${on ? 'border-text bg-text text-on-text hover:text-on-text' : 'border-input-border bg-surface text-soft'}`;
  const base = { vista: view === 'pending' ? '' : view, fonte: f.source, uf: f.state, carteira: f.portfolio, semprocesso: f.unlinked ? '1' : '', comprazo: f.withSuggestion ? '1' : '', desfecho: f.outcome, por: f.decidedBy, de: f.from, ate: f.to };
  const href = (o: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...base, ...o })) if (v) p.set(k, v);
    const q = p.toString();
    return q ? `/alertas?${q}` : '/alertas';
  };
  const handled = view !== 'pending';
  const criada = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.criada)) ? one(sp.criada) : '';

  return (
    <>
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-extrabold">Alertas</h1>
        <p className="text-[15px] text-text-muted">
          Cada publicação ou movimentação de processo já cadastrado é um alerta. Ele fica em <strong>Pendentes</strong> até alguém decidir: criar a tarefa (o alerta vira lido) ou ignorar com motivo.
          Em <strong>Tratados</strong> está o histórico do que já foi decidido. Processos que ainda não existem no FocoJur ficam na Triagem.
        </p>
      </header>

      {criada && <p role="status" className="rounded-control bg-ok-bg px-3.5 py-2.5 text-sm font-bold text-ok">Tarefa criada com prazo limite em {dateBr(criada)}. O alerta ficou como lido.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Situação dos alertas" className="flex flex-wrap gap-2">
          {VIEWS.map(([k, l]) => (
            <Link key={k} className={chip(view === k)} aria-current={view === k ? 'true' : undefined} href={href({ vista: k === 'pending' ? '' : k, item: '', p: '', desfecho: '', por: '', de: '', ate: '' })}>
              {l}{k === 'pending' ? ` · ${totals.pending}` : k === 'handled' ? ` · ${totals.handled}` : ` · ${totals.pending + totals.handled}`}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!handled && <Link className={chip(f.withSuggestion)} href={href({ comprazo: f.withSuggestion ? '' : '1', p: '', item: '' })}>Com prazo sugerido</Link>}
          <Link className={chip(f.unlinked)} href={href({ semprocesso: f.unlinked ? '' : '1', p: '', item: '' })}>Sem processo vinculado</Link>
        </div>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3 p-3.5" aria-label="Filtros">
        {base.vista && <input type="hidden" name="vista" value={base.vista} />}
        {f.unlinked && <input type="hidden" name="semprocesso" value="1" />}
        {f.withSuggestion && !handled && <input type="hidden" name="comprazo" value="1" />}
        <label className="flex flex-col gap-1"><span className="label">Fonte</span>
          <select className="input w-44" name="fonte" defaultValue={f.source}><option value="">Todas</option>{Object.entries(SOURCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="label">UF</span><input className="input w-16" name="uf" maxLength={2} defaultValue={f.state} /></label>
        {handled && (
          <>
            <label className="flex flex-col gap-1"><span className="label">Desfecho</span>
              <select className="input w-40" name="desfecho" defaultValue={f.outcome}><option value="">Todos</option><option value="task_created">Tarefa criada</option><option value="discarded">Ignorado</option><option value="linked">Lido (antigo)</option></select></label>
            <label className="flex flex-col gap-1"><span className="label">Decidido por</span>
              <select className="input w-44" name="por" defaultValue={f.decidedBy}><option value="">Qualquer pessoa</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="label">Tratado de</span><input className="input" type="date" name="de" defaultValue={f.from} /></label>
            <label className="flex flex-col gap-1"><span className="label">até</span><input className="input" type="date" name="ate" defaultValue={f.to} /></label>
          </>
        )}
        <button className="btn-secondary" type="submit">Filtrar</button>
        {(f.source || f.state || f.outcome || f.decidedBy || f.from || f.to) && <Link className="text-sm font-bold" href={href({ fonte: '', uf: '', desfecho: '', por: '', de: '', ate: '', p: '', item: '' })}>Limpar filtros</Link>}
      </form>

      <form id="batch" action={batchAction} />
      {data.total === 0 ? (
        <section className="card p-5 text-sm text-text-muted">
          {view === 'pending' ? 'Nenhum alerta pendente. As publicações e movimentações chegam pelos conectores.' : 'Nenhum alerta tratado para esses filtros.'}
        </section>
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          <section className="card min-w-0 flex-[2_1_380px] p-2 pb-0" aria-label="Lista de alertas">
            {canWrite && view === 'pending' && (
              <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <SelectAll name="ids" form="batch" />
                <span className="text-xs text-text-muted">Marque alertas para ignorar vários de uma vez.</span>
              </div>
            )}
            <ul className="flex flex-col">
              {rows.map((r) => {
                const st = OUTCOME[r.status] ?? OUTCOME.pending;
                return (
                  <li key={r.id} className={`flex gap-3 border-t border-border px-3 py-3 ${sel?.id === r.id ? 'bg-selected' : ''}`}>
                    {canWrite && view === 'pending' && <input form="batch" type="checkbox" name="ids" value={r.id} aria-label="Selecionar item" className="mt-1 size-[18px] shrink-0 accent-primary" />}
                    <Link href={href({ item: r.id })} className="flex min-w-0 flex-1 flex-col gap-1 no-underline hover:no-underline" aria-current={sel?.id === r.id ? 'true' : undefined}>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-extrabold text-text">{r.caseId ? formatCaseNumber(r.caseNumber ?? '') : (r.title ?? 'Sem processo vinculado')}</span>
                        {view !== 'pending' && <span className={`badge ${st.cls}`}>{st.label}</span>}
                        {!r.caseId && <span className="badge b-red">Sem processo</span>}
                      </span>
                      <span className="text-[13px] leading-snug text-soft">{snippet(r) || '—'}</span>
                      <span className="text-xs text-text-muted">{SOURCES[r.source]} · chegou em {dateTimeBr(r.arrivedAt)}{r.state ? ` · ${r.state}` : ''}{view !== 'pending' && r.readAt ? ` · tratado em ${dateTimeBr(r.readAt)}` : ''}</span>
                      {r.status === 'pending' && <span className={`text-xs font-bold ${daysPending(r.arrivedAt) >= 2 ? 'text-danger' : 'text-warn'}`}>{daysPending(r.arrivedAt) === 0 ? 'Chegou hoje' : `Pendente há ${daysPending(r.arrivedAt)} ${daysPending(r.arrivedAt) === 1 ? 'dia' : 'dias'}`}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Pager page={data.page} size={data.pageSize} total={data.total} href={(p) => href({ p: String(p), item: '' })} label="alertas" />
          </section>

          {sel && (
            <aside key={sel.id} className="card flex min-w-0 flex-[3_1_460px] flex-col gap-4 p-5" aria-label="Detalhe do alerta">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {sel.caseId ? <Link className="text-[17px] font-extrabold" href={`/processos/${sel.caseId}`}>{formatCaseNumber(sel.caseNumber ?? '')}</Link> : <span className="text-[17px] font-extrabold">{sel.title ?? 'Sem processo vinculado'}</span>}
                  <span className={`badge ${(OUTCOME[sel.status] ?? OUTCOME.pending).cls}`}>{(OUTCOME[sel.status] ?? OUTCOME.pending).label}</span>
                  {sel.portfolio && <span className="badge b-gray">{PORTFOLIO_LABEL[sel.portfolio]}</span>}
                  {sel.termId && <span className="badge b-gray">Termo monitorado</span>}
                </div>
                <span className="text-[13px] text-text-muted">{SOURCES[sel.source]} · publicado em {dateTimeBr(sel.occurredAt)}{sel.state ? ` · ${sel.state}` : ''}</span>
              </div>

              {sel.status !== 'pending' && (
                <div className="rounded-control bg-bg px-3.5 py-3 text-sm leading-normal">
                  <div className="text-xs font-extrabold text-text-muted">Decisão</div>
                  {sel.status === 'task_created' && (
                    <p>
                      <strong>Tarefa criada</strong>{sel.taskTitle ? <>: {sel.taskId ? <Link className="font-bold" href={`/tarefas/${sel.taskId}`}>{sel.taskTitle}</Link> : sel.taskTitle}</> : ''}
                      {sel.taskDue ? <> · prazo limite {dateBr(sel.taskDue)}</> : ''}{sel.taskInternalDue ? <> · prazo interno {dateBr(sel.taskInternalDue)}</> : ''}.
                    </p>
                  )}
                  {sel.status === 'discarded' && <p><strong>Ignorado</strong>{sel.discardReason ? <>: {sel.discardReason}</> : ''}.</p>}
                  {sel.status === 'linked' && <p><strong>Lido</strong> (marcação antiga, sem tarefa).</p>}
                  <p className="text-xs text-text-muted">Por {sel.readerName ?? '—'} em {dateTimeBr(sel.readAt)}.</p>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <div className="text-xs font-extrabold text-ai">Resumo da IA</div>
                <div className="text-sm leading-normal">{sel.aiSummary ?? <span className="text-text-muted">Sem resumo (IA não configurada ou ainda não processado).</span>}</div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-xs font-extrabold text-text-muted">Texto original</div>
                <div className="max-h-72 overflow-auto rounded-control bg-bg px-3 py-2.5 text-[13px] leading-normal text-soft">{sel.rawText}</div>
              </div>

              {canWrite && sel.status === 'pending' && (
                <>
                  <SuggestionBox
                    movementId={sel.id} suggestionId={sel.sugId} act={sel.sugAct} days={sel.sugDays} dayCount={sel.sugCount} dueDate={sel.sugDue}
                    dueLabel={dateBr(sel.sugDue)} basis={sel.sugBasis} confidence={sel.sugConf ? Number(sel.sugConf) : null} warn={warnFor(sel.state)}
                  />
                  {sel.caseId ? (
                    <div className="flex flex-col gap-2 border-t border-border pt-3">
                      <h3 className="text-sm font-extrabold">Criar tarefa</h3>
                      <TaskBox alwaysOpen back="alertas" movementId={sel.id} defaultTitle={sel.sugAct ?? sel.title ?? ''} types={types} owners={owners} />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 border-t border-border pt-3">
                      <p className="text-xs text-text-muted">Para criar tarefa, vincule este alerta a um processo cadastrado.</p>
                      <LinkBox movementId={sel.id} />
                    </div>
                  )}
                  <div className="flex flex-col gap-2 border-t border-border pt-3">
                    <h3 className="text-sm font-extrabold">Ou ignorar</h3>
                    <DiscardBox movementId={sel.id} reasons={DISCARD_REASONS} />
                  </div>
                </>
              )}

              <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                <h3 className="text-sm font-extrabold">Histórico do alerta</h3>
                <ol className="flex flex-col gap-1 text-[13px] text-soft">
                  <li>{dateTimeBr(sel.arrivedAt)} · Chegou ao FocoJur por {SOURCES[sel.source]} (publicação de {dateTimeBr(sel.occurredAt)})</li>
                  {history.map((h) => <li key={h.id}>{dateTimeBr(h.at)} · {h.actorName ?? 'Sistema'}: {describeAlertEvent(h.diff)}</li>)}
                  {sel.status === 'pending' && <li className="font-bold text-danger">Aguardando decisão{daysPending(sel.arrivedAt) > 0 ? ` há ${daysPending(sel.arrivedAt)} ${daysPending(sel.arrivedAt) === 1 ? 'dia' : 'dias'}` : ' (chegou hoje)'}</li>}
                </ol>
              </div>
            </aside>
          )}
        </div>
      )}
      {canWrite && view === 'pending' && data.total > 0 && <BatchBar name="ids" form="batch" reasons={DISCARD_REASONS} />}
    </>
  );
}
