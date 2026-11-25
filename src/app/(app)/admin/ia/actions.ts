'use server';

import { revalidatePath } from 'next/cache';
import type { ActionState } from '@/components/action-form';
import { AI_TASKS, type AiTask } from '@/db/schema/ai';
import { requireAdmin } from '@/lib/auth/session';
import { compareModels, type ModelScore } from '@/server/ai-compare';
import { saveTaskConfig, setBudget, setManualFx, syncModelCatalog } from '@/server/ai-admin';

export async function syncModelsAction(_: ActionState): Promise<ActionState> {
  await requireAdmin();
  try {
    const n = await syncModelCatalog();
    revalidatePath('/admin/ia');
    return { message: `${n} modelos sincronizados.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Falha ao sincronizar.' };
  }
}

export async function saveTaskAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const s = await requireAdmin();
  const task = String(formData.get('task')) as AiTask;
  if (!AI_TASKS.includes(task)) return { error: 'Tarefa inválida.' };
  const res = await saveTaskConfig(s.user.id, task, String(formData.get('primary') ?? ''), String(formData.get('fallback') ?? ''));
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/ia');
  return { message: 'Salvo.' };
}

export async function budgetAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const s = await requireAdmin();
  const n = Number(String(formData.get('limit') ?? '').replace(/\./g, '').replace(',', '.'));
  const res = await setBudget(s.user.id, n);
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/ia/custos');
  return { message: 'Limite salvo.' };
}

export async function fxAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const s = await requireAdmin();
  const raw = String(formData.get('rate') ?? '').trim();
  const res = await setManualFx(s.user.id, raw === '' ? 0 : Number(raw.replace(',', '.')));
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/ia/custos');
  return { message: raw === '' ? 'Cotação manual removida: volta a valer a PTAX.' : 'Cotação salva.' };
}

export type CompareState = { error?: string; result?: { samples: number; a: ModelScore; b: ModelScore } } | undefined;

/** RF-84: compara dois modelos numa amostra de 20 ou 50 casos já revisados; só mede, não altera dados. */
export async function compareAction(_: CompareState, fd: FormData): Promise<CompareState> {
  await requireAdmin();
  const size = String(fd.get('size')) === '50' ? 50 : 20;
  const res = await compareModels(String(fd.get('a') ?? '').trim(), String(fd.get('b') ?? '').trim(), size);
  return res.ok ? { result: { samples: res.samples, a: res.a, b: res.b } } : { error: res.error };
}
