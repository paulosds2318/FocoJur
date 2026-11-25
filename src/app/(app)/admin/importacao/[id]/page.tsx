import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { AutoRefresh } from '@/components/auto-refresh';
import { requireAdmin } from '@/lib/auth/session';
import { dateTimeBr } from '@/lib/format';
import { buildRecords, FIELDS, type ImportConfig } from '@/lib/migration/base-import';
import { batchWorkbook, getBatch, previewRecords, sheetHeaders, type IssueRow } from '@/server/base-import';
import { runImportAction, saveConfigAction } from '../actions';

const LIST_LABEL: Record<string, string> = {
  system: 'Sistema / portal', court_type: 'Foro / esfera', status: 'Status do processo', subject: 'Objeto', claim: 'Pedido', closing_reason: 'Motivo de encerramento', rental_type: 'Tipo de locação',
};
const num = (n: number) => n.toLocaleString('pt-BR');

function Issues({ issues }: { issues: IssueRow[] }) {
  const byCode = new Map<string, { n: number; severity: string; message: string }>();
  for (const i of issues) {
    const cur = byCode.get(i.code);
    if (cur) cur.n++;
    else byCode.set(i.code, { n: 1, severity: i.severity, message: i.message });
  }
  if (!issues.length) return <p className="text-sm text-text-muted">Nenhuma exceção encontrada.</p>;
  return (
    <>
      <ul className="flex flex-wrap gap-2 text-xs">
        {[...byCode].sort((a, b) => b[1].n - a[1].n).map(([code, v]) => (
          <li key={code} className={`badge ${v.severity === 'grave' ? 'b-red' : 'b-yel'}`}>{code.replace(/_/g, ' ')}: {num(v.n)}</li>
        ))}
      </ul>
      <div className="overflow-x-auto"><table className="tbl">
        <thead><tr><th>Aba</th><th>Linha</th><th>Processo</th><th>Gravidade</th><th>O que houve</th></tr></thead>
        <tbody>
          {issues.slice(0, 100).map((i, k) => (
            <tr key={k}><td>{i.sheet}</td><td>{i.row}</td><td className="whitespace-nowrap">{i.number}</td>
              <td><span className={`badge ${i.severity === 'grave' ? 'b-red' : 'b-yel'}`}>{i.severity === 'grave' ? 'Grave: não importa' : 'Aviso: importa'}</span></td><td>{i.message}</td></tr>
          ))}
        </tbody>
      </table></div>
      {issues.length > 100 && <p className="text-xs text-text-muted">Mostrando as 100 primeiras de {num(issues.length)}. O relatório em Excel traz todas.</p>}
    </>
  );
}

