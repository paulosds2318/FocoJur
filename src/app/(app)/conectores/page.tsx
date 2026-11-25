import { desc } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import { connectorRun } from '@/db/schema/inbox';
import { requireUser } from '@/lib/auth/session';
import { CONNECTORS } from '@/lib/connectors/runner';
import { dateTimeBr } from '@/lib/format';

const NAMES = { djen: 'DJEN por termos', datajud: 'DataJud', domicilio: 'Domicílio Judicial Eletrônico', projuris: 'Projuris (API)' } as const;
const STATUS: Record<string, { label: string; cls: string }> = {
  ok: { label: 'Funcionando', cls: 'b-teal' }, error: { label: 'Com erro', cls: 'b-red' }, running: { label: 'Rodando', cls: 'b-yel' }, partial: { label: 'Parcial', cls: 'b-yel' }, not_configured: { label: 'Aguardando configuração', cls: 'b-gray' },
};

/** Visão somente leitura para as advogadas saberem se as publicações estão chegando; quem configura é o admin. */
export default async function ConectoresPage() {
  const session = await requireUser();
  const runs = await db.select().from(connectorRun).orderBy(desc(connectorRun.startedAt)).limit(100);
  const isAdmin = session.user.role === 'admin';
  return (
    <>
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-extrabold">Situação dos conectores</h1>
        <p className="text-[15px] text-text-muted">De onde vêm as publicações e movimentações, e se a última consulta deu certo. {isAdmin && <Link href="/admin/monitoramento" className="font-bold">Configurar termos e rodar agora</Link>}</p>
      </header>
      <section className="card pt-2" aria-label="Conectores">
        <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th>Fonte</th><th>Última consulta</th><th>Situação</th><th className="text-right">Itens novos</th></tr></thead>
          <tbody>
            {(Object.keys(CONNECTORS) as (keyof typeof CONNECTORS)[]).map((k) => {
              const last = runs.find((r) => r.connector === k);
              const st = last ? STATUS[last.status] ?? STATUS.error : null;
              return (
                <tr key={k}>
                  <td className="font-extrabold">{NAMES[k]}</td>
                  <td className="whitespace-nowrap">{last ? dateTimeBr(last.startedAt) : 'Nunca rodou'}</td>
                  <td>{st ? <span className={`badge ${st.cls}`}>{st.label}</span> : <span className="badge b-gray">Aguardando configuração</span>}</td>
                  <td className="text-right tabular-nums">{last?.itemsNew ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
