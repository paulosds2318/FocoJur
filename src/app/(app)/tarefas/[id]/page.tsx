import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { AssigneePicker } from '@/components/assignee-picker';
import { BackTo } from '@/components/back-button';
import { requireUser } from '@/lib/auth/session';
import { formatCaseNumber } from '@/lib/case-number';
import { PORTFOLIO_LABEL } from '@/lib/format';
import { getLookups } from '@/server/lookups';
import { getTask } from '@/server/task-edit';
import { STATUS_LABEL } from '@/server/tasks';
import { listUsers } from '@/server/users';
import { updateTaskAction } from '../actions';

const ORIGIN = { manual: 'Cadastrada à mão', ai_suggestion: 'Criada a partir de sugestão da IA (confirmada por uma advogada)', migration: 'Migrada do Planner' } as const;

export default async function EditarTarefaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;
  const t = await getTask(id);
  if (!t) notFound();
  const [lk, users] = await Promise.all([getLookups(['task_type', 'task_bucket'], { includeInactive: true }), listUsers()]);
  const canWrite = session.user.role !== 'viewer';
  const people = users.filter((u) => u.role !== 'viewer' && (u.active !== false || t.assigneeIds.includes(u.id) || u.id === t.reviewerId));

  return (
    <>
      {t.caseId && <BackTo href={`/processos/${t.caseId}?tab=tarefas`} label={`o processo ${formatCaseNumber(t.caseNumber ?? '')}`} />}
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[28px] font-extrabold">Tarefa</h1>
          <span className="badge b-gray">{STATUS_LABEL[t.status]}</span>
        </div>
        <p className="text-[15px] text-text-muted">
          {t.caseId ? <>Processo <Link className="font-bold" href={`/processos/${t.caseId}`}>{formatCaseNumber(t.caseNumber ?? '')}</Link>{t.portfolio ? ` · ${PORTFOLIO_LABEL[t.portfolio]}` : ''}</> : 'Tarefa geral (sem processo)'}
          {' · '}{ORIGIN[t.origin]}
        </p>
      </header>

      <section className="card p-5" aria-labelledby="h-edit">
        <h2 id="h-edit" className="mb-3 text-[17px] font-extrabold">{canWrite ? 'Editar tarefa' : 'Dados da tarefa'}</h2>
        {canWrite ? (
          <ActionForm action={updateTaskAction} submitLabel="Salvar alterações" className="grid gap-3.5 sm:grid-cols-2">
            <input type="hidden" name="id" value={t.id} />
            {t.caseId && <input type="hidden" name="caseId" value={t.caseId} />}
            <label className="flex flex-col gap-1 sm:col-span-2"><span className="label">Título</span><input className="input" name="title" defaultValue={t.title} required /></label>
            <label className="flex flex-col gap-1"><span className="label">Tipo</span>
              <select className="input" name="typeId" defaultValue={t.typeId ?? ''}><option value="">—</option>{lk.task_type.filter((x) => x.active || x.id === t.typeId).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="label">Coluna do quadro</span>
              <select className="input" name="bucketId" defaultValue={t.bucketId ?? ''}><option value="">Sem bucket</option>{lk.task_bucket.filter((x) => x.active || x.id === t.bucketId).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="label">Prazo limite (fatal)</span><input className="input" type="date" name="dueDate" defaultValue={t.dueDate ?? ''} /></label>
            <label className="flex flex-col gap-1"><span className="label">Prazo interno (opcional)</span><input className="input" type="date" name="internalDueDate" defaultValue={t.internalDueDate ?? ''} /></label>
            <label className="flex flex-col gap-1"><span className="label">Horário (opcional)</span><input className="input" type="time" name="dueTime" defaultValue={t.dueTime?.slice(0, 5) ?? ''} /></label>
                        <AssigneePicker options={people.map((u) => ({ id: u.id, label: u.name }))} defaultIds={t.assigneeIds} />
            <label className="flex flex-col gap-1"><span className="label">Revisor (opcional)</span>
              <select className="input" name="reviewerId" defaultValue={t.reviewerId ?? ''}><option value="">Sem revisor</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
            <p className="text-xs text-text-muted sm:col-span-2">Com revisor, a tarefa só vai para “Concluída” depois que ele aprovar. O status se muda no quadro de tarefas.</p>
          </ActionForm>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="label">Título</dt><dd className="font-bold">{t.title}</dd></div>
            <div><dt className="label">Prazo limite</dt><dd className="font-bold">{t.dueDate ?? '—'}</dd></div>
            <div><dt className="label">Prazo interno</dt><dd className="font-bold">{t.internalDueDate ?? '—'}</dd></div>
          </dl>
        )}
      </section>
    </>
  );
}
