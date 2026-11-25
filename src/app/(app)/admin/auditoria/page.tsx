import Link from 'next/link';
import { Pager } from '@/components/pager';
import { requireAdmin } from '@/lib/auth/session';
import { dateTimeBr } from '@/lib/format';
import { parsePage } from '@/lib/pagination';
import { formatAuditDiff } from '@/lib/audit-format';
import { ACTION_LABEL, auditFacets, auditSummaryByUser, ENTITY_LABEL, listAudit, resolveAuditNames } from '@/server/audit-log';
import { listUsers } from '@/server/users';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Link para o registro afetado, quando existe tela para ele. */
function target(entity: string, id: string | null) {
  if (!id) return null;
  if (entity === 'case' || entity === 'case_risk') return `/processos/${id}`;
  if (entity === 'task') return `/tarefas/${id}`;
  return null;
}

/** O que mudou, em linguagem do dia a dia: "Prazo limite: vazio → 15/01/2030". */
function Changes({ lines }: { lines: ReturnType<typeof formatAuditDiff> }) {
  if (!lines.length) return <span className="text-text-muted">—</span>;
  return (
    <ul className="flex max-w-xl flex-col gap-1 text-[13px] leading-snug">
      {lines.map((l, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-bold text-soft">{l.label}:</span>
          {l.before === null && l.after !== null && <span>{l.after}</span>}
          {l.before !== null && l.after === null && <><span className="text-text-muted line-through">{l.before}</span><span className="text-text-muted">(removido)</span></>}
          {l.before !== null && l.after !== null && <><span className="text-text-muted line-through">{l.before}</span><span aria-hidden="true">→</span><span className="font-bold">{l.after}</span></>}
        </li>
      ))}
    </ul>
  );
}

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const f = { userId: one(sp.usuario), entity: one(sp.entidade), action: one(sp.acao), from: one(sp.de), to: one(sp.ate) };
  const [data, summary, facets, users] = await Promise.all([listAudit({ ...f, page: parsePage(sp.p) }), auditSummaryByUser(f), auditFacets(), listUsers()]);
  const names = await resolveAuditNames(data.rows.map((r) => r.diff));
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ usuario: f.userId, entidade: f.entity, acao: f.action, de: f.from, ate: f.to, p: String(p) })) if (v) q.set(k, v);
    return `/admin/auditoria?${q}`;
  };
  const userHref = (id: string | null) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ usuario: id ?? 'system', entidade: f.entity, acao: f.action, de: f.from, ate: f.to })) if (v) q.set(k, v);
    return `/admin/auditoria?${q}`;
  };
  const filtered = !!(f.userId || f.entity || f.action || f.from || f.to);

  return (
    <>
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-extrabold">Auditoria</h1>
        <p className="text-[15px] text-text-muted">Tudo o que cada pessoa fez no sistema: quem, o quê, em qual registro e quando (horário de Brasília). O sistema não tem opção de editar ou apagar estes registros. Só o administrador vê esta tela.</p>
      </header>

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4" aria-label="Filtros da auditoria">
        <label className="flex flex-col gap-1"><span className="label">Usuário</span>
          <select className="input w-52" name="usuario" defaultValue={f.userId}>
            <option value="">Todos</option><option value="system">Sistema (automático)</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select></label>
        <label className="flex flex-col gap-1"><span className="label">O que foi mexido</span>
          <select className="input w-52" name="entidade" defaultValue={f.entity}>
            <option value="">Tudo</option>{facets.entities.map((e) => <option key={e} value={e}>{ENTITY_LABEL[e] ?? e}</option>)}
          </select></label>
        <label className="flex flex-col gap-1"><span className="label">Ação</span>
          <select className="input w-52" name="acao" defaultValue={f.action}>
            <option value="">Todas</option>{facets.actions.map((a) => <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>)}
          </select></label>
        <label className="flex flex-col gap-1"><span className="label">De</span><input className="input" type="date" name="de" defaultValue={f.from} /></label>
        <label className="flex flex-col gap-1"><span className="label">Até</span><input className="input" type="date" name="ate" defaultValue={f.to} /></label>
        <button className="btn" type="submit">Filtrar</button>
        {filtered && <Link className="text-sm font-bold" href="/admin/auditoria">Limpar filtros</Link>}
      </form>

      {summary.length > 0 && (
        <section className="card p-4" aria-labelledby="h-resumo">
          <h2 id="h-resumo" className="mb-2 text-base font-extrabold text-soft">Atividade por usuário {filtered ? '(nos filtros escolhidos)' : ''}</h2>
          <div className="flex flex-wrap gap-2">
            {summary.map((s) => (
              <Link key={s.actorId ?? 'system'} href={userHref(s.actorId)} className="rounded-control border border-border bg-bg px-3 py-2 text-sm no-underline hover:border-primary">
                <span className="font-extrabold">{s.actorName ?? 'Sistema'}</span> <span className="text-text-muted">· {s.n.toLocaleString('pt-BR')} {s.n === 1 ? 'registro' : 'registros'} · último {dateTimeBr(s.last)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="card pt-2" aria-label="Registros de auditoria">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>O quê</th><th>Detalhes</th></tr></thead>
            <tbody>
              {data.rows.length === 0 && <tr><td colSpan={5} className="text-text-muted">Nenhum registro para esses filtros.</td></tr>}
              {data.rows.map((r) => {
                const link = target(r.entity, r.entityId);
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{dateTimeBr(r.at)}</td>
                    <td className="font-bold">{r.actorName ?? (r.actorId ? 'Usuário removido' : 'Sistema')}</td>
                    <td>{ACTION_LABEL[r.action] ?? r.action}</td>
                    <td className="whitespace-nowrap">{ENTITY_LABEL[r.entity] ?? r.entity}{link && <> · <Link className="font-bold" href={link}>abrir</Link></>}</td>
                    <td className="min-w-0">
                      <Changes lines={formatAuditDiff(r.diff, names)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={data.page} size={data.pageSize} total={data.total} href={href} label="registros" />
      </section>
    </>
  );
}
