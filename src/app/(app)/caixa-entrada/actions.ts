'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ActionState } from '@/components/action-form';
import { requireRole } from '@/lib/auth/session';
import { decideSuggestions, suggestForItem } from '@/server/inbox-ai';
import { createTask } from '@/server/tasks';
import { addInboxItem, confirmInboxItem, discardInboxItem, importProjurisFile, markInboxDuplicate } from '@/server/inbox';

const str = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));

/** RF-19a: botão "Importar do Projuris" aceita Excel/CSV. */
export async function importAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const s = await requireRole('admin', 'lawyer');
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Escolha o arquivo exportado do Projuris.' };
  if (file.size > 10 * 1024 * 1024) return { error: 'Arquivo acima de 10 MB.' };
  const res = await importProjurisFile(s.user.id, file.name, Buffer.from(await file.arrayBuffer()));
  if (!res.ok) return { error: res.error };
  revalidatePath('/caixa-entrada');
  revalidatePath('/triagem');
  return { message: `${res.total} linhas lidas: ${res.novo} novas, ${res.duplicado} duplicadas, ${res.erro} com erro.` };
}

/** RF-19b: a advogada informa só o número. */
export async function manualNumberAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const s = await requireRole('admin', 'lawyer');
  const res = await addInboxItem({ source: 'manual', caseNumber: String(formData.get('number') ?? '') });
  if (!res.ok) return { error: res.error };
  void s;
  revalidatePath('/caixa-entrada');
  revalidatePath('/triagem');
  return { message: res.duplicate ? 'Número já existe (marcado como possível duplicado).' : 'Item criado na caixa de entrada.' };
}

export async function confirmAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const s = await requireRole('admin', 'lawyer');
  const id = String(formData.get('itemId'));
  const res = await confirmInboxItem(s.user.id, id, str(formData));
  if (!res.ok) return { error: res.error };
  revalidatePath('/caixa-entrada');
  revalidatePath('/triagem');
  const f = str(formData);
  if (f.taskTitle?.trim() || f.taskDue?.trim()) {
    // o processo já foi criado; se a tarefa falhar, a classificação não se perde (a tarefa se cria na ficha)
    await createTask(s.user.id, { title: f.taskTitle ?? '', caseId: res.caseId, typeId: '', dueDate: f.taskDue ?? '', dueTime: '', ownerId: f.taskOwnerId ?? '', reviewerId: '' });
    revalidatePath('/tarefas');
    redirect(`/processos/${res.caseId}?tab=tarefas`);
  }
  redirect(`/processos/${res.caseId}`);
}

export async function duplicateAction(formData: FormData) {
  const s = await requireRole('admin', 'lawyer');
  await markInboxDuplicate(s.user.id, String(formData.get('itemId')));
  revalidatePath('/caixa-entrada');
  revalidatePath('/triagem');
  redirect('/triagem');
}

export async function discardAction(formData: FormData) {
  const s = await requireRole('admin', 'lawyer');
  await discardInboxItem(s.user.id, String(formData.get('itemId')));
  revalidatePath('/caixa-entrada');
  revalidatePath('/triagem');
  redirect('/triagem');
}

/** RF-13: pede à IA as sugestões de objeto, pedido, prognóstico e contrato. Nada é aplicado sem o aceite. */
export async function suggestAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const s = await requireRole('admin', 'lawyer');
  const res = await suggestForItem(s.user.id, String(formData.get('itemId')));
  if (!res.ok) return { error: res.error };
  revalidatePath('/caixa-entrada');
  revalidatePath('/triagem');
  return { message: 'Sugestões prontas.' };
}

export async function decideSuggestionsAction(formData: FormData) {
  const s = await requireRole('admin', 'lawyer');
  const itemId = String(formData.get('itemId'));
  await decideSuggestions(s.user.id, itemId, formData.get('accept') === 'true');
  revalidatePath('/caixa-entrada');
  revalidatePath('/triagem');
}
