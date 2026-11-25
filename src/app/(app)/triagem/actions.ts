'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { ActionState } from '@/components/action-form';
import { requireRole } from '@/lib/auth/session';
import { createTaskFromMovement, decideSuggestion, discardMovements, linkMovement } from '@/server/movements';

const refresh = () => { revalidatePath('/alertas'); revalidatePath('/triagem'); revalidatePath('/inicio'); };
const ids = (fd: FormData) => fd.getAll('ids').map(String).filter(Boolean);

export async function linkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireRole('admin', 'lawyer');
  const res = await linkMovement(s.user.id, String(fd.get('movementId')), String(fd.get('caseNumber') ?? ''));
  if (!res.ok) return { error: res.error };
  refresh();
  return { message: 'Vinculado ao processo.' };
}

/** Confirmar prazo (RF-04) e Ajustar: nada vira tarefa sem esse clique. */
export async function decideAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireRole('admin', 'lawyer');
  const decision = String(fd.get('decision'));
  if (!['accepted', 'edited', 'rejected'].includes(decision)) return { error: 'Decisão inválida.' };
  const res = await decideSuggestion(s.user.id, String(fd.get('suggestionId')), decision as 'accepted', String(fd.get('finalDue') ?? '') || null);
  if (!res.ok) return { error: res.error };
  refresh();
  revalidatePath('/tarefas');
  return { message: decision === 'rejected' ? 'Sugestão recusada.' : 'Tarefa criada.' };
}

/** Criar tarefa com prazo direto do andamento, sem depender de sugestão da IA. */
export async function createTaskFromMovementAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireRole('admin', 'lawyer');
  const raw = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));
  const res = await createTaskFromMovement(s.user.id, String(fd.get('movementId')), raw);
  if (!res.ok) return { error: res.error };
  refresh();
  revalidatePath('/tarefas');
  redirect(raw.back === 'alertas' ? `/alertas?criada=${res.dueDate}` : `/tarefas?criada=${res.dueDate}`);
}

export async function discardOneAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireRole('admin', 'lawyer');
  const res = await discardMovements(s.user.id, [String(fd.get('movementId'))], String(fd.get('reason') ?? ''));
  if (!res.ok) return { error: res.error };
  refresh();
  return { message: 'Descartado.' };
}


/** RF-105: ação em lote. */
export async function batchAction(fd: FormData) {
  const s = await requireRole('admin', 'lawyer');
  const op = String(fd.get('op'));
  if (op === 'discard') await discardMovements(s.user.id, ids(fd), String(fd.get('reason') ?? ''));
  refresh();
}
