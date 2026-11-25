import 'dotenv/config';
import { and, eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Dia do Advogado e Dia da Justiça: cadastrados por UF ou tribunal (não são nacionais) e usados na contagem dos prazos daquele local. */
const COURT = 'TesteFeriadoComum';
const UF = 'ZY';
let adminId: string;

async function limpa() {
  const { db } = await import('@/db');
  const { holiday } = await import('@/db/schema/task');
  await db.delete(holiday).where(eq(holiday.court, COURT));
  await db.delete(holiday).where(and(eq(holiday.state, UF), like(holiday.description, 'Dia %')));
}

beforeAll(async () => {
  const { db } = await import('@/db');
  const { user } = await import('@/db/schema');
  await limpa();
  const [a] = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);
  adminId = a.id;
});
afterAll(limpa);

describe('feriados forenses comuns', () => {
  it('cadastra Dia do Advogado (11/08) e Dia da Justiça (08/12) por tribunal, em um intervalo de anos, sem duplicar', async () => {
    const { addCommonHolidays } = await import('@/server/holidays');
    const { db } = await import('@/db');
    const { holiday } = await import('@/db/schema/task');
    const base = { keys: ['dia_do_advogado', 'dia_da_justica'], scope: 'court' as const, state: '', court: COURT, from: 2031, to: 2032 };
    expect(await addCommonHolidays(adminId, base)).toEqual({ ok: true, created: 4 });
    const rows = await db.select().from(holiday).where(eq(holiday.court, COURT));
    expect(rows.map((r) => r.date).sort()).toEqual(['2031-08-11', '2031-12-08', '2032-08-11', '2032-12-08']);
    expect(rows.every((r) => r.scope === 'court' && r.state === null)).toBe(true);
    expect(await addCommonHolidays(adminId, base)).toEqual({ ok: true, created: 0 }); // repetir não duplica
    expect(await addCommonHolidays(adminId, { ...base, keys: ['dia_da_justica'], from: 2033, to: 2033 })).toEqual({ ok: true, created: 1 });
  });

  it('vale só para o tribunal informado: o prazo daquela vara pula o dia, o das outras não', async () => {
    const { getHolidaySet } = await import('@/server/tasks');
    const { addBusinessDays } = await import('@/lib/deadlines');
    const meu = await getHolidaySet({ court: `1ª ${COURT} de Algum Lugar` });
    const outro = await getHolidaySet({ court: '2ª Vara Qualquer' });
    expect(meu.has('2031-08-11')).toBe(true);
    expect(outro.has('2031-08-11')).toBe(false);
    // 11/08/2031 é segunda-feira: de sexta (08/08), 1 dia útil cai na terça (12/08) para o tribunal e na segunda (11/08) para o resto
    expect(addBusinessDays('2031-08-08', 1, meu)).toBe('2031-08-12');
    expect(addBusinessDays('2031-08-08', 1, outro)).toBe('2031-08-11');
  });

  it('por UF vale para todos os processos daquele estado', async () => {
    const { addCommonHolidays } = await import('@/server/holidays');
    const { getHolidaySet } = await import('@/server/tasks');
    expect((await addCommonHolidays(adminId, { keys: ['dia_do_advogado'], scope: 'state', state: UF.toLowerCase(), court: '', from: 2031, to: 2031 }))).toEqual({ ok: true, created: 1 });
    expect((await getHolidaySet({ state: UF })).has('2031-08-11')).toBe(true);
    expect((await getHolidaySet({ state: 'XX' })).has('2031-08-11')).toBe(false);
  });

  it('valida os campos', async () => {
    const { addCommonHolidays } = await import('@/server/holidays');
    const ok = { keys: ['dia_do_advogado'], scope: 'court' as const, state: '', court: COURT, from: 2031, to: 2031 };
    expect(await addCommonHolidays(adminId, { ...ok, keys: [] })).toMatchObject({ ok: false });
    expect(await addCommonHolidays(adminId, { ...ok, court: ' ' })).toMatchObject({ ok: false });
    expect(await addCommonHolidays(adminId, { ...ok, scope: 'state', state: '' })).toMatchObject({ ok: false });
    expect(await addCommonHolidays(adminId, { ...ok, from: 2031, to: 2040 })).toMatchObject({ ok: false });
    expect(await addCommonHolidays(adminId, { ...ok, from: 2032, to: 2031 })).toMatchObject({ ok: false });
  });
});
