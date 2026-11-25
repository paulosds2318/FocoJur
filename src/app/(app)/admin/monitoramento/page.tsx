import { desc } from 'drizzle-orm';
import { ActionForm } from '@/components/action-form';
import { db } from '@/db';
import { connectorRun } from '@/db/schema/inbox';
import { requireAdmin } from '@/lib/auth/session';
import { cnpjRoot, formatCnpj } from '@/lib/cnpj';
import { CONNECTORS } from '@/lib/connectors/runner';
import { dateTimeBr } from '@/lib/format';
import { KIND_LABEL, listEntities, listTerms } from '@/server/monitoring';
import { foundVariations } from '@/server/name-variations';
import { runTimesLabel } from '@/lib/connectors/schedule';
import { getDjenIntervalHours } from '@/server/settings';
import {
  addEntityAction, addTermAction, setIntervalAction, decideVariationAction, deleteEntityAction, deleteTermAction, runConnectorAction, toggleEntityAction, toggleTermAction,
  searchTermNowAction, updateEntityAction, updateTermAction,
} from './actions';
import { AutoRefresh } from '@/components/auto-refresh';

const NAMES = { djen: 'DJEN por termos', datajud: 'DataJud', domicilio: 'Domicílio Judicial Eletrônico', projuris: 'Projuris (API)' } as const;
const STATUS: Record<string, { label: string; cls: string }> = {
  ok: { label: 'OK', cls: 'b-teal' }, error: { label: 'Erro', cls: 'b-red' }, running: { label: 'Rodando', cls: 'b-yel' }, partial: { label: 'Parcial', cls: 'b-yel' }, not_configured: { label: 'Não configurado', cls: 'b-gray' },
};
/** Intervalos em horas (a rotina do Jurídico é diária; o DJEN informa só a data da publicação). */
const periodo = (h: number | null) => (h === 1 ? 'última hora' : `últimas ${h ?? '?'} horas`);
const HORAS = [1, 6, 12, 24] as const;
const HELP = {
  name: 'Nome da empresa como aparece nas publicações. Traz centenas de resultados e é a busca principal.',
  lawyer: 'Nome COMPLETO do advogado como está cadastrado na OAB (ex.: SERGIO MENDES CAHU FILHO). Nome incompleto não retorna nada.',
  oab: 'Número e UF (ex.: 34790/PE). Um advogado com inscrição em mais de um estado precisa de um termo por UF.',
  cnpj: 'CNPJ citado no texto da publicação. Na prática quase não retorna nada (testado), use só se precisar.',
} as const;

