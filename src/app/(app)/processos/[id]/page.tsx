import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { formatCaseNumber } from '@/lib/case-number';
import { PORTFOLIO_LABEL, PROGNOSIS_CLS, PROGNOSIS_LABEL, dateBr, dateTimeBr, money, moneyInput } from '@/lib/format';
import { caseHistory, getCase } from '@/server/cases';
import { getLookups } from '@/server/lookups';
import { listUsers } from '@/server/users';
import { ActionForm } from '@/components/action-form';
import { todayInSaoPaulo, urgency } from '@/lib/deadlines';
import { addEntryAction, deleteEntryAction } from './finance-actions';
import { FINANCIAL_KINDS, KIND_LABEL, listEntries, totalPaid } from '@/server/financial';
import { getHolidaySet, listTasks, openTasksOfCase } from '@/server/tasks';
import { listCaseMovements } from '@/server/movements';
import { TaskForm } from '../../tarefas/task-form';
import {
  addPartyAction, addRentalAction, closeCaseAction, deleteCaseAction, monitoringAction, removePartyAction,
  removeRentalAction, reopenCaseAction, reviewRiskAction, rootCauseAction, updateCaseAction,
} from '../actions';

const Item = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><div className="label">{label}</div><div className="text-sm font-bold">{children || '—'}</div></div>
);

