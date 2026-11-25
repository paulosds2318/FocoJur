'use server';

import { revalidatePath } from 'next/cache';
import type { ActionState } from '@/components/action-form';
import { LOOKUP_TYPES, type LookupType } from '@/db/schema/lookups';
import { requireAdmin } from '@/lib/auth/session';
import { addLookup, setLookupInternalDays, updateLookupDescription } from '@/server/lookups';
import { setRiskFormula } from '@/server/risk';

/** Novo item da lista (com descrição opcional). Só admin. */
export async function addLookupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireAdmin();
  const type = String(fd.get('type')) as LookupType;
  if (!LOOKUP_TYPES.includes(type)) return { error: 'Tipo de lista inválido.' };
  const res = await addLookup(s.user.id, type, String(fd.get('label') ?? ''), String(fd.get('description') ?? ''));
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/listas');
  return { message: 'Item adicionado.' };
}

/** Descrição de um item: a IA lê na Triagem para escolher campos e sugerir prazo. Só admin. */
export async function updateDescriptionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireAdmin();
  const res = await updateLookupDescription(s.user.id, String(fd.get('id')), String(fd.get('description') ?? ''));
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/listas');
  revalidatePath('/triagem');
  revalidatePath('/alertas');
  return { message: res.changed ? 'Descrição salva.' : 'Nada mudou.' };
}

/** Fórmula do valor de risco (planilha do Jurídico): percentuais por categoria, honorários, limite de "casos antigos" e teto dos juizados. Só admin. */
export async function saveRiskFormulaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireAdmin();
  const g = (k: string) => String(fd.get(k) ?? '');
  const res = await setRiskFormula(s.user.id, {
    enabled: fd.get('enabled') === 'on',
    pct: { juizado: g('pct_juizado'), vara: g('pct_vara'), antigo: g('pct_antigo') },
    honorariosPct: g('honorariosPct'), oldMonths: g('oldMonths'), minimumWage: g('minimumWage'), fallbackCap: g('fallbackCap'),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/listas');
  return { message: 'Fórmula salva.' };
}

/** Tipo de tarefa: quantos dias úteis antes do prazo limite fica o prazo interno (calculado ao criar a tarefa). Só admin. */
export async function updateInternalDaysAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireAdmin();
  const res = await setLookupInternalDays(s.user.id, String(fd.get('id')), String(fd.get('internalDays') ?? ''));
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/listas');
  return { message: res.changed ? 'Regra salva.' : 'Nada mudou.' };
}
