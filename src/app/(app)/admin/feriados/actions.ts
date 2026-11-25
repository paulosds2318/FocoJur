'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import type { ActionState } from '@/components/action-form';
import { db } from '@/db';
import { holiday } from '@/db/schema/task';
import { audit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/session';
import { addCommonHolidays } from '@/server/holidays';

/** Calendário forense local: feriado estadual, municipal ou do tribunal (a regra 2 do PRD manda excluí-los da contagem). */
export async function addHolidayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireAdmin();
  const scope = String(fd.get('scope'));
  const date = String(fd.get('date') ?? '');
  const description = String(fd.get('description') ?? '').trim();
  const state = String(fd.get('state') ?? '').trim().toUpperCase() || null;
  const city = String(fd.get('city') ?? '').trim() || null;
  const court = String(fd.get('court') ?? '').trim() || null;
  if (!['national', 'state', 'city', 'court'].includes(scope)) return { error: 'Escolha o tipo de feriado.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Informe a data.' };
  if (!description) return { error: 'Informe a descrição.' };
  if (scope === 'state' && !state) return { error: 'Feriado estadual precisa da UF.' };
  if (scope === 'city' && (!city || !state)) return { error: 'Feriado municipal precisa da cidade e da UF.' };
  if (scope === 'court' && !court) return { error: 'Feriado do tribunal precisa do nome da vara/órgão (como aparece no processo).' };
  const [row] = await db.insert(holiday).values({ scope: scope as 'state', date, description, state, city, court }).returning({ id: holiday.id });
  await audit({ actorId: s.user.id, entity: 'holiday', entityId: row.id, action: 'create', diff: { after: { scope, date, state, city, court, description } } });
  revalidatePath('/admin/feriados');
  return { message: 'Feriado cadastrado. Vale para os próximos cálculos de prazo.' };
}

export async function deleteHolidayAction(fd: FormData) {
  const s = await requireAdmin();
  const id = String(fd.get('id'));
  const [row] = await db.delete(holiday).where(eq(holiday.id, id)).returning();
  if (row) await audit({ actorId: s.user.id, entity: 'holiday', entityId: id, action: 'delete', diff: { before: { scope: row.scope, date: row.date, description: row.description } } });
  revalidatePath('/admin/feriados');
}

/** Cadastra de uma vez os feriados forenses comuns (Dia do Advogado, Dia da Justiça) para uma UF ou tribunal/vara. */
export async function addCommonHolidaysAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireAdmin();
  const res = await addCommonHolidays(s.user.id, {
    keys: fd.getAll('item').map(String), scope: String(fd.get('scope')) === 'state' ? 'state' : 'court',
    state: String(fd.get('state') ?? ''), court: String(fd.get('court') ?? ''), from: Number(fd.get('from')), to: Number(fd.get('to')),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/feriados');
  return { message: res.created ? `${res.created} feriado(s) cadastrado(s). Valem para os próximos cálculos de prazo.` : 'Esses feriados já estavam cadastrados.' };
}
