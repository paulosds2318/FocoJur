'use server';

import { revalidatePath } from 'next/cache';
import type { ActionState } from '@/components/action-form';
import { requireAdmin, requireRole } from '@/lib/auth/session';
import { addEntry, deleteEntry } from '@/server/financial';

export async function addEntryAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireRole('admin', 'lawyer');
  const id = String(formData.get('id'));
  const raw = Object.fromEntries([...formData.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));
  const res = await addEntry(session.user.id, id, raw);
  if (!res.ok) return { error: res.error };
  revalidatePath(`/processos/${id}`);
  return { message: 'Lançamento registrado.' };
}

export async function deleteEntryAction(formData: FormData) {
  const session = await requireAdmin();
  await deleteEntry(session.user.id, String(formData.get('entryId')));
  revalidatePath(`/processos/${String(formData.get('id'))}`);
}
