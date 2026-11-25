import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { INBOX_PF, INBOX_SIT, INBOX_SRC, InboxItemInfo } from '@/components/inbox-item-info';
import { AssigneePicker } from '@/components/assignee-picker';
import { Pager } from '@/components/pager';
import { SelectHint } from '@/components/select-hint';
import { formatCaseNumber } from '@/lib/case-number';
import { dateTimeBr } from '@/lib/format';
import { norm } from '@/lib/migration/spreadsheet';
import { getInboxItem, listInbox, ownersForReview, type Parsed } from '@/server/inbox';
import type { ParsedWithAi } from '@/server/inbox-ai';
import { getLookups } from '@/server/lookups';
import { lastPortalFetch } from '@/server/portal';
import { portalFetchAction } from '../portal-actions';
import { confirmAction, decideSuggestionsAction, discardAction, duplicateAction, importAction, manualNumberAction, suggestAction } from '../caixa-entrada/actions';

const OPEN = ['new', 'in_review', 'possible_duplicate'];

/** Processos novos (que ainda não existem no FocoJur): é aqui que a advogada classifica, confirma, marca duplicado ou descarta. */
export async function NovosProcessos({ itemId, page, canWrite, userId, href }: {
  itemId: string; page: number; canWrite: boolean; userId: string; href: (o: { item?: string; np?: string }) => string;
}) {
  const [data, lk, owners, selRaw] = await Promise.all([
    listInbox('all', { page }), getLookups(['system', 'subject', 'claim', 'court_type', 'task_type']), ownersForReview(), itemId ? getInboxItem(itemId) : null,
  ]);
  const sel = selRaw && OPEN.includes(selRaw.status) ? selRaw : null;
  const lastFetch = selRaw?.caseNumber ? await lastPortalFetch(selRaw.caseNumber) : null;
  const p = (sel?.parsed ?? {}) as ParsedWithAi;
  const byLabel = (rows: { id: string; label: string }[], label?: string) => rows.find((r) => label && norm(r.label) === norm(label))?.id ?? '';

  if (data.total === 0 && !canWrite) return null;
  return (
    <section className="flex flex-col gap-3" aria-label="Processos novos">
      <h2 className="text-base font-extrabold text-soft">Processos novos para cadastrar <span className="font-semibold text-text-muted">· {data.total}</span></h2>

      {canWrite && (
        <div className="grid gap-3 md:grid-cols-2">
          <details className="card p-4"><summary className="cursor-pointer text-sm font-extrabold">Importar do Projuris (Excel/CSV)</summary>
            <ActionForm action={importAction} submitLabel="Importar" pendingLabel="Importando…" className="mt-3 flex flex-col gap-3">
              <input className="input py-1.5" type="file" name="file" accept=".xlsx,.csv" required />
              <p className="text-xs text-text-muted">Precisa de uma coluna com o número do processo. Mostra novos, duplicados e erros por linha.</p>
            </ActionForm></details>
          <details className="card p-4"><summary className="cursor-pointer text-sm font-extrabold">Cadastrar pelo número</summary>
            <ActionForm action={manualNumberAction} submitLabel="Adicionar" className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1"><span className="label">Número do processo</span><input className="input w-72" name="number" required placeholder="0000000-00.0000.0.00.0000" /></label>
            </ActionForm></details>
        </div>
      )}

      {data.total === 0 && <p className="card p-4 text-sm text-text-muted">Nenhum processo novo esperando classificação.</p>}

      {data.total > 0 && (
        <div className="flex flex-wrap items-start gap-5">
          <div className="card min-w-0 flex-[3_1_520px] p-2 pb-0">
            <div className="overflow-x-auto"><table className="tbl">
              <thead><tr><th>Recebido</th><th>Fonte</th><th>Processo</th><th>Carteira</th><th>Situação</th></tr></thead>
              <tbody>
                {data.rows.map((i) => {
                  const ip = (i.parsed ?? {}) as Parsed;
                  return (
                    <tr key={i.id} className={sel?.id === i.id ? 'bg-selected' : ''}>
                      <td className="whitespace-nowrap">{dateTimeBr(i.capturedAt)}</td>
                      <td><span className={`badge ${INBOX_SRC[i.source].cls}`}>{INBOX_SRC[i.source].label}</span></td>
                      <td><Link className="font-extrabold" href={href({ item: i.id })}>{formatCaseNumber(i.caseNumber ?? '')}</Link><div className="text-xs text-text-muted">{ip.plaintiff ? `${ip.plaintiff} x Foco` : '—'}</div></td>
                      <td>{ip.portfolio ? INBOX_PF[ip.portfolio] : '—'}</td>
                      <td><span className={`badge ${INBOX_SIT[i.status].cls}`}>{INBOX_SIT[i.status].label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
            <Pager page={data.page} size={data.pageSize} total={data.total} href={(n) => href({ np: String(n) })} label="processos novos" />
          </div>

          {sel && (
            <aside className="card flex min-w-0 flex-[2_1_380px] flex-col gap-4 p-5" aria-labelledby="t-rev">
              <InboxItemInfo
                item={sel}
                aiActions={canWrite && (
                  <div className="flex flex-wrap gap-2">
                    <form action={decideSuggestionsAction}><input type="hidden" name="itemId" value={sel.id} /><input type="hidden" name="accept" value="true" /><button className="btn-secondary" type="submit">Aceitar sugestões</button></form>
                    <form action={decideSuggestionsAction}><input type="hidden" name="itemId" value={sel.id} /><input type="hidden" name="accept" value="false" /><button className="btn-ghost" type="submit">Recusar</button></form>
                  </div>
                )}
              >
                {canWrite && (
                  <div className="flex flex-col gap-1.5">
                    <ActionForm action={portalFetchAction} submitLabel="Buscar dados públicos (DataJud)" variant="btn-secondary" pendingLabel="Consultando o DataJud…" className="flex">
                      <input type="hidden" name="number" value={sel.caseNumber ?? ''} />
                    </ActionForm>
                    <p className="text-xs text-text-muted">Consulta a API pública do CNJ e completa só os campos vazios (vara, assunto, data de ajuizamento, sistema). O que você digitou não é alterado.</p>
                    {lastFetch && (
                      <p className="text-xs text-text-muted">
                        Última tentativa: {dateTimeBr(lastFetch.createdAt)} · {lastFetch.status === 'ok' || lastFetch.status === 'partial' ? 'dados obtidos' : lastFetch.status === 'queued' || lastFetch.status === 'running' ? 'em andamento' : 'sem dados'}
                        {lastFetch.error ? ` (${lastFetch.error})` : ''}
                      </p>
                    )}
                  </div>
                )}
              </InboxItemInfo>
              {canWrite && !p.ai && (
                <ActionForm action={suggestAction} submitLabel="Pedir sugestões da IA" variant="btn-secondary" pendingLabel="Consultando a IA…" className="flex">
                  <input type="hidden" name="itemId" value={sel.id} />
                </ActionForm>
              )}
              {canWrite && (
                <ActionForm key={`${sel.id}-${sel.updatedAt.getTime()}`} action={confirmAction} submitLabel="Confirmar e criar processo" className="grid grid-cols-2 gap-3" pendingLabel="Criando…">
                  <input type="hidden" name="itemId" value={sel.id} />
                  <label className="flex flex-col gap-1"><span className="label">Carteira</span>
                    <select className="input" name="portfolio" defaultValue={p.portfolio ?? 'civil'}><option value="civil">Cível</option><option value="labor">Trabalhista</option><option value="procon">Procon</option></select></label>
                  <SelectHint name="systemId" label="Sistema" options={lk.system} defaultValue={byLabel(lk.system, p.system)} />
                  <label className="col-span-2 flex flex-col gap-1"><span className="label">Foro / esfera</span>
                    <select className="input" name="courtTypeId" defaultValue=""><option value="">—</option>{lk.court_type.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
                  <label className="col-span-2 flex flex-col gap-1"><span className="label">Vara</span><input className="input" name="court" defaultValue={p.court ?? ''} /></label>
                  <label className="flex flex-col gap-1"><span className="label">UF</span><input className="input" name="state" maxLength={2} defaultValue={p.state ?? ''} /></label>
                  <label className="flex flex-col gap-1"><span className="label">Cidade</span><input className="input" name="city" defaultValue={p.city ?? ''} /></label>
                  <label className="flex flex-col gap-1"><span className="label">Demandante</span><input className="input" name="plaintiff" defaultValue={p.plaintiff ?? ''} /></label>
                  <label className="flex flex-col gap-1"><span className="label">Valor da causa (R$)</span><input className="input" name="claimValue" inputMode="decimal" defaultValue={p.claimValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) ?? ''} /></label>
                  <SelectHint name="subjectId" label="Objeto" options={lk.subject} defaultValue={byLabel(lk.subject, p.subject)} />
                  <SelectHint name="claimId" label="Pedido" options={lk.claim} defaultValue={byLabel(lk.claim, p.claim)} />
                  <label className="flex flex-col gap-1"><span className="label">Prognóstico</span>
                    <select className="input" name="prognosis" defaultValue={['probable', 'possible', 'remote'].includes(p.prognosis ?? '') ? p.prognosis : ''}><option value="">—</option><option value="probable">Provável</option><option value="possible">Possível</option><option value="remote">Remoto</option></select></label>
                  <label className="flex flex-col gap-1"><span className="label">Valor de risco (R$)</span><input className="input" name="riskTotal" inputMode="decimal" /></label>
                  <label className="flex flex-col gap-1"><span className="label">Responsável</span>
                    <select className="input" name="ownerId" defaultValue={userId}><option value="">—</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
                  <label className="flex flex-col gap-1"><span className="label">Contrato</span><input className="input" name="contractCode" defaultValue={p.contracts?.[0] ?? ''} placeholder="POA004871-26" /></label>
                  <label className="flex flex-col gap-1"><span className="label">Loja</span><input className="input" name="costCenter" defaultValue={p.costCenter ?? ''} /></label>
                  <fieldset className="col-span-2 grid grid-cols-2 gap-3 rounded-control bg-bg p-3">
                    <legend className="label px-1">Já criar uma tarefa com prazo (opcional)</legend>
                    <label className="col-span-2 flex flex-col gap-1"><span className="label">Título</span><input className="input" name="taskTitle" placeholder="Ex.: Contestação" /></label>
                    <div className="col-span-2"><SelectHint name="taskTypeId" label="Tipo" options={lk.task_type} hintPrefix="Dica do tipo: " /></div>
                    <div className="col-span-2 grid"><AssigneePicker options={owners.map((o) => ({ id: o.id, label: o.name }))} name="taskAssigneeIds" /></div>
                    <label className="flex flex-col gap-1"><span className="label">Prazo limite (fatal)</span><input className="input" type="date" name="taskDue" /></label>
                    <label className="flex flex-col gap-1"><span className="label">Prazo interno (opcional)</span><input className="input" type="date" name="taskInternalDue" /><span className="text-xs text-text-muted">Em branco: calculado pelo tipo, quando o tipo tem a regra.</span></label>
                    <div className="col-span-2 flex items-end gap-2">
                      <label className="flex flex-col gap-1"><span className="label">ou calcular: dias</span><input className="input w-24" type="number" min={1} max={365} name="taskDays" placeholder="15" /></label>
                      <select className="input w-32" name="taskDayCount" defaultValue="business" aria-label="Contagem"><option value="business">úteis</option><option value="calendar">corridos</option></select>
                    </div>
                    <p className="col-span-2 text-xs text-text-muted">Os dias contam a partir de hoje, com o calendário de feriados do sistema. Se preencher os dois, vale o número de dias, que define o prazo limite. O prazo interno é a data em que a equipe quer entregar, antes do limite.</p>
                  </fieldset>
                  <label className="col-span-2 flex flex-col gap-1"><span className="label">Detalhamento</span><textarea className="input min-h-16 py-2" name="details" defaultValue={p.details ?? ''} /></label>
                </ActionForm>
              )}
              {canWrite && (
                <div className="flex flex-wrap gap-2 border-t border-surface-3 pt-3">
                  <form action={duplicateAction}><input type="hidden" name="itemId" value={sel.id} /><button className="btn-secondary" type="submit">É duplicado</button></form>
                  <form action={discardAction}><input type="hidden" name="itemId" value={sel.id} /><button className="btn-ghost" type="submit">Descartar</button></form>
                </div>
              )}
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
