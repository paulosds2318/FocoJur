import Link from 'next/link';
import { Pager } from '@/components/pager';
import { requireUser } from '@/lib/auth/session';
import { formatCaseNumber } from '@/lib/case-number';
import { PORTFOLIO_LABEL, PROGNOSIS_CLS, PROGNOSIS_LABEL, money } from '@/lib/format';
import { parseCaseFilters } from '@/lib/case-filters';
import { searchCases } from '@/server/cases';
import { getLookups } from '@/server/lookups';
import { listUsers } from '@/server/users';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function ProcessosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireUser();
  const sp = await searchParams;
  const f = parseCaseFilters(sp);
  const [{ rows, total, page, pageSize }, lk, users] = await Promise.all([
    searchCases(f),
    getLookups(['subject']),
    listUsers(),
  ]);
  const subjects = new Map(lk.subject.map((s) => [s.id, s.label]));
  const canWrite = session.user.role !== 'viewer';
  const exportQs = (() => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== 'page' && one(v)) u.set(k, one(v));
    return u.toString();
  })();
  const qs = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== 'page' && one(v)) u.set(k, one(v));
    u.set('page', String(p));
    return `/processos?${u}`;
  };

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-extrabold">Processos</h1>
          <p className="text-[15px] text-text-muted">Cível, Trabalhista e Procon numa só base. Substitui as abas da planilha Contencioso.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-secondary" href={`/processos/export?${exportQs}`}>Exportar Excel</a>
          {canWrite && <Link className="btn" href="/processos/novo">Novo processo</Link>}
        </div>
      </header>

      <form method="get" className="card flex flex-col gap-3 p-4" aria-label="Busca e filtros">
        <label className="flex flex-col gap-1">
          <span className="label">Buscar</span>
          <input className="input" name="q" defaultValue={f.q} placeholder="Número do processo, parte, contrato (ex.: POA004871-26) ou placa" />
        </label>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <Select name="portfolio" label="Carteira" value={f.portfolio} options={[['', 'Todas'], ['civil', 'Cível'], ['labor', 'Trabalhista'], ['procon', 'Procon']]} />
          <Select name="status" label="Situação" value={f.status} options={[['open', 'Em andamento'], ['closed', 'Encerrado'], ['all', 'Todos']]} />
          <Select name="prognosis" label="Prognóstico" value={f.prognosis} options={[['', 'Todos'], ['probable', 'Provável'], ['possible', 'Possível'], ['remote', 'Remoto']]} />
          <Select name="subjectId" label="Objeto" value={f.subjectId} options={[['', 'Todos'], ...lk.subject.map((s) => [s.id, s.label] as [string, string])]} />
          <label className="flex flex-col gap-1"><span className="label">UF</span><input className="input" name="state" maxLength={2} defaultValue={f.state} placeholder="Todas" /></label>
          <Select name="ownerId" label="Responsável" value={f.ownerId} options={[['', 'Todas'], ...users.filter((u) => u.role !== 'viewer').map((u) => [u.id, u.name] as [string, string])]} />
          <Select name="monitoring" label="Monitoramento" value={f.monitoring ?? ''} options={[['', 'Todos'], ['on', 'Ativo'], ['off', 'Desligado'], ['stale', 'Carteira parada (90+ dias)']]} />
        </div>
        <div className="flex gap-2"><button className="btn" type="submit">Filtrar</button><Link className="btn-secondary" href="/processos">Limpar</Link></div>
      </form>

      <section className="card flex flex-col pt-2" aria-label="Lista de processos">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Processo</th><th>Carteira</th><th>Objeto</th><th>Local</th><th>Loja</th><th>Prognóstico</th><th className="text-right">Valor de risco</th><th>Responsável</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="text-text-muted">Nenhum processo encontrado.</td></tr>}
              {rows.map((r) => {
                const stale = !r.closedAt && r.monitoring && Date.now() - new Date(r.lastMovementAt ?? r.createdAt).getTime() > 90 * 86400_000;
                return (
                  <tr key={r.id}>
                    <td>
                      <Link className="font-extrabold" href={`/processos/${r.id}`}>{formatCaseNumber(r.number)}</Link>
                      <div className="text-xs text-text-muted">{r.plaintiff ?? '—'}</div>
                    </td>
                    <td><span className="badge b-gray">{PORTFOLIO_LABEL[r.portfolio]}</span></td>
                    <td>{r.subjectId ? subjects.get(r.subjectId) ?? '—' : '—'}</td>
                    <td className="whitespace-nowrap">{[r.city, r.state].filter(Boolean).join(' - ') || '—'}</td>
                    <td>{r.costCenter ?? '—'}</td>
                    <td>
                      {r.prognosis ? <span className={`badge ${PROGNOSIS_CLS[r.prognosis as keyof typeof PROGNOSIS_CLS]}`}>{PROGNOSIS_LABEL[r.prognosis as keyof typeof PROGNOSIS_LABEL]}</span> : '—'}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">{money(r.riskTotal)}</td>
                    <td>
                      {r.ownerName ?? '—'}
                      {r.closedAt && <div><span className="badge b-gray">Encerrado</span></div>}
                      {stale && <div><span className="badge b-yel">Parado 90+ dias</span></div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={page} size={pageSize} total={total} href={qs} label="processos" />
      </section>
    </>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <select className="input" name={name} defaultValue={value ?? ''}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