export default async function MonitoramentoPage() {
  await requireAdmin();
  const [terms, entities, variations, intervalo, runs] = await Promise.all([listTerms(), listEntities(), foundVariations(), getDjenIntervalHours(), db.select().from(connectorRun).orderBy(desc(connectorRun.startedAt)).limit(200)]);
  const companies = [...new Set(entities.map((e) => cnpjRoot(e.cnpj)))].map((root) => ({ root, items: entities.filter((e) => cnpjRoot(e.cnpj) === root) }));
  const nameRoots = new Set(terms.filter((t) => t.kind === 'name' && t.active && t.document).map((t) => cnpjRoot(t.document!)));

  const buscando = terms.some((t) => t.searchStatus === 'pending' || t.searchStatus === 'running');
  return (
    <>
      <AutoRefresh active={buscando} />
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-extrabold">Monitoramento</h1>
        <p className="max-w-3xl text-[15px] text-text-muted">Aqui você define <strong>o que o FocoJur busca</strong> nos diários e quais lojas e CNPJs fazem parte do grupo, sem precisar de alteração no sistema. Três falhas seguidas de um conector geram e-mail aos admins.</p>
      </header>

      <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-freq">
        <div>
          <h2 id="h-freq" className="text-[17px] font-extrabold">Frequência da consulta automática</h2>
          <p className="mt-1 text-[13px] text-text-muted">
            De quantas em quantas horas o FocoJur consulta os diários sozinho. Hoje: <strong>a cada {intervalo} {intervalo === 1 ? 'hora' : 'horas'}</strong> ({runTimesLabel(intervalo)}).{' '}
            <strong>Vale para tudo:</strong> a consulta automática, a busca de um termo novo, editado ou ativado, e o período já selecionado em “Buscar de novo” e “Rodar agora”. A mudança vale em até 1 minuto, sem reiniciar.
            O DJEN informa só a data da publicação, então intervalos menores aumentam as consultas à API pública do CNJ sem trazer publicação que já não viria.
          </p>
        </div>
        <ActionForm action={setIntervalAction} submitLabel="Salvar intervalo" variant="btn-secondary" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1"><span className="label">Consultar a cada</span>
            <select className="input w-48" name="horas" defaultValue={String(intervalo)}>{HORAS.map((h) => <option key={h} value={h}>{h === 1 ? '1 hora' : `${h} horas`}</option>)}</select></label>
        </ActionForm>
      </section>

      {variations.length > 0 && (
        <section className="card flex flex-col gap-3 border-warn p-5" aria-labelledby="h-var">
          <div>
            <h2 id="h-var" className="text-[17px] font-extrabold">Variações do nome encontradas nas publicações ({variations.length})</h2>
            <p className="mt-1 text-[13px] text-text-muted">
              Estas grafias aparecem nos processos mas não batem com nenhum nome cadastrado. Podem ser a Foco escrita de outro jeito ou uma empresa homônima.{' '}
              <strong>É a Foco</strong> passa a buscar e confirmar esse nome; <strong>É homônimo</strong> descarta os itens abertos e ignora nas próximas buscas.
            </p>
          </div>
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Nome na publicação</th><th className="text-right">Publicações</th><th className="text-right">Processos</th><th></th></tr></thead>
            <tbody>
              {variations.map((v) => (
                <tr key={v.name}>
                  <td className="font-bold">{v.name}</td>
                  <td className="text-right tabular-nums">{v.publications}</td>
                  <td className="text-right tabular-nums">{v.processes}</td>
                  <td className="whitespace-nowrap text-right">
                    <form action={decideVariationAction} className="inline">
                      <input type="hidden" name="name" value={v.name} /><input type="hidden" name="decision" value="approved" />
                      <button className="btn-secondary" type="submit">É a Foco</button>
                    </form>{' '}
                    <form action={decideVariationAction} className="inline">
                      <input type="hidden" name="name" value={v.name} /><input type="hidden" name="decision" value="rejected" />
                      <button className="btn-ghost" type="submit">É homônimo</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}

      <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-lojas">
        <div>
          <h2 id="h-lojas" className="text-[17px] font-extrabold">Lojas e CNPJs do grupo</h2>
          <p className="mt-1 text-[13px] text-text-muted">Surgiu uma loja nova? Cadastre o CNPJ aqui. Se a empresa já é monitorada pelo nome (mesma raiz de CNPJ), nada mais é preciso. Se for uma <strong>empresa nova</strong> (raiz diferente), informe a razão social e a busca pelo nome é criada sozinha.</p>
        </div>
        {companies.length === 0 && <p className="text-sm text-text-muted">Nenhuma loja cadastrada.</p>}
        {companies.map((c) => (
          <details key={c.root} className="rounded-control border border-border" open={c.items.length <= 3}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3.5 py-2.5 text-sm font-extrabold">
              {c.items[0].companyName} <span className="badge b-gray">{c.items.length} CNPJ(s)</span>
              {nameRoots.has(c.root) ? <span className="badge b-teal">busca por nome ativa</span> : <span className="badge b-yel">sem busca por nome</span>}
            </summary>
            <div className="overflow-x-auto px-1 pb-2"><table className="tbl">
              <tbody>
                {c.items.map((e) => (
                  <tr key={e.id} className={e.active ? '' : 'opacity-60'}>
                    <td className="whitespace-nowrap font-bold">{formatCnpj(e.cnpj)}</td>
                    <td>
                      <details><summary className="cursor-pointer">{e.label}</summary>
                        <ActionForm action={updateEntityAction} submitLabel="Salvar nome" variant="btn-secondary" className="mt-2 flex flex-wrap items-end gap-2">
                          <input type="hidden" name="id" value={e.id} />
                          <label className="flex flex-col gap-1"><span className="label">Nome da loja</span><input className="input w-64" name="label" defaultValue={e.label} required /></label>
                        </ActionForm>
                      </details>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <form action={toggleEntityAction} className="inline"><input type="hidden" name="id" value={e.id} /><input type="hidden" name="active" value={String(!e.active)} /><button className="btn-ghost" type="submit">{e.active ? 'Desativar' : 'Reativar'}</button></form>
                      <form action={deleteEntityAction} className="inline"><input type="hidden" name="id" value={e.id} /><button className="btn-ghost" type="submit">Excluir</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </details>
        ))}
        <ActionForm action={addEntityAction} submitLabel="Cadastrar loja / empresa" className="grid items-end gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1"><span className="label">CNPJ</span><input className="input" name="cnpj" required placeholder="00.000.000/0000-00" /></label>
          <label className="flex flex-col gap-1"><span className="label">Nome da loja / unidade</span><input className="input" name="label" required placeholder="ex.: Maceió-AL (MCZ20)" /></label>
          <label className="flex flex-col gap-1"><span className="label">Razão social (só se a empresa for nova)</span><input className="input" name="companyName" placeholder="deixe vazio para loja de empresa já cadastrada" /></label>
        </ActionForm>
      </section>

      <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-termos">
        <div>
          <h2 id="h-termos" className="text-[17px] font-extrabold">O que buscar nos diários (DJEN)</h2>
          <p className="mt-1 text-[13px] text-text-muted">Cada termo é uma busca. Alterações valem na próxima consulta. “Desativar” só pausa; “Excluir” remove o termo (as publicações já recebidas ficam).</p>
        </div>
        <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th>Tipo</th><th>Termo</th><th>CNPJ p/ conferir</th><th>Situação</th><th>Última busca</th><th></th></tr></thead>
          <tbody>
            {terms.length === 0 && <tr><td colSpan={5} className="text-text-muted">Nenhum termo. Sem termos, nada é buscado.</td></tr>}
            {terms.map((t) => (
              <tr key={t.id} className={t.active ? '' : 'opacity-60'}>
                <td>{KIND_LABEL[t.kind]}</td>
                <td className="font-bold">
                  <details><summary className="cursor-pointer">{t.term}</summary>
                    <ActionForm action={updateTermAction} submitLabel="Salvar" variant="btn-secondary" className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={t.id} />
                      <label className="flex flex-col gap-1"><span className="label">Termo</span><input className="input w-64" name="term" defaultValue={t.term} required /></label>
                      {t.kind === 'name' && <label className="flex flex-col gap-1"><span className="label">CNPJ p/ conferir</span><input className="input w-56" name="document" defaultValue={t.document ?? ''} required /></label>}
                    </ActionForm>
                  </details>
                </td>
                <td>{t.document ?? '—'}</td>
                <td><span className={`badge ${t.active ? 'b-teal' : 'b-gray'}`}>{t.active ? 'Ativo' : 'Inativo'}</span></td>
                <td className="min-w-52 text-[13px]">
                  {!t.searchStatus && <span className="text-text-muted">—</span>}
                  {t.searchStatus === 'pending' && <span className="badge b-yel">Na fila</span>}
                  {t.searchStatus === 'running' && <span className="badge b-yel">Buscando…</span>}
                  {t.searchStatus === 'ok' && (
                    <span><span className="badge b-teal">Concluída</span> {t.searchFound ?? 0} publicações, {t.searchNew ?? 0} novas<br />
                      <span className="text-text-muted">{periodo(t.searchHours)}{t.searchFinishedAt ? ` · ${dateTimeBr(t.searchFinishedAt)}` : ''}</span></span>
                  )}
                  {t.searchStatus === 'error' && <span><span className="badge b-red">Erro</span> <span className="text-danger">{t.searchError?.slice(0, 90)}</span></span>}
                  {t.active && (
                    <ActionForm action={searchTermNowAction} submitLabel="Buscar de novo" variant="btn-ghost" className="mt-1 flex flex-wrap items-center gap-1">
                      <input type="hidden" name="id" value={t.id} />
                      <select className="input min-h-8 w-auto py-0 text-xs" name="horas" defaultValue={String(intervalo)} aria-label="Período da busca em horas">{HORAS.map((h) => <option key={h} value={h}>{h === 1 ? '1 hora' : `${h} horas`}</option>)}</select>
                    </ActionForm>
                  )}
                </td>
                <td className="whitespace-nowrap text-right">
                  <form action={toggleTermAction} className="inline"><input type="hidden" name="id" value={t.id} /><input type="hidden" name="active" value={String(!t.active)} /><button className="btn-ghost" type="submit">{t.active ? 'Desativar' : 'Reativar'}</button></form>
                  <form action={deleteTermAction} className="inline"><input type="hidden" name="id" value={t.id} /><button className="btn-ghost" type="submit">Excluir</button></form>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <ActionForm action={addTermAction} submitLabel="Adicionar termo" className="grid items-end gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1"><span className="label">Tipo</span>
            <select className="input" name="kind" defaultValue="name">{(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
          <label className="flex flex-col gap-1"><span className="label">Termo</span><input className="input" name="term" required placeholder="nome, nome completo do advogado, 34790/PE…" /></label>
          <label className="flex flex-col gap-1 sm:col-span-2"><span className="label">CNPJ para conferir (obrigatório para “Nome da parte”)</span><input className="input" name="document" placeholder="00.000.000/0000-00" /></label>
          <label className="flex flex-col gap-1 sm:col-span-4"><span className="label">Outras grafias do mesmo nome (opcional, uma por linha; só para “Nome da parte”)</span>
            <textarea className="input min-h-16 py-2" name="variants" placeholder={'FOCO LOCADORA DE VEÍCULOS\nLOCADORA FOCO'} /></label>
          <ul className="list-disc pl-5 text-xs text-text-muted sm:col-span-4">
            {(Object.keys(HELP) as (keyof typeof HELP)[]).map((k) => <li key={k}><strong>{KIND_LABEL[k]}:</strong> {HELP[k]}</li>)}
          </ul>
        </ActionForm>
      </section>

      <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-con">
        <h2 id="h-con" className="text-[17px] font-extrabold">Conectores</h2>
        <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th>Conector</th><th>Configuração</th><th>Última execução</th><th>Situação</th><th className="text-right">Lidos / novos</th><th></th></tr></thead>
          <tbody>
            {(Object.keys(CONNECTORS) as (keyof typeof CONNECTORS)[]).map((k) => {
              const cfg = CONNECTORS[k].isConfigured();
              const last = runs.find((r) => r.connector === k);
              const st = last ? STATUS[last.status] ?? STATUS.error : null;
              return (
                <tr key={k}>
                  <td className="font-extrabold">{NAMES[k]}</td>
                  <td>{cfg.ok ? <span className="badge b-teal">Configurado</span> : <span title={cfg.reason} className="badge b-yel">Pendente</span>}{!cfg.ok && <div className="mt-1 max-w-sm text-xs text-text-muted">{cfg.reason}</div>}</td>
                  <td className="whitespace-nowrap">{last ? dateTimeBr(last.startedAt) : '—'}</td>
                  <td>{st ? <span className={`badge ${st.cls}`}>{st.label}</span> : '—'}{last?.error && last.status === 'error' && <div className="mt-1 max-w-sm text-xs text-danger">{last.error.slice(0, 160)}</div>}</td>
                  <td className="text-right tabular-nums">{last ? `${last.itemsFound ?? 0} / ${last.itemsNew ?? 0}` : '—'}</td>
                  <td className="text-right">
                    <ActionForm action={runConnectorAction} submitLabel="Rodar agora" variant="btn-secondary" pendingLabel="Rodando…" className="flex flex-col items-end gap-1">
                      <input type="hidden" name="name" value={k} />
                      {(k === 'djen') && <label className="flex items-center gap-1.5 text-xs font-bold text-text-muted">Período
                        <select className="input min-h-8 w-auto py-0 text-xs" name="horas" defaultValue=""><option value="">{intervalo === 1 ? 'Janela automática (1 hora)' : `Janela automática (${intervalo} horas)`}</option>{HORAS.map((h) => <option key={h} value={h}>{h === 1 ? 'Última 1 hora' : `Últimas ${h} horas`}</option>)}</select></label>}
                    </ActionForm>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </section>

      <section className="card flex flex-col gap-2 pt-5" aria-labelledby="h-hist">
        <h2 id="h-hist" className="mx-3 text-[17px] font-extrabold">Últimas execuções</h2>
        <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th>Quando</th><th>Conector</th><th>Situação</th><th className="text-right">Lidos</th><th className="text-right">Novos</th><th>Erro</th></tr></thead>
          <tbody>
            {runs.slice(0, 15).map((r) => (
              <tr key={r.id}><td className="whitespace-nowrap">{dateTimeBr(r.startedAt)}</td><td>{NAMES[r.connector as keyof typeof NAMES] ?? r.connector}</td><td><span className={`badge ${(STATUS[r.status] ?? STATUS.error).cls}`}>{(STATUS[r.status] ?? STATUS.error).label}</span></td><td className="text-right tabular-nums">{r.itemsFound ?? 0}</td><td className="text-right tabular-nums">{r.itemsNew ?? 0}</td><td className="max-w-md truncate text-xs text-text-muted">{r.error ?? ''}</td></tr>
            ))}
            {runs.length === 0 && <tr><td colSpan={6} className="text-text-muted">Nenhuma execução ainda.</td></tr>}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
