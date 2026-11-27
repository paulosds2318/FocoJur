'use client';

import { useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { AssigneePicker } from '@/components/assignee-picker';
import { SelectHint } from '@/components/select-hint';
import { createTaskFromMovementAction, decideAction, discardOneAction, linkAction, updateTaskFromMovementAction } from './actions';

export type SuggestionProps = {
  movementId: string; suggestionId: string | null; act: string | null; days: number | null; dayCount: string | null;
  dueDate: string | null; dueLabel: string; basis: string | null; confidence: number | null; warn: boolean;
};

/** Confirmar prazo / Ajustar / Só marcar como lida — a IA sugere, a advogada decide (regra 1). */
export function SuggestionBox(p: SuggestionProps) {
  const [adjust, setAdjust] = useState(false);
  if (!p.suggestionId) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-control bg-bg px-3 py-2.5">
      <div className="text-xs font-extrabold text-ai">Sugestão da IA{p.confidence !== null ? ` · confiança ${Math.round(p.confidence * 100)}%` : ''}</div>
      <div className="text-sm font-bold">
        {p.act}{p.days ? ` · prazo ${p.days} dias ${p.dayCount === 'business' ? 'úteis' : 'corridos'}` : ''} · vence {p.dueLabel}
      </div>
      <div className="text-xs text-text-muted">
        {p.basis ? `Fundamento: ${p.basis}. ` : ''}Data calculada pelo sistema com o calendário de feriados.{p.warn ? ' Conferir feriados locais (calendário do tribunal não cadastrado).' : ''}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <ActionForm action={decideAction} submitLabel="Confirmar prazo" className="flex">
          <input type="hidden" name="suggestionId" value={p.suggestionId} /><input type="hidden" name="decision" value="accepted" />
        </ActionForm>
        <button className="btn-secondary" type="button" onClick={() => setAdjust((v) => !v)}>Ajustar</button>
        <ActionForm action={decideAction} submitLabel="Recusar sugestão" variant="btn-ghost" className="flex">
          <input type="hidden" name="suggestionId" value={p.suggestionId} /><input type="hidden" name="decision" value="rejected" />
        </ActionForm>
      </div>
      {adjust && (
        <ActionForm action={decideAction} submitLabel="Salvar ajuste e criar tarefa" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="suggestionId" value={p.suggestionId} /><input type="hidden" name="decision" value="edited" />
          <label className="flex flex-col gap-1"><span className="label">Prazo</span><input className="input w-44" type="date" name="finalDue" defaultValue={p.dueDate ?? ''} required /></label>
        </ActionForm>
      )}
    </div>
  );
}

export function LinkBox({ movementId }: { movementId: string }) {
  return (
    <ActionForm action={linkAction} submitLabel="Vincular" variant="btn-secondary" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="movementId" value={movementId} />
      <label className="flex flex-col gap-1"><span className="label">Vincular ao processo (número)</span><input className="input w-64" name="caseNumber" placeholder="0000000-00.0000.0.00.0000" required /></label>
    </ActionForm>
  );
}

export function DiscardBox({ movementId, reasons }: { movementId: string; reasons: readonly string[] }) {
  return (
    <ActionForm action={discardOneAction} submitLabel="Ignorar" variant="btn-ghost" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="movementId" value={movementId} />
      <label className="flex flex-col gap-1"><span className="label">Motivo para ignorar</span>
        <select className="input w-56" name="reason" defaultValue="" required><option value="" disabled>Escolha o motivo</option>{reasons.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
    </ActionForm>
  );
}

/** Criar tarefa à mão: o prazo é uma data ou "N dias úteis/corridos" a partir da publicação (o sistema calcula). */
export function TaskBox({ movementId, defaultTitle, types, owners, alwaysOpen = false, back }: {
  movementId: string; defaultTitle: string; alwaysOpen?: boolean; back?: 'alertas'; types: { id: string; label: string; description?: string | null }[]; owners: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(alwaysOpen);
  return (
    <div className="flex flex-col gap-2">
      {!alwaysOpen && <button className="btn-secondary self-start" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>Criar tarefa com prazo</button>}
      {open && (
        <ActionForm action={createTaskFromMovementAction} submitLabel="Criar tarefa" className="grid gap-3 rounded-control bg-bg p-3 sm:grid-cols-2">
          <input type="hidden" name="movementId" value={movementId} />
          {back && <input type="hidden" name="back" value={back} />}
          <label className="flex flex-col gap-1 sm:col-span-2"><span className="label">Título</span><input className="input" name="title" defaultValue={defaultTitle} required /></label>
          <SelectHint name="typeId" label="Tipo" options={types} hintPrefix="Dica do tipo: " />
          <AssigneePicker options={owners} />
          <label className="flex flex-col gap-1"><span className="label">Prazo limite (fatal)</span><input className="input" type="date" name="dueDate" /></label>
          <label className="flex flex-col gap-1"><span className="label">Prazo interno (opcional)</span><input className="input" type="date" name="internalDueDate" /><span className="text-xs text-text-muted">Em branco: calculado pelo tipo, quando o tipo tem a regra.</span></label>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1"><span className="label">ou calcular: dias</span><input className="input w-24" type="number" min={1} max={365} name="days" placeholder="15" /></label>
            <select className="input w-32" name="dayCount" defaultValue="business" aria-label="Contagem"><option value="business">úteis</option><option value="calendar">corridos</option></select>
          </div>
          <p className="text-xs text-text-muted sm:col-span-2">Os dias contam a partir da data da publicação, com o calendário de feriados do sistema. Se preencher os dois, vale o número de dias, que define o prazo limite. O prazo interno é a data em que a equipe quer entregar, antes do limite.</p>
        </ActionForm>
      )}
    </div>
  );
}

/** Processo com tarefa aberta: escolher a tarefa e, se o prazo mudou, informar o novo (em branco = mantém). */
export function UpdateTaskBox({ movementId, tasks }: { movementId: string; tasks: { id: string; label: string }[] }) {
  return (
    <ActionForm action={updateTaskFromMovementAction} submitLabel="Atualizar tarefa" className="grid gap-3 rounded-control bg-bg p-3 sm:grid-cols-2">
      <input type="hidden" name="movementId" value={movementId} />
      <label className="flex flex-col gap-1 sm:col-span-2"><span className="label">Tarefa existente</span>
        <select className="input" name="taskId" defaultValue={tasks[0]?.id}>{tasks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      <label className="flex flex-col gap-1"><span className="label">Novo prazo limite (opcional)</span><input className="input" type="date" name="dueDate" /></label>
      <label className="flex flex-col gap-1"><span className="label">Novo prazo interno (opcional)</span><input className="input" type="date" name="internalDueDate" /></label>
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1"><span className="label">ou calcular: dias</span><input className="input w-24" type="number" min={1} max={365} name="days" placeholder="15" /></label>
        <select className="input w-32" name="dayCount" defaultValue="business" aria-label="Contagem"><option value="business">úteis</option><option value="calendar">corridos</option></select>
      </div>
      <p className="text-xs text-text-muted sm:col-span-2">Em branco, os prazos da tarefa ficam como estão e o alerta só é dado como tratado. Os dias contam a partir da data da publicação.</p>
    </ActionForm>
  );
}