export default async function FichaPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const session = await requireUser();
  const { id } = await params;
  const { tab = 'resumo' } = await searchParams;
  const data = await getCase(id);
  if (!data) notFound();
  const { case: c, civil, parties, risk, rentals } = data;

  const [lk, users] = await Promise.all([
    getLookups(['system', 'court_type', 'subject', 'claim', 'closing_reason', 'rental_type', 'reservation_origin'], { includeInactive: true }),
    listUsers(),
  ]);
  const label = (type: keyof typeof lk, lid?: string | null) => lk[type].find((x) => x.id === lid)?.label ?? null;
  const canWrite = session.user.role !== 'viewer';
  const isAdmin = session.user.role === 'admin';
  const plaintiff = parties.find((p) => p.role === 'plaintiff')?.name;
  const closed = !!c.closedAt;
  const history = tab === 'historico' ? await caseHistory(id) : [];
  const [caseTasks, entries, openTasks, holidays, taskTypes, caseMovements] = await Promise.all([
    listTasks({ caseId: id, userId: session.user.id, view: 'all' }),
    listEntries(id),
    openTasksOfCase(id),
    getHolidaySet(),
    getLookups(['task_type']),
    listCaseMovements(id),
  ]);
  const today = todayInSaoPaulo();
  const owners = users.filter((u) => u.role !== 'viewer' && u.active !== false).map((u) => ({ id: u.id, label: u.name }));

  return (
    <>
      <header className="card flex flex-wrap justify-between gap-4 p-5">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            <span className="badge b-gray">{PORTFOLIO_LABEL[c.portfolio]}</span>
            <span className={`badge ${closed ? 'b-gray' : 'b-teal'}`}>{closed ? 'Encerrado' : 'Em andamento'}</span>
            {risk?.prognosis && <span className={`badge ${PROGNOSIS_CLS[risk.prognosis]}`}>Prognóstico {PROGNOSIS_LABEL[risk.prognosis].toLowerCase()}</span>}
            {label('system', c.systemId) && <span className="badge b-gray">{label('system', c.systemId)}</span>}
          </div>
          <h1 className="text-[26px] font-extrabold">{formatCaseNumber(c.number)}</h1>
          <p className="text-[15px] text-soft">{[plaintiff && `${plaintiff} x Foco`, c.court].filter(Boolean).join(' · ') || 'Sem partes cadastradas'}</p>
          <p className="text-[13px] text-text-muted">
            Responsável: {data.ownerName ?? '—'} · Recebido em {dateBr(c.receivedAt)} · Origem: {c.source}
          </p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-start gap-2">
            <form action={monitoringAction}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="on" value={String(!c.monitoring)} />
              <button className="btn-secondary" type="submit" aria-pressed={c.monitoring}>
                Monitoramento {c.monitoring ? 'ativo' : 'desligado'}
              </button>
            </form>
            {closed && (
              <form action={reopenCaseAction}>
                <input type="hidden" name="id" value={c.id} />
                <button className="btn-secondary" type="submit">Reabrir</button>
              </form>
            )}
            {isAdmin && (
              <form action={deleteCaseAction}>
                <input type="hidden" name="id" value={c.id} />
                <button className="btn-ghost" type="submit">Excluir</button>
              </form>
            )}
          </div>
        )}
      </header>
      {c.source === 'djen_term' && !c.ownerId && (
        <p role="note" className="rounded-control bg-ai-bg px-4 py-3 text-sm leading-normal text-soft">
          <strong className="text-ai">Processo criado automaticamente pelo DJEN.</strong> Veio de uma publicação de processo que já andava, com cadastro mínimo (número, tribunal e vara).
          Complete os dados quando puder: responsável, objeto, prognóstico e valores. As publicações que chegarem daqui para frente aparecem em Alertas.
          {c.details?.startsWith('Conferir parte') && <span className="mt-1.5 block font-bold text-warn">{c.details}.</span>}
        </p>
      )}

      <nav role="tablist" aria-label="Seções do processo" className="flex flex-wrap gap-1 border-b border-border">
        {[['resumo', 'Resumo'], ['andamentos', `Andamentos (${caseMovements.length})`], ['tarefas', `Tarefas (${caseTasks.length})`], ['financeiro', 'Financeiro'], ['historico', 'Histórico']].map(([k, l]) => (
          <Link
            key={k} href={`/processos/${id}?tab=${k}`} role="tab" aria-selected={tab === k}
            className={`min-h-11 border-b-[3px] px-4 pt-3 text-[15px] font-extrabold no-underline ${tab === k ? 'border-primary text-text' : 'border-transparent text-text-muted'}`}
          >{l}</Link>
        ))}
      </nav>

      {tab === 'andamentos' ? (
        <section className="card flex flex-col gap-3 p-5" aria-label="Andamentos do processo">
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-extrabold">Andamentos</h2>
            <p className="text-[13px] text-text-muted">Publicações e movimentações deste processo, da mais recente para a mais antiga. Os pendentes são tratados na tela Andamentos.</p>
          </div>
          {caseMovements.length === 0 && <p className="text-sm text-text-muted">Nenhum andamento capturado para este processo ainda.</p>}
          {caseMovements.map((m) => {
            const st = { pending: ['Pendente de decisão', 'b-red'], linked: ['Lido', 'b-gray'], task_created: ['Tarefa criada', 'b-teal'], discarded: ['Descartado', 'b-gray'] }[m.status];
            return (
              <article key={m.id} className="flex flex-col gap-2 rounded-xl border border-border p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm">{m.title ?? 'Andamento'}</strong>
                    <span className="badge b-gray">{{ djen: 'DJEN', domicilio: 'Domicílio', datajud: 'DataJud', portal: 'Portal' }[m.source]}</span>
                    <span className={`badge ${st[1]}`}>{st[0]}</span>
                  </div>
                  <span className="text-xs text-text-muted">{dateTimeBr(m.occurredAt)}</span>
                </div>
                {m.aiSummary && <p className="text-sm leading-normal"><span className="text-xs font-extrabold text-ai">Resumo da IA · </span>{m.aiSummary}</p>}
                <details className="rounded-control bg-bg px-3 py-2">
                  <summary className="cursor-pointer text-[13px] font-bold text-soft">Texto original</summary>
                  <p className="mt-1.5 max-h-60 overflow-auto whitespace-pre-line text-[13px] leading-normal text-soft">{m.rawText}</p>
                </details>
                <div className="text-xs text-text-muted">
                  {m.status === 'task_created' && m.taskId && <>Tarefa: <Link className="font-bold" href={`/tarefas/${m.taskId}`}>{m.taskTitle}</Link>{m.taskDue ? ` · prazo ${dateBr(m.taskDue)}` : ''}{m.readerName ? ` · por ${m.readerName}` : ''}</>}
                  {m.status === 'linked' && <>Marcado como lido{m.readerName ? ` por ${m.readerName}` : ''}{m.readAt ? ` em ${dateTimeBr(m.readAt)}` : ''}</>}
                  {m.status === 'discarded' && <>Descartado{m.discardReason ? `: ${m.discardReason}` : ''}{m.readerName ? ` · por ${m.readerName}` : ''}</>}
                  {m.status === 'pending' && <Link className="font-bold" href="/alertas">Tratar em Alertas</Link>}
                </div>
              </article>
            );
          })}
        </section>
      ) : tab === 'tarefas' ? (
        <div className="flex flex-col gap-4">
          <section className="card pt-2" aria-label="Tarefas do processo">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Tarefa</th><th>Tipo</th><th>Prazo</th><th>Responsável</th><th>Revisor</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {caseTasks.length === 0 && <tr><td colSpan={7} className="text-text-muted">Nenhuma tarefa neste processo.</td></tr>}
                  {caseTasks.map((t) => {
                    const u = urgency(t.dueDate, today, holidays);
                    return (
                      <tr key={t.id}>
                        <td className="font-bold">{t.title}</td>
                        <td>{t.typeLabel ?? 'Geral'}</td>
                        <td><span className={`badge ${u === 'late' || u === 'today' ? 'b-red' : u === 'soon' ? 'b-yel' : 'b-gray'}`}>{dateBr(t.dueDate)}</span></td>
                        <td>{t.assignees.length ? t.assignees.map((a) => a.name).join(', ') : '—'}</td>
                        <td>{t.reviewerName ?? '—'}</td>
                        <td>{{ todo: 'A fazer', doing: 'Em andamento', review: 'Aguardando revisão', done: 'Concluída' }[t.status as 'todo'] ?? t.status}</td>
                        <td className="text-right">{canWrite && <Link className="font-bold" href={`/tarefas/${t.id}`}>Editar</Link>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          {canWrite && (
            <details className="card p-4">
              <summary className="cursor-pointer text-sm font-extrabold">Nova tarefa neste processo</summary>
              <TaskForm caseId={id} types={taskTypes.task_type.map((t) => ({ id: t.id, label: t.label }))} owners={owners} />
            </details>
          )}
        </div>
      ) : tab === 'financeiro' ? (
        <section className="card flex flex-col gap-3 p-5" aria-label="Financeiro do processo">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[17px] font-extrabold">Lançamentos</h2>
            <div className="text-sm">Total pago: <strong className="text-lg">{money(totalPaid(entries))}</strong></div>
          </div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Pago em</th><th>Tipo</th><th>Observação</th><th>Ticket SENS</th><th className="text-right">Valor</th><th></th></tr></thead>
              <tbody>
                {entries.length === 0 && <tr><td colSpan={6} className="text-text-muted">Nenhum lançamento ainda. Custas, acordos, condenações, honorários e correspondentes aparecem aqui.</td></tr>}
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>{e.paidAt ? dateBr(e.paidAt) : <span className="badge b-yel">Não pago</span>}</td>
                    <td className="font-bold">{KIND_LABEL[e.kind]}</td>
                    <td>{e.notes ?? '—'}</td>
                    <td>{e.sensTicket ?? '—'}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{money(e.amount)}</td>
                    <td className="text-right">
                      {isAdmin && (
                        <form action={deleteEntryAction}>
                          <input type="hidden" name="id" value={c.id} /><input type="hidden" name="entryId" value={e.id} />
                          <button className="btn-ghost" type="submit">Excluir</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canWrite && (
            <details className="rounded-control bg-bg p-3">
              <summary className="cursor-pointer text-sm font-extrabold">Novo lançamento</summary>
              <ActionForm action={addEntryAction} submitLabel="Registrar lançamento" className="mt-3 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={c.id} />
                <label className="flex flex-col gap-1"><span className="label">Tipo</span>
                  <select className="input" name="kind" defaultValue="settlement">{FINANCIAL_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label className="flex flex-col gap-1"><span className="label">Valor (R$)</span><input className="input" name="amount" inputMode="decimal" required placeholder="2.000,00" /></label>
                <label className="flex flex-col gap-1"><span className="label">Data do pagamento</span><input className="input" type="date" name="paidAt" /></label>
                <label className="flex flex-col gap-1"><span className="label">Ticket SENS</span><input className="input" name="sensTicket" /></label>
                <label className="flex flex-col gap-1 sm:col-span-2"><span className="label">Observação</span><input className="input" name="notes" /></label>
              </ActionForm>
            </details>
          )}
        </section>
      ) : tab === 'historico' ? (
        <section className="card flex flex-col gap-2.5 p-5 text-sm" aria-label="Histórico de alterações">
          {history.length === 0 && <p className="text-text-muted">Sem registros.</p>}
          {history.map((h) => (
            <div key={h.id}>
              <strong>{dateTimeBr(h.at)} · {h.actor ?? 'Sistema'}</strong>{' '}
              {h.action === 'create' ? 'criou o processo' : h.action === 'delete' ? 'excluiu o processo' : h.entity === 'case_risk' ? 'revisou o prognóstico' : 'alterou o processo'}
              {h.action === 'update' && h.diff && h.entity === 'case' ? <span className="text-text-muted"> ({Object.keys(h.diff as object).join(', ')})</span> : null}
            </div>
          ))}
        </section>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
          <section className="card flex flex-col gap-3.5 p-5" aria-labelledby="h-dados">
            <h2 id="h-dados" className="text-[17px] font-extrabold">Dados do processo</h2>
            <div className="grid grid-cols-2 gap-3">
              <Item label="Foro / esfera">{label('court_type', c.courtTypeId)}</Item>
              <Item label="UF / comarca">{[c.state, c.city].filter(Boolean).join(' · ')}</Item>
              {civil && <Item label="Pedido">{label('claim', civil.claimId)}</Item>}
              {civil && <Item label="Objeto">{label('subject', civil.subjectId)}</Item>}
              <Item label="Loja / centro de custo">{c.costCenter}</Item>
              <Item label="Citação">{dateBr(c.citedAt)}</Item>
              {closed && <Item label="Encerramento">{dateBr(c.closedAt)} · {label('closing_reason', c.closingReasonId)}</Item>}
            </div>
            {c.details && <div><div className="label">Detalhamento</div><p className="mt-1 text-sm leading-normal">{c.details}</p></div>}
            {canWrite && (
              <details className="rounded-control bg-bg p-3">
                <summary className="cursor-pointer text-sm font-extrabold">Editar dados</summary>
                <ActionForm action={updateCaseAction} submitLabel="Salvar alterações" className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={c.id} />
                  <label className="flex flex-col gap-1"><span className="label">Responsável</span>
                    <select className="input" name="ownerId" defaultValue={c.ownerId ?? ''}><option value="">—</option>
                      {users.filter((u) => u.role !== 'viewer' && u.active !== false).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select></label>
                  <label className="flex flex-col gap-1"><span className="label">Sistema</span>
                    <select className="input" name="systemId" defaultValue={c.systemId ?? ''}><option value="">—</option>{lk.system.filter((x) => x.active || x.id === c.systemId).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
                  <label className="flex flex-col gap-1"><span className="label">Foro / esfera</span>
                    <select className="input" name="courtTypeId" defaultValue={c.courtTypeId ?? ''}><option value="">—</option>{lk.court_type.filter((x) => x.active || x.id === c.courtTypeId).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
                  <label className="flex flex-col gap-1"><span className="label">Vara</span><input className="input" name="court" defaultValue={c.court ?? ''} /></label>
                  <label className="flex flex-col gap-1"><span className="label">UF</span><input className="input" name="state" maxLength={2} defaultValue={c.state ?? ''} /></label>
                  <label className="flex flex-col gap-1"><span className="label">Cidade</span><input className="input" name="city" defaultValue={c.city ?? ''} /></label>
                  <label className="flex flex-col gap-1"><span className="label">Loja</span><input className="input" name="costCenter" defaultValue={c.costCenter ?? ''} /></label>
                  <label className="flex flex-col gap-1"><span className="label">Recebido em</span><input className="input" type="date" name="receivedAt" defaultValue={c.receivedAt ?? ''} /></label>
                  <label className="flex flex-col gap-1"><span className="label">Citação em</span><input className="input" type="date" name="citedAt" defaultValue={c.citedAt ?? ''} /></label>
                  <label className="flex flex-col gap-1 sm:col-span-2"><span className="label">Detalhamento</span><textarea className="input min-h-20 py-2" name="details" defaultValue={c.details ?? ''} /></label>
                </ActionForm>
              </details>
            )}
          </section>

          <section className="card flex flex-col gap-3.5 p-5" aria-labelledby="h-risco">
            <h2 id="h-risco" className="text-[17px] font-extrabold">Risco e contingência</h2>
            <div className="grid grid-cols-2 gap-3">
              <Item label="Prognóstico">{risk?.prognosis ? PROGNOSIS_LABEL[risk.prognosis] : null}</Item>
              <Item label="Valor da causa">{money(risk?.claimValue)}</Item>
              <Item label="Risco dano material">{money(risk?.riskMaterial)}</Item>
              <Item label="Risco dano moral">{money(risk?.riskMoral)}</Item>
              <Item label="Valor de risco total"><span className="text-xl">{money(risk?.riskTotal)}</span></Item>
              <Item label="Limite de acordo">{money(risk?.settlementLimit)}</Item>
            </div>
            {risk && <p className="text-xs text-text-muted">Última revisão do prognóstico: {dateTimeBr(risk.reviewedAt)} · {data.risks.length} revisão(ões)</p>}
            {canWrite && (
              <details className="rounded-control bg-bg p-3">
                <summary className="cursor-pointer text-sm font-extrabold">Revisar prognóstico</summary>
                <ActionForm action={reviewRiskAction} submitLabel="Registrar revisão" className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={c.id} />
                  <label className="flex flex-col gap-1"><span className="label">Prognóstico</span>
                    <select className="input" name="prognosis" defaultValue={risk?.prognosis ?? 'possible'}>
                      <option value="probable">Provável</option><option value="possible">Possível</option><option value="remote">Remoto</option>
                    </select></label>
                  <label className="flex flex-col gap-1"><span className="label">Valor da causa</span><input className="input" name="claimValue" defaultValue={moneyInput(risk?.claimValue)} /></label>
                  <label className="flex flex-col gap-1"><span className="label">Risco total</span><input className="input" name="riskTotal" defaultValue={moneyInput(risk?.riskTotal)} /></label>
                  <label className="flex flex-col gap-1"><span className="label">Limite de acordo</span><input className="input" name="settlementLimit" defaultValue={moneyInput(risk?.settlementLimit)} /></label>
                  <label className="flex flex-col gap-1"><span className="label">Dano material</span><input className="input" name="riskMaterial" defaultValue={moneyInput(risk?.riskMaterial)} /></label>
                  <label className="flex flex-col gap-1"><span className="label">Dano moral</span><input className="input" name="riskMoral" defaultValue={moneyInput(risk?.riskMoral)} /></label>
                </ActionForm>
              </details>
            )}
          </section>

          <section className="card flex flex-col gap-3.5 p-5" aria-labelledby="h-contrato">
            <h2 id="h-contrato" className="text-[17px] font-extrabold">Contrato e locação</h2>
            {rentals.length === 0 ? <p className="text-sm text-text-muted">Nenhum contrato vinculado.</p> : rentals.map((r) => (
              <div key={r.id} className="grid grid-cols-2 gap-3">
                <Item label="Contrato">{r.contractCode} {r.validatedAt ? <span className="badge b-teal">validado</span> : <span className="badge b-yel">não validado</span>}</Item>
                <Item label="Loja">{r.store}</Item>
                <Item label="Veículo">{[r.vehicleModel, r.plate].filter(Boolean).join(' · ')}</Item>
                <Item label="Tipo de locação">{r.rentalType}</Item>
                {canWrite && (
                  <form action={removeRentalAction} className="col-span-2">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="rentalId" value={r.id} />
                    <button className="btn-ghost -ml-2.5" type="submit">Remover vínculo</button>
                  </form>
                )}
              </div>
            ))}
            {canWrite && (
              <details className="rounded-control bg-bg p-3">
                <summary className="cursor-pointer text-sm font-extrabold">Vincular contrato</summary>
                <ActionForm action={addRentalAction} submitLabel="Vincular" className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={c.id} />
                  <label className="flex flex-col gap-1"><span className="label">Contrato</span><input className="input" name="contractCode" placeholder="POA004871-26" required /></label>
                  <label className="flex flex-col gap-1"><span className="label">Loja</span><input className="input" name="store" /></label>
                  <label className="flex flex-col gap-1"><span className="label">Placa</span><input className="input" name="plate" /></label>
                  <label className="flex flex-col gap-1"><span className="label">Modelo</span><input className="input" name="vehicleModel" /></label>
                  <label className="flex flex-col gap-1"><span className="label">Tipo de locação</span>
                    <select className="input" name="rentalType" defaultValue=""><option value="">—</option>{lk.rental_type.filter((x) => x.active).map((x) => <option key={x.id} value={x.label}>{x.label}</option>)}</select></label>
                </ActionForm>
              </details>
            )}
            <p className="text-xs text-text-muted">A validação automática depende do sistema de locação (etapa 1b).</p>
          </section>

          <section className="card flex flex-col gap-3.5 p-5" aria-labelledby="h-partes">
            <h2 id="h-partes" className="text-[17px] font-extrabold">Partes</h2>
            {parties.length === 0 && <p className="text-sm text-text-muted">Nenhuma parte cadastrada.</p>}
            {parties.map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <div className="font-bold">{p.name}</div>
                  <div className="text-xs text-text-muted">
                    {{ plaintiff: 'Demandante', defendant: 'Réu', other_defendant: 'Outro réu' }[p.role]}
                    {p.document ? ` · ${p.document}` : ''}{p.lawyerName ? ` · Adv.: ${p.lawyerName}` : ''}
                  </div>
                </div>
                {canWrite && (
                  <form action={removePartyAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="partyId" value={p.id} />
                    <button className="btn-ghost" type="submit">Remover</button>
                  </form>
                )}
              </div>
            ))}
            {canWrite && (
              <details className="rounded-control bg-bg p-3">
                <summary className="cursor-pointer text-sm font-extrabold">Adicionar parte</summary>
                <ActionForm action={addPartyAction} submitLabel="Adicionar" className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={c.id} />
                  <label className="flex flex-col gap-1"><span className="label">Polo</span>
                    <select className="input" name="role" defaultValue="plaintiff"><option value="plaintiff">Demandante</option><option value="defendant">Réu</option><option value="other_defendant">Outro réu</option></select></label>
                  <label className="flex flex-col gap-1"><span className="label">Nome</span><input className="input" name="name" required /></label>
                  <label className="flex flex-col gap-1"><span className="label">CPF/CNPJ</span><input className="input" name="document" /></label>
                  <label className="flex flex-col gap-1"><span className="label">Advogado</span><input className="input" name="lawyerName" /></label>
                </ActionForm>
              </details>
            )}
          </section>

          {civil && (
            <section className="card flex flex-col gap-3.5 p-5" aria-labelledby="h-causa">
              <h2 id="h-causa" className="text-[17px] font-extrabold">Causa raiz</h2>
              <div className="grid grid-cols-2 gap-3">
                <Item label="Era evitável pela Foco?">{civil.avoidable === null ? 'Não analisado' : civil.avoidable ? 'Sim' : 'Não'}</Item>
                <Item label="Área de origem">{civil.rootCauseArea}</Item>
              </div>
              <div><div className="label">Erro cometido e solução</div><p className="mt-1 text-sm leading-normal">{civil.rootCause || '—'}</p></div>
              {canWrite && (
                <details className="rounded-control bg-bg p-3">
                  <summary className="cursor-pointer text-sm font-extrabold">Editar causa raiz</summary>
                  <ActionForm action={rootCauseAction} submitLabel="Salvar causa raiz" className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={c.id} />
                    <label className="flex flex-col gap-1"><span className="label">Era evitável pela Foco?</span>
                      <select className="input" name="avoidable" defaultValue={civil.avoidable === null ? '' : String(civil.avoidable)}>
                        <option value="">Não analisado</option><option value="true">Sim</option><option value="false">Não</option>
                      </select></label>
                    <label className="flex flex-col gap-1"><span className="label">Área de origem</span><input className="input" name="rootCauseArea" defaultValue={civil.rootCauseArea ?? ''} /></label>
                    <label className="flex flex-col gap-1 sm:col-span-2"><span className="label">Erro cometido e solução</span><textarea className="input min-h-20 py-2" name="rootCause" defaultValue={civil.rootCause ?? ''} /></label>
                  </ActionForm>
                </details>
              )}
            </section>
          )}

          {canWrite && !closed && (
            <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-enc">
              <h2 id="h-enc" className="text-[17px] font-extrabold">Encerrar processo</h2>
              <ActionForm action={closeCaseAction} submitLabel="Encerrar" variant="btn-secondary" className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={c.id} />
                <label className="flex flex-col gap-1"><span className="label">Motivo de encerramento</span>
                  <select className="input" name="closingReasonId" required defaultValue=""><option value="" disabled>Selecione</option>{lk.closing_reason.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
                <label className="flex flex-col gap-1"><span className="label">Data</span><input className="input" type="date" name="closedAt" required /></label>
                {openTasks.length > 0 && (
                  <label className="flex flex-col gap-1 sm:col-span-2"><span className="label">{openTasks.length} tarefa(s) aberta(s) neste processo</span>
                    <select className="input" name="openTasks" required defaultValue=""><option value="" disabled>Escolha o que fazer</option><option value="cancel">Cancelar as tarefas abertas</option><option value="keep">Manter as tarefas abertas</option></select></label>
                )}
              </ActionForm>
            </section>
          )}
        </div>
      )}
    </>
  );
}
