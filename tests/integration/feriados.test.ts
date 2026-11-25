import 'dotenv/config';
import { like } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

/** Feriados locais só entram no prazo dos processos daquela UF, cidade ou vara. */
const TAG = 'TESTE-FERIADO';

describe('calendário local', () => {
  afterAll(async () => {
    const { db, pool } = await import('@/db');
    const { holiday } = await import('@/db/schema/task');
    await db.delete(holiday).where(like(holiday.description, `${TAG}%`));
    await pool.end();
  });

  it('aplica estadual, municipal e de tribunal só a quem pertence', async () => {
    const { db } = await import('@/db');
    const { holiday } = await import('@/db/schema/task');
    const { getHolidaySet, statesWithLocalCalendar } = await import('@/server/tasks');
    const { computeDueDate } = await import('@/server/movements');
    await db.insert(holiday).values([
      { date: '2030-03-04', scope: 'state', state: 'ZZ', description: `${TAG} estadual` },
      { date: '2030-03-05', scope: 'city', state: 'ZZ', city: 'Cidade Teste', description: `${TAG} municipal` },
      { date: '2030-03-06', scope: 'court', court: '3º Juizado Teste', description: `${TAG} tribunal`, state: 'ZZ' },
    ]);

    const nacional = await getHolidaySet();
    expect(nacional.has('2030-03-04')).toBe(false);

    const zz = await getHolidaySet({ state: 'zz', city: 'cidade teste', court: '3º Juizado Teste de Porto' });
    expect(['2030-03-04', '2030-03-05', '2030-03-06'].every((d) => zz.has(d))).toBe(true);

    const outro = await getHolidaySet({ state: 'YY', city: 'Cidade Teste', court: '1ª Vara' });
    expect(outro.has('2030-03-04') || outro.has('2030-03-05') || outro.has('2030-03-06')).toBe(false);

    // 01/03/2030 é sexta-feira; 3 dias úteis: com o calendário local pula 04, 05 e 06 → 11/03 (segunda... conta 07, 08, 11)
    expect(await computeDueDate('2030-03-01', 3, 'business', { state: 'YY' })).toBe('2030-03-06');
    expect(await computeDueDate('2030-03-01', 3, 'business', { state: 'ZZ', city: 'Cidade Teste', court: '3º Juizado Teste' })).toBe('2030-03-11');

    expect((await statesWithLocalCalendar()).has('ZZ')).toBe(true);
  });
});