export default async function ImportacaoLotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const batch = await getBatch(id);
  if (!batch) notFound();
  const head = (
    <header className="flex flex-col gap-1.5">
      <h1 className="text-[28px] font-extrabold">Importação: {batch.fileName}</h1>
      <p className="text-[15px] text-text-muted">Enviada em {dateTimeBr(batch.createdAt)}.</p>
    </header>
  );

  if (batch.status === 'running') {
    const done = batch.progressDone ?? 0, total = batch.progressTotal ?? 0;
    return (
      <>
        {head}
        <AutoRefresh active everyMs={3000} />
        <section className="card flex flex-col gap-3 p-5" aria-live="polite">
          <h2 className="text-[17px] font-extrabold">Importando…</h2>
          <div className="h-3 w-full overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total || 1}>
            <div className="h-full bg-primary" style={{ width: `${total ? Math.round((done / total) * 100) : 5}%` }} />
          </div>
          <p className="text-sm text-text-muted">{total ? `${num(done)} de ${num(total)} linhas` : 'Preparando…'}. Pode sair desta tela: a importação continua em segundo plano.</p>
        </section>
      </>
    );
  }

  if (batch.status === 'error') {
    return (
      <>
        {head}
        <section className="card p-5"><p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm font-bold text-danger">A importação parou com erro: {batch.error}</p>
          <p className="mt-2 text-sm text-text-muted">O que já foi criado foi mantido. Envie a planilha de novo para continuar: processos existentes são pulados.</p></section>
      </>
    );
  }

  if (batch.status === 'done') {
    const sum = (batch.summary ?? {}) as Record<string, number>;
    const rep = (batch.report ?? {}) as { issues?: IssueRow[]; issuesTotal?: number; unknown?: { type: string; values: string[] }[]; noOwner?: string[]; notes?: string[] };
    return (
      <>
        {head}
        <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-res">
          <h2 id="h-res" className="text-[17px] font-extrabold">Importação concluída{batch.finishedAt ? ` em ${dateTimeBr(batch.finishedAt)}` : ''}</h2>
          <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {([['Criados', sum.created], ['Concluídos entre eles', sum.createdClosed], ['Já existiam (pulados)', sum.existing], ['Bloqueados', sum.blocked], ['Itens da Triagem ligados', sum.inboxLinked], ['Publicações no histórico', sum.publicationsLinked], ['Linhas lidas', sum.total]] as const).map(([l, v]) => (
              <div key={l} className="rounded-control bg-bg px-3 py-2.5"><dt className="text-xs font-bold text-text-muted">{l}</dt><dd className="text-xl font-extrabold">{num(v ?? 0)}</dd></div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-3">
            <a className="btn" href={`/admin/importacao/${batch.id}/relatorio`}>Baixar relatório em Excel</a>
            <Link className="btn-secondary" href="/processos">Ver processos</Link>
          </div>
        </section>
        {(rep.unknown?.length ?? 0) > 0 && (
          <section className="card flex flex-col gap-2 p-5"><h2 className="text-[17px] font-extrabold">Valores da planilha que não existem nas listas oficiais</h2>
            <p className="text-sm text-text-muted">Esses campos ficaram vazios nos processos importados. Cadastre o valor em Listas oficiais (ou ajuste a planilha) e corrija o processo.</p>
            {rep.unknown!.map((u) => <p key={u.type} className="text-sm"><strong>{LIST_LABEL[u.type] ?? u.type}:</strong> {u.values.slice(0, 40).join('; ')}{u.values.length > 40 ? '…' : ''}</p>)}</section>
        )}
        {(rep.noOwner?.length ?? 0) > 0 && (
          <section className="card flex flex-col gap-2 p-5"><h2 className="text-[17px] font-extrabold">Advogadas sem usuário no FocoJur</h2>
            <p className="text-sm">{rep.noOwner!.join('; ')}. Os processos delas foram gravados com escritório externo.</p></section>
        )}
        <section className="card flex flex-col gap-3 p-5"><h2 className="text-[17px] font-extrabold">Exceções ({num(rep.issuesTotal ?? 0)})</h2><Issues issues={rep.issues ?? []} /></section>
      </>
    );
  }

  // ---------- rascunho: mapeamento + prévia ----------
  const config = (batch.config ?? { sheets: [] }) as ImportConfig;
  const wb = await batchWorkbook(batch);
  const headers = sheetHeaders(wb, config);
  const { records, notes } = buildRecords(wb, config);
  const pv = await previewRecords(records, notes);

  return (
    <>
      {head}
      <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-map">
        <h2 id="h-map" className="text-[17px] font-extrabold">2. Conferir o de-para das colunas</h2>
        <p className="text-sm text-text-muted">O sistema sugeriu a carteira de cada aba e qual coluna da planilha alimenta cada campo. Corrija o que estiver errado e salve: a prévia abaixo se atualiza.</p>
        {/* o formulário não remonta (a mensagem "salvo" fica); só os campos recebem a chave para refletir o mapeamento gravado */}
        <ActionForm action={saveConfigAction} submitLabel="Salvar mapeamento e atualizar prévia" pendingLabel="Salvando…" className="flex flex-col gap-3">
          <input type="hidden" name="id" value={batch.id} />
          <input type="hidden" name="sheetCount" value={config.sheets.length} />
          <div key={batch.updatedAt.getTime()} className="flex flex-col gap-3">
          {config.sheets.map((s, i) => {
            const h = headers[s.name];
            return (
              <details key={s.name} open={s.use} className="rounded-control border border-border bg-surface p-3.5">
                <summary className="cursor-pointer text-sm font-extrabold">
                  {s.name} <span className="font-semibold text-text-muted">· {num(h.rows)} linhas · {s.use ? 'será importada' : 'não será importada'}</span>
                </summary>
                <input type="hidden" name={`s${i}_name`} value={s.name} />
                <div className="mt-3 flex flex-wrap items-end gap-4">
                  <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name={`s${i}_use`} defaultChecked={s.use} className="size-[18px] accent-primary" /> Importar esta aba</label>
                  <label className="flex flex-col gap-1"><span className="label">Carteira</span>
                    <select className="input w-40" name={`s${i}_portfolio`} defaultValue={s.portfolio}><option value="civil">Cível</option><option value="labor">Trabalhista</option><option value="procon">Procon</option></select></label>
                  <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name={`s${i}_closed`} defaultChecked={s.closedSheet} className="size-[18px] accent-primary" /> Aba de processos encerrados (entram como concluídos)</label>
                  <label className="flex flex-col gap-1"><span className="label">Polo</span>
                    <select className="input w-36" name={`s${i}_polarity`} defaultValue={s.polarity}><option value="passive">Passivo (Foco é ré)</option><option value="active">Ativo (Foco é autora)</option></select></label>
                  <label className="flex flex-col gap-1"><span className="label">Linha dos títulos</span>
                    <input className="input w-24" type="number" min={1} name={`s${i}_header`} defaultValue={s.headerRow} /></label>
                </div>
                <div className="mt-3 grid gap-x-4 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {FIELDS.map((f) => (
                    <label key={f.key} className="flex flex-col gap-1">
                      <span className="label">{f.label}{f.required ? ' *' : ''}</span>
                      <select className="input" name={`s${i}_col_${f.key}`} defaultValue={s.columns[f.key] === null || s.columns[f.key] === undefined ? '' : String(s.columns[f.key])}>
                        <option value="">— não importar —</option>
                        {h.headers.map((t, k) => (t ? <option key={k} value={k}>{`${k + 1}. ${t}`}</option> : null))}
                      </select>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-text-muted">Mudou a “Linha dos títulos”? Salve: as colunas são sugeridas de novo a partir da nova linha.</p>
              </details>
            );
          })}
          </div>
        </ActionForm>
      </section>

      <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-prev">
        <h2 id="h-prev" className="text-[17px] font-extrabold">3. Prévia (nada foi gravado)</h2>
        {pv.notes.map((n) => <p key={n} role="alert" className="rounded-control bg-warn-bg px-3 py-2 text-sm font-bold text-warn">{n}</p>)}
        {pv.total === 0 ? (
          <p className="text-sm text-text-muted">Nenhuma linha lida. Marque ao menos uma aba e confira a coluna do número do processo.</p>
        ) : (
          <>
            <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {([['Linhas lidas', pv.total], ['Serão criados', pv.toCreate], ['Concluídos entre eles', pv.toCreateClosed], ['Já existem (pulados)', pv.existing], ['Bloqueados (exceção grave)', pv.blocked], ['Com aviso', pv.sheets.reduce((n, s) => n + s.warnings, 0)]] as const).map(([l, v]) => (
                <div key={l} className="rounded-control bg-bg px-3 py-2.5"><dt className="text-xs font-bold text-text-muted">{l}</dt><dd className="text-xl font-extrabold">{num(v)}</dd></div>
              ))}
            </dl>
            <div className="overflow-x-auto"><table className="tbl">
              <thead><tr><th>Aba</th><th>Linhas</th><th>Importáveis</th><th>Concluídos</th><th>Bloqueadas</th><th>Com aviso</th></tr></thead>
              <tbody>{pv.sheets.map((s) => <tr key={s.name}><td className="font-bold">{s.name}</td><td>{num(s.total)}</td><td>{num(s.importable)}</td><td>{num(s.closed)}</td><td>{num(s.blocked)}</td><td>{num(s.warnings)}</td></tr>)}</tbody>
            </table></div>
            {pv.unknown.length > 0 && (
              <div className="flex flex-col gap-1 rounded-control bg-warn-bg px-3.5 py-3 text-sm"><strong className="text-warn">Valores que não existem nas listas oficiais (o campo ficará vazio):</strong>
                {pv.unknown.map((u) => <p key={u.type}><strong>{LIST_LABEL[u.type] ?? u.type}:</strong> {u.values.slice(0, 30).join('; ')}{u.values.length > 30 ? '…' : ''}</p>)}
                <p className="text-xs text-text-muted">Se preferir, cadastre esses valores em Listas oficiais antes de importar.</p></div>
            )}
            {pv.noOwner.length > 0 && <p className="rounded-control bg-warn-bg px-3.5 py-3 text-sm"><strong className="text-warn">Advogadas sem usuário:</strong> {pv.noOwner.join('; ')}. Os processos delas entram com escritório externo.</p>}
            <h3 className="text-sm font-extrabold">Exceções encontradas</h3>
            <Issues issues={pv.issues} />
          </>
        )}
      </section>

      <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-run">
        <h2 id="h-run" className="text-[17px] font-extrabold">4. Importar</h2>
        {pv.toCreate === 0 ? (
          <p className="text-sm text-text-muted">Não há processos novos para criar com este mapeamento.</p>
        ) : (
          <>
            <p className="text-sm text-text-muted">
              Vai criar <strong>{num(pv.toCreate)}</strong> processos ({num(pv.toCreateClosed)} concluídos, sem monitoramento; os demais com monitoramento ligado). Os {num(pv.existing)} que já existem são pulados.
              Exceções graves não entram. A importação roda em segundo plano e você acompanha o andamento. Vale o mapeamento <strong>salvo</strong> acima.
            </p>
            <ActionForm action={runImportAction} submitLabel={`Importar ${num(pv.toCreate)} processos`} pendingLabel="Iniciando…" className="flex">
              <input type="hidden" name="id" value={batch.id} />
            </ActionForm>
          </>
        )}
      </section>
    </>
  );
}
