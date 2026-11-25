'use client';

import { ActionForm } from '@/components/action-form';
import { AssigneePicker } from '@/components/assignee-picker';
import { createTaskAction } from './actions';

type Opt = { id: string; label: string };

export function TaskForm({ types, owners, caseId, caseOptions, buckets = [] }: { types: Opt[]; owners: Opt[]; caseId?: string; caseOptions?: Opt[]; buckets?: Opt[] }) {
  return (
    <ActionForm action={createTaskAction} submitLabel="Criar tarefa" className="mt-3 grid gap-3 sm:grid-cols-2">
      {caseId && <input type="hidden" name="caseId" value={caseId} />}
      <label className="flex flex-col gap-1 sm:col-span-2"><span className="label">Título</span><input className="input" name="title" required /></label>
      {!caseId && (
        <label className="flex flex-col gap-1 sm:col-span-2"><span className="label">Processo (vazio = tarefa geral)</span>
          <select className="input" name="caseId" defaultValue=""><option value="">Tarefa geral</option>{caseOptions?.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      )}
      <label className="flex flex-col gap-1"><span className="label">Tipo</span>
        <select className="input" name="typeId" defaultValue=""><option value="">—</option>{types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      {buckets.length > 0 && (
        <label className="flex flex-col gap-1"><span className="label">Coluna do quadro</span>
          <select className="input" name="bucketId" defaultValue=""><option value="">Sem bucket</option>{buckets.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label>
      )}
      <label className="flex flex-col gap-1"><span className="label">Prazo limite (fatal)</span><input className="input" type="date" name="dueDate" /></label>
      <label className="flex flex-col gap-1"><span className="label">Prazo interno (opcional)</span><input className="input" type="date" name="internalDueDate" /><span className="text-xs text-text-muted">Em branco: calculado pelo tipo, quando o tipo tem a regra.</span></label>
      <label className="flex flex-col gap-1"><span className="label">Horário (opcional)</span><input className="input" type="time" name="dueTime" /></label>
      <AssigneePicker options={owners} />
      <label className="flex flex-col gap-1"><span className="label">Revisor (opcional)</span>
        <select className="input" name="reviewerId" defaultValue=""><option value="">Sem revisor</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
    </ActionForm>
  );
}
