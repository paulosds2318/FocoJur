import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

/** Intervalo da consulta automática (1, 6, 12 ou 24 h) escolhido pelo admin; restaura o valor original no fim. */
let original: string | undefined;

afterAll(async () => {
  const { db, pool } = await import('@/db');
  const { appSetting } = await import('@/db/schema/inbox');
  const { DJEN_INTERVAL_KEY } = await import('@/server/settings');
  if (original === undefined) await db.delete(appSetting).where(eq(appSetting.key, DJEN_INTERVAL_KEY));
  else await db.update(appSetting).set({ value: original }).where(eq(appSetting.key, DJEN_INTERVAL_KEY));
  await pool.end();
});

describe('intervalo da consulta automática', () => {
  it('padrão é 1 h; aceita só 1, 6, 12 e 24; grava auditoria', async () => {
    const { db } = await import('@/db');
    const { appSetting } = await import('@/db/schema/inbox');
    const { auditLog, user } = await import('@/db/schema');
    const { DJEN_INTERVAL_KEY, getDjenIntervalHours, setDjenIntervalHours } = await import('@/server/settings');
    original = (await db.select().from(appSetting).where(eq(appSetting.key, DJEN_INTERVAL_KEY)))[0]?.value;
    const [admin] = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);

    for (const h of [1, 6, 12, 24]) {
      expect(await setDjenIntervalHours(admin.id, h)).toEqual({ ok: true });
      expect(await getDjenIntervalHours()).toBe(h);
    }
    for (const ruim of [0, 2, 48, 720, -1, NaN]) {
      expect(await setDjenIntervalHours(admin.id, ruim)).toMatchObject({ ok: false }); // nada de 7/30/90 dias
    }
    expect(await getDjenIntervalHours()).toBe(24); // o último válido continua valendo

    await db.delete(appSetting).where(eq(appSetting.key, DJEN_INTERVAL_KEY));
    expect(await getDjenIntervalHours()).toBe(1); // sem configuração: a cada 1 hora
    const log = await db.select().from(auditLog).where(eq(auditLog.entityId, DJEN_INTERVAL_KEY));
    expect(log.length).toBeGreaterThanOrEqual(4);
  });
});
