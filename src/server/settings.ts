import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { appSetting } from '@/db/schema/inbox';
import { audit } from '@/lib/audit';
import { parseInterval } from '@/lib/connectors/schedule';
import { isAllowedHours, type Hours } from '@/lib/connectors/window';

export const DJEN_INTERVAL_KEY = 'djen_interval_hours';

/** De quantas em quantas horas a consulta automática do DJEN roda (1, 6, 12 ou 24; padrão 24 = uma vez por dia). */
export async function getDjenIntervalHours(): Promise<Hours> {
  const [row] = await db.select().from(appSetting).where(eq(appSetting.key, DJEN_INTERVAL_KEY));
  return parseInterval(row?.value);
}

/** O worker confere a configuração a cada minuto e reagenda sozinho, sem reiniciar. */
export async function setDjenIntervalHours(actorId: string, hours: number) {
  if (!isAllowedHours(hours)) return { ok: false as const, error: 'Escolha 1, 6, 12 ou 24 horas.' };
  const before = await getDjenIntervalHours();
  await db
    .insert(appSetting)
    .values({ key: DJEN_INTERVAL_KEY, value: String(hours), updatedBy: actorId })
    .onConflictDoUpdate({ target: appSetting.key, set: { value: String(hours), updatedBy: actorId, updatedAt: new Date() } });
  await audit({ actorId, entity: 'app_setting', entityId: DJEN_INTERVAL_KEY, action: 'update', diff: { before: { hours: before }, after: { hours } } });
  return { ok: true as const };
}
