import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { getLookups } from '@/server/lookups';
import { listUsers } from '@/server/users';
import { NewCaseForm } from './form';

export default async function NovoProcessoPage() {
  await requireRole('admin', 'lawyer');
  const [lk, users] = await Promise.all([
    getLookups(['system', 'court_type', 'subject', 'claim']),
    listUsers(),
  ]);
  const pick = (rows: { id: string; label: string }[]) => rows.map((r) => ({ id: r.id, label: r.label }));
  return (
    <>
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-extrabold">Novo processo</h1>
        <p className="text-[15px] text-text-muted">Cadastro manual. Quando a caixa de entrada existir (etapa 1b), o cadastro nasce dela.</p>
      </header>
      <NewCaseForm
        systems={pick(lk.system)}
        courtTypes={pick(lk.court_type)}
        subjects={pick(lk.subject)}
        claims={pick(lk.claim)}
        owners={users.filter((u) => u.role !== 'viewer' && u.active !== false).map((u) => ({ id: u.id, label: u.name }))}
      />
    </>
  );
}
