import 'dotenv/config';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** 27/11/2026: alerta de processo que já tem tarefa aberta pode atualizar essa tarefa em vez de criar outra. */
const NUM = '99860000000000000002';
let caseId = '';
let adminId = '';

async function limpa() {
  const { db } = await import('@/db');
  const { cases } = await import('@/db/schema/case');
  const { movement } = await import('@/db/schema/movement');
  const { task } = await import('@/db/schema/task');
  const [c] = await db.select({ id: cases.id }).from(cases).where(eq(cases.number, NUM));
  if (c) await db.delete(task).where(eq(task.caseId, c.id));
  await db.delete(movement).where(like(movement.externalId, 'TESTE-ATUTAREFA%'));
  await db.delete(cases).where(eq(cases.number, NUM));
}
beforeAll(async () => {
  await limpa();
  const { db } = await import('@/db');
  const { user } = await import('@/db/schema');
  const { cases } = await import('@/db/schema/case');
  [{ id: adminId }] = await db.select({ id: user.id }).from(user).where(eq(user.role, 'admin')).limit(1);
  [{ id: caseId }] = await db.insert(cases).values({ number: NUM, portfolio: 'civil', monitoring: true }).returning({ id: cases.id });
});
afterAll(async () => { await limpa(); const { pool } = await import('@/db'); await pool.end(); });

async function alerta(id: string, texto: string) {
  const { ingestMovement } = await import('@/server/movements');
  return (await ingestMovement({ source: 'djen', externalId: `TESTE-ATUTAREFA-${id}`, caseNumber: NUM, occurredAt: new Date('2026-12-01T12:00:00Z'), rawText: texto })).id;
}

describe('atualizar tarefa existente a partir do alerta', () => {
  it('muda os prazos da tarefa aberta, trata o alerta e não cria outra tarefa', async () => {
    const { db } = await import('@/db');
    const { task } = await import('@/db/schema/task');
    const { movement } = await import('@/db/schema/movement');
    const { applyMovementToTask, openTasksForAlert } = await import('@/server/movements');
    const [t] = await db.insert(task).values({ title: 'Contestação', caseId, dueDate: '2026-12-10', internalDueDate: '2026-12-08' }).returning({ id: task.id });
    expect(await openTasksForAlert(caseId)).toHaveLength(1);

    const m = await alerta('1', 'Nova intimação com novo prazo');
    const r = await applyMovementToTask(adminId, m, t.id, { dueDate: '2026-12-06', internalDueDate: '' });
    expect(r).toMatchObject({ ok: true, changed: true });
    const [after] = await db.select().from(task).where(eq(task.id, t.id));
    expect(after.dueDate).toBe('2026-12-06');
    expect(after.internalDueDate).toBe('2026-12-06'); // o interno não pode passar do limite novo
    const [mv] = await db.select().from(movement).where(eq(movement.id, m));
    expect(mv).toMatchObject({ triageStatus: 'task_created', updatedTaskId: t.id });
    expect(await db.select().from(task).where(eq(task.caseId, caseId))).toHaveLength(1);
    expect(await applyMovementToTask(adminId, m, t.id, {})).toMatchObject({ ok: false }); // já tratado
  });

  it('em branco só trata o alerta; tarefa de outro processo ou concluída é recusada', async () => {
    const { db } = await import('@/db');
    const { task } = await import('@/db/schema/task');
    const { applyMovementToTask } = await import('@/server/movements');
    const [t] = await db.insert(task).values({ title: 'Outra', caseId, dueDate: '2026-12-20' }).returning({ id: task.id });
    const m = await alerta('2', 'Outra publicação');
    expect(await applyMovementToTask(adminId, m, t.id, {})).toMatchObject({ ok: true, changed: false });
    const [semMudar] = await db.select().from(task).where(eq(task.id, t.id));
    expect(semMudar.dueDate).toBe('2026-12-20');

    const [feita] = await db.insert(task).values({ title: 'Feita', caseId, status: 'done' }).returning({ id: task.id });
    const m2 = await alerta('3', 'Mais uma publicação');
    expect(await applyMovementToTask(adminId, m2, feita.id, {})).toMatchObject({ ok: false });
    expect(await applyMovementToTask(adminId, m2, '00000000-0000-0000-0000-000000000000', {})).toMatchObject({ ok: false });
  });
});
