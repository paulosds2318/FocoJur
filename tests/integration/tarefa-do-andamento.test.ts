import 'dotenv/config';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Criar tarefa com prazo direto de um andamento da Triagem, sem IA. */
const NUM = '9990001-00.2026.8.21.0777';
let adminId = '';
let caseId = '';

async function limpa() {
  const { db } = await import('@/db');
  const { auditLog } = await import('@/db/schema');
  const { cases } = await import('@/db/schema/case');
  const { movement } = await import('@/db/schema/movement');
  const { task } = await import('@/db/schema/task');
  const num = NUM.replace(/\D/g, '');
  const [c] = await db.select({ id: cases.id }).from(cases).where(eq(cases.number, num));
  const ms = await db.select({ id: movement.id }).from(movement).where(like(movement.externalId, 'TESTE-ANDAMENTO%'));
  for (const m of ms) {
    for (const t of await db.select({ id: task.id }).from(task).where(eq(task.movementId, m.id))) {
      await db.delete(auditLog).where(eq(auditLog.entityId, t.id));
      await db.delete(task).where(eq(task.id, t.id));
    }
    await db.delete(auditLog).where(eq(auditLog.entityId, m.id));
    await db.delete(movement).where(eq(movement.id, m.id));
  }
  if (c) await db.delete(cases).where(eq(cases.id, c.id));
}

beforeAll(async () => {
  const { db } = await import('@/db');
  const { user } = await import('@/db/schema');
  const { cases } = await import('@/db/schema/case');
  await limpa();
  adminId = (await db.select().from(user).where(eq(user.role, 'admin')).limit(1))[0].id;
  [{ id: caseId }] = await db.insert(cases).values({ number: NUM.replace(/\D/g, ''), portfolio: 'civil' }).returning({ id: cases.id });
});
afterAll(async () => {
  await limpa();
  const { pool } = await import('@/db');
  await pool.end();
});

async function andamento(id: string, vinculado = true) {
  const { ingestMovement } = await import('@/server/movements');
  const r = await ingestMovement({ source: 'djen', externalId: `TESTE-ANDAMENTO-${id}`, caseNumber: vinculado ? NUM : null, occurredAt: new Date('2026-12-01T12:00:00Z'), title: 'Intimação', rawText: 'Intimação para contestar.' });
  return r.id;
}

describe('criar tarefa a partir do andamento', () => {
  it('com data: cria a tarefa ligada ao processo e ao andamento e tira o andamento da fila', async () => {
    const { createTaskFromMovement } = await import('@/server/movements');
    const { db } = await import('@/db');
    const { movement } = await import('@/db/schema/movement');
    const { task } = await import('@/db/schema/task');
    const id = await andamento('data');
    const r = await createTaskFromMovement(adminId, id, { title: 'Contestação', dueDate: '2026-12-20', typeId: '', ownerId: adminId });
    expect(r).toMatchObject({ ok: true, dueDate: '2026-12-20' });
    const [t] = await db.select().from(task).where(eq(task.movementId, id));
    expect(t).toMatchObject({ title: 'Contestação', caseId, ownerId: adminId, dueDate: '2026-12-20', origin: 'manual' });
    expect((await db.select().from(movement).where(eq(movement.id, id)))[0].triageStatus).toBe('task_created');
  });

  it('com dias úteis: o sistema calcula a data (15 úteis a partir de 01/12 pula fins de semana)', async () => {
    const { createTaskFromMovement } = await import('@/server/movements');
    const id = await andamento('dias');
    const r = await createTaskFromMovement(adminId, id, { title: 'Contestação', days: '15', dayCount: 'business', dueDate: '2030-01-01' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dueDate).not.toBe('2030-01-01'); // os dias valem mais que a data digitada
      expect(r.dueDate >= '2026-12-22').toBe(true); // 15 dias úteis passam de 21 dias corridos
    }
    const corridos = await createTaskFromMovement(adminId, await andamento('corridos'), { title: 'Contestação', days: '15', dayCount: 'calendar' });
    expect(corridos).toMatchObject({ ok: true });
  });

  it('recusa andamento sem processo, título curto, sem prazo e dias inválidos; não duplica', async () => {
    const { createTaskFromMovement } = await import('@/server/movements');
    expect(await createTaskFromMovement(adminId, await andamento('solto', false), { title: 'Contestação', dueDate: '2026-12-20' })).toMatchObject({ ok: false, error: expect.stringContaining('Vincule') });
    const id = await andamento('erros');
    expect(await createTaskFromMovement(adminId, id, { title: 'ab', dueDate: '2026-12-20' })).toMatchObject({ ok: false });
    expect(await createTaskFromMovement(adminId, id, { title: 'Contestação' })).toMatchObject({ ok: false });
    expect(await createTaskFromMovement(adminId, id, { title: 'Contestação', days: '0' })).toMatchObject({ ok: false });
    expect(await createTaskFromMovement(adminId, '00000000-0000-0000-0000-000000000000', { title: 'Contestação', dueDate: '2026-12-20' })).toMatchObject({ ok: false });
  });

  it('vincular não tira o andamento da fila: depois de vincular dá para criar a tarefa', async () => {
    const { createTaskFromMovement, linkMovement } = await import('@/server/movements');
    const { db } = await import('@/db');
    const { movement } = await import('@/db/schema/movement');
    const id = await andamento('vincular', false);
    expect(await linkMovement(adminId, id, NUM)).toEqual({ ok: true });
    const [m] = await db.select().from(movement).where(eq(movement.id, id));
    expect(m).toMatchObject({ caseId, triageStatus: 'pending' });
    expect(await createTaskFromMovement(adminId, id, { title: 'Contestação', dueDate: '2026-12-20' })).toMatchObject({ ok: true });
    expect(await linkMovement(adminId, id, '0000000-00.0000.0.00.0000')).toMatchObject({ ok: false });
  });

  it('a linha do tempo do processo mostra o estado de cada andamento e a tarefa criada', async () => {
    const { createTaskFromMovement, listCaseMovements, markMovementsRead } = await import('@/server/movements');
    const comTarefa = await andamento('tl-tarefa');
    const lido = await andamento('tl-lido');
    await andamento('tl-pendente');
    await createTaskFromMovement(adminId, comTarefa, { title: 'Contestação linha do tempo', dueDate: '2026-12-22' });
    await markMovementsRead(adminId, [lido]);
    const lista = (await listCaseMovements(caseId)).filter((m) => m.rawText === 'Intimação para contestar.');
    const por = (id: string) => lista.find((m) => m.id === id)!;
    expect(por(comTarefa)).toMatchObject({ status: 'task_created', taskTitle: 'Contestação linha do tempo', taskDue: '2026-12-22' });
    expect(por(comTarefa).taskId).toBeTruthy();
    expect(por(lido)).toMatchObject({ status: 'linked', taskId: null });
    expect(lista.some((m) => m.status === 'pending')).toBe(true);
  });
});
