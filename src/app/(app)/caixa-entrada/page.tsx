import Link from 'next/link';
import { INBOX_PF as PF, INBOX_SIT as SIT, INBOX_SRC as SRC, InboxItemInfo } from '@/components/inbox-item-info';
import { Pager } from '@/components/pager';
import { parsePage } from '@/lib/pagination';
import { requireUser } from '@/lib/auth/session';
import { formatCaseNumber } from '@/lib/case-number';
import { dateTimeBr } from '@/lib/format';
import { getInboxItem, inboxCounts, listInbox, type InboxFilter, type Parsed } from '@/server/inbox';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const FILTERS: [InboxFilter, string][] = [['all', 'Todos'], ['projuris', 'Projuris'], ['domicilio', 'Domicílio Judicial'], ['djen', 'DJEN por termos'], ['duplicate', 'Possível duplicado'], ['discarded', 'Descartados']];

export default async function CaixaEntradaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireUser();
  const sp = await searchParams;
  const filter = (FILTERS.some(([k]) => k === one(sp.filtro)) ? one(sp.filtro) : 'all') as InboxFilter;
  const q = one(sp.q).trim();
  const [data, counts] = await Promise.all([listInbox(filter, { page: parsePage(sp.p), q }), inboxCounts()]);
  const items = data.rows;
  // links preservam filtro, busca e página (o item aberto some ao trocar de página)
  const link = (o: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ filtro: filter, q, p: String(data.page), ...o })) if (v && !(k === 'p' && v === '1')) u.set(k, v);
    return `/caixa-entrada?${u}`;
  };
  const sel = one(sp.item) ? await getInboxItem(one(sp.item)) : null;
  const chip = (on: boolean) => `inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-bold no-underline ${on ? 'border-text bg-text text-on-text hover:text-on-text' : 'border-input-border bg-surface text-soft'}`;
  const open = sel && ['new', 'in_review', 'possible_duplicate'].includes(sel.status);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-extrabold">Caixa de entrada</h1>
          <p className="max-w-3xl text-[15px] text-text-muted">Tela de consulta: tudo o que foi capturado do Projuris, do Domicílio e do DJEN. Para classificar, confirmar, descartar ou cadastrar um processo novo, use a Triagem.</p>
        </div>
      </header>

      <div role="group" aria-label="Filtrar por fonte" className="flex flex-wrap gap-2">
        {FILTERS.map(([k, l]) => <Link key={k} className={chip(filter === k)} href={link({ filtro: k, p: '1', item: '' })}>{l}{counts[k] ? ` · ${counts[k]}` : ''}</Link>)}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2" role="search">
        <input type="hidden" name="filtro" value={filter} />
        <label className="flex flex-col gap-1"><span className="label">Buscar na caixa</span><input className="input w-80" name="q" defaultValue={q} placeholder="Número do processo, parte ou vara" /></label>
        <button className="btn-secondary" type="submit">Buscar</button>
        {q && <Link className="btn-ghost" href={link({ q: '', p: '1', item: '' })}>Limpar</Link>}
      </form>

      <div className="flex flex-wrap items-start gap-6">
        <section className="card min-w-0 flex-[3_1_560px] p-2 pb-0" aria-label="Itens da caixa de entrada">
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Recebido</th><th>Fonte</th><th>Processo</th><th>Carteira</th><th>Situação</th></tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={5} className="text-text-muted">Nada por aqui.</td></tr>}
              {items.map((i) => {
                const ip = (i.parsed ?? {}) as Parsed;
                return (
                  <tr key={i.id} className={sel?.id === i.id ? 'bg-selected' : ''}>
                    <td className="whitespace-nowrap">{dateTimeBr(i.capturedAt)}</td>
                    <td><span className={`badge ${SRC[i.source].cls}`}>{SRC[i.source].label}</span></td>
                    <td><Link className="font-extrabold" href={link({ item: i.id })}>{formatCaseNumber(i.caseNumber ?? '')}</Link><div className="text-xs text-text-muted">{ip.plaintiff ? `${ip.plaintiff} x Foco` : '—'}</div></td>
                    <td>{ip.portfolio ? PF[ip.portfolio] : '—'}</td>
                    <td><span className={`badge ${SIT[i.status].cls}`}>{SIT[i.status].label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          <Pager page={data.page} size={data.pageSize} total={data.total} href={(n) => link({ p: String(n), item: '' })} label="processos" />
        </section>

        {sel && (
          <aside className="card flex min-w-0 flex-[2_1_380px] flex-col gap-4 p-5" aria-labelledby="t-rev">
            <InboxItemInfo item={sel} />
            {sel.caseId && <Link className="btn-secondary" href={`/processos/${sel.caseId}`}>Abrir processo criado</Link>}
            {open && <Link className="btn" href={`/triagem?item=${sel.id}`}>Classificar na Triagem</Link>}
          </aside>
        )}
      </div>
    </>
  );
}
