import 'dotenv/config';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Alerta só nasce para processo com o monitoramento ligado. */
const TAG = 'TESTE-MON';
const ON = '99866000000000000001';
const OFF = '99866000000000000002';

async function limpa() {
  const { db } = await import('@/db');
  const { cases } = await import('@/db/schema/case');
  const { movement } = await import('@/db/schema/movement');
  await db.delete(movement).where(like(movement.externalId, `${TAG}%`));
  await db.delete(cases).where(like(cases.number, '99866%'));
}

beforeAll(async () => {
  const { db } = await import('@/db');
  const { cases } = await import('@/db/schema/case');
  await limpa();
  await db.insert(cases).values([
    { number: ON, portfolio: 'civil', monitoring: true },
    { number: OFF, portfolio: 'civil', monitoring: false },
  ]);
});
afterAll(limpa);

describe('alerta x monitoramento', () => {
  it('monitoramento ligado: a publicação vira alerta pendente', async () => {
    const { ingestMovement } = await import('@/server/movements');
    const { db } = await import('@/db');
    const { movement } = await import('@/db/schema/movement');
    const r = await ingestMovement({ source: 'djen', externalId: `${TAG}-on`, caseNumber: ON, occurredAt: new Date(), rawText: `${TAG} on` });
    expect(r).toMatchObject({ created: true, linked: true });
    const [m] = await db.select().from(movement).where(eq(movement.externalId, `${TAG}-on`));
    expect(m.triageStatus).toBe('pending');
  });

  it('monitoramento desligado: não cria alerta, mas conta como tratado (não vira processo novo na Triagem)', async () => {
    const { ingestMovement } = await import('@/server/movements');
    const { db } = await import('@/db');
    const { movement } = await import('@/db/schema/movement');
    const r = await ingestMovement({ source: 'djen', externalId: `${TAG}-off`, caseNumber: OFF, occurredAt: new Date(), rawText: `${TAG} off` });
    expect(r).toMatchObject({ created: false, linked: true, skipped: 'monitoring_off' });
    expect(await db.select().from(movement).where(eq(movement.externalId, `${TAG}-off`))).toHaveLength(0);
  });

  it('ligar o monitoramento de novo volta a gerar alerta', async () => {
    const { ingestMovement } = await import('@/server/movements');
    const { db } = await import('@/db');
    const { cases } = await import('@/db/schema/case');
    await db.update(cases).set({ monitoring: true }).where(eq(cases.number, OFF));
    const r = await ingestMovement({ source: 'djen', externalId: `${TAG}-off`, caseNumber: OFF, occurredAt: new Date(), rawText: `${TAG} off` });
    expect(r).toMatchObject({ created: true, linked: true });
  });
});
