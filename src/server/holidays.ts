import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { COMMON_COURT_HOLIDAYS } from '@/db/seed/holidays-data';
import { holiday } from '@/db/schema/task';
import { audit } from '@/lib/audit';

export type CommonHolidaysInput = { keys: string[]; scope: 'state' | 'court'; state: string; court: string; from: number; to: number };

/**
 * Cadastra de uma vez os feriados forenses comuns (Dia do Advogado, Dia da Justiça) para uma UF ou para um tribunal/vara, em um intervalo
 * de anos. Não duplica o que já existe. Só admin (a action confere).
 */
export async function addCommonHolidays(actorId: string, i: CommonHolidaysInput) {
  const picked = COMMON_COURT_HOLIDAYS.filter((h) => i.keys.includes(h.key));
  const state = i.state.trim().toUpperCase() || null;
  const court = i.court.trim() || null;
  if (!picked.length) return { ok: false as const, error: 'Marque ao menos um feriado.' };
  if (i.scope === 'state' && !state) return { ok: false as const, error: 'Informe a UF.' };
  if (i.scope === 'court' && !court) return { ok: false as const, error: 'Informe o nome do tribunal ou vara (parte do nome, como no processo).' };
  if (!Number.isInteger(i.from) || !Number.isInteger(i.to) || i.from < 2020 || i.to > 2100 || i.to < i.from || i.to - i.from > 4) {
    return { ok: false as const, error: 'Informe os anos (de 2020 a 2100, no máximo 5 anos de uma vez).' };
  }
  let created = 0;
  for (let y = i.from; y <= i.to; y++) {
    for (const h of picked) {
      const date = `${y}-${h.md}`;
      const where = i.scope === 'state'
        ? and(eq(holiday.date, date), eq(holiday.scope, 'state'), eq(holiday.state, state!))
        : and(eq(holiday.date, date), eq(holiday.scope, 'court'), eq(holiday.court, court!));
      const [dup] = await db.select({ id: holiday.id }).from(holiday).where(where).limit(1);
      if (dup) continue;
      const [row] = await db.insert(holiday).values({ scope: i.scope, date, description: h.label, state: i.scope === 'state' ? state : null, court: i.scope === 'court' ? court : null }).returning({ id: holiday.id });
      await audit({ actorId, entity: 'holiday', entityId: row.id, action: 'create', diff: { after: { scope: i.scope, date, state, court, description: h.label } } });
      created++;
    }
  }
  return { ok: true as const, created };
}
