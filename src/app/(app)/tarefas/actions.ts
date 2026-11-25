'use server';

import { revalidatePath } from 'next/cache';
import type { ActionState } from '@/components/action-form';
import type { TaskStatus } from '@/db/schema/task';
import { requireRole } from '@/lib/auth/session';
import { cancelTask, createTask, moveTask, moveToBucket, TASK_STATUSES } from '@/server/tasks';
import { setAssignees, updateTask } from '@/server/task-edit';

export async function createTaskAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireRole('admin', 'lawyer');
  const raw = Object.fromEntries([...formData.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));
  const res = await createTask(session.user.id, raw);
  if (!res.ok) return { error: res.error };
  revalidatePath('/tarefas');
  revalidatePath('/inicio');
  if (raw.caseId) revalidatePath(`/processos/${raw.caseId}`);
  return { message: 'Tarefa criada.' };
}

export async function moveTaskAction(taskId: string, to: string): Promise<{ ok: boolean; error?: string; status?: string }> {
  const session = await requireRole('admin', 'lawyer');
  if (!TASK_STATUSES.includes(to as TaskStatus)) return { ok: false, error: 'Status inválido.' };
  const res = await moveTask(session.user.id, session.user.role ?? 'lawyer', taskId, to as TaskStatus);
  revalidatePath('/tarefas');
  revalidatePath('/inicio');
  return res.ok ? { ok: true, status: res.status } : { ok: false, error: res.error };
}

export async function cancelTaskAction(formData: FormData) {
  const session = await requireRole('admin', 'lawyer');
  await cancelTask(session.user.id, String(formData.get('taskId')));
  revalidatePath('/tarefas');
  revalidatePath('/inicio');
}

/** Edição completa da tarefa (título, tipo, prazo, responsável, revisor). */
export async function updateTaskAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireRole('admin', 'lawyer');
  const id = String(formData.get('id'));
  const raw = Object.fromEntries([...formData.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));
  const res = await updateTask(session.user.id, id, raw);
  if (!res.ok) return { error: res.error };
  revalidatePath('/tarefas');
  revalidatePath(`/tarefas/${id}`);
  revalidatePath('/inicio');
  if (raw.caseId) revalidatePath(`/processos/${raw.caseId}`);
  return { message: res.changed ? 'Tarefa atualizada.' : 'Nada mudou.' };
}

/** Responsáveis direto no card do quadro (uma ou várias pessoas; vazio = sem responsável). */
export async function setAssigneesAction(taskId: string, userIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const session = await requireRole('admin', 'lawyer');
  const res = await setAssignees(session.user.id, taskId, userIds);
  revalidatePath('/tarefas');
  revalidatePath('/inicio');
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/** Arrastar o card para outra coluna do quadro (vazio = Sem bucket). */
export async function moveToBucketAction(taskId: string, bucketId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireRole('admin', 'lawyer');
  const res = await moveToBucket(session.user.id, taskId, bucketId || null);
  revalidatePath('/tarefas');
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/** "Adicionar tarefa" no topo da coluna: cria uma tarefa geral só com o título, já na coluna (o restante se completa na edição). */
export async function quickAddTaskAction(bucketId: string, title: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireRole('admin', 'lawyer');
  const res = await createTask(session.user.id, { title, caseId: '', typeId: '', bucketId, dueDate: '', internalDueDate: '', dueTime: '', ownerId: '', assigneeIds: '', reviewerId: '', movementId: '' });
  revalidatePath('/tarefas');
  revalidatePath('/inicio');
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
