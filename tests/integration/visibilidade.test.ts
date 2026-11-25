import 'dotenv/config';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Visibilidade compartilhada: o responsável pelo processo/tarefa NÃO restringe o acesso.
 * Qualquer pessoa (admin, advogada, leitura) enxerga os processos e as tarefas de todas; advogada edita os de outra.
 */
const TAG = 'TESTE-VIS';
const NUM = '9990002-00.2026.8.21.0888';
const u: Record<'a' | 'b' | 'leitura', string> = { a: '', b: '', leitura: '' };
let adminId = '';
let caseId = '';
let taskId = '';

async function limpa() {
  const { db } = await import('@/db');
  const { auditLog, user } = await import('@/db/schema');
  const { cases } = await import('@/db/schema/case');
  const { task } = await import('@/db/schema/task');
  for (const t of await db.select({ id: task.id }).from(task).where(like(task.title, `${TAG}%`))) {
    await db.delete(auditLog).where(eq(auditLog.entityId, t.id));
    await db.delete(task).where(eq(task.id, t.id));
  }
  await db.delete(cases).where(eq(cases.number, NUM.replace(/\D/g, '')));
  await db.delete(user).where(like(user.email, `${TAG.toLowerCase()}%`));
}

beforeAll(async () => {
  const { db } = await import('@/db');
  const { user } = await import('@/db/schema');
  const { cases } = await import('@/db/schema/case');
  const { task } = await import('@/db/schema/task');
  await limpa();
  adminId = (await db.select().from(user).where(eq(user.role, 'admin')).limit(1))[0].id;
  for (const [k, role] of [['a', 'lawyer'], ['b', 'lawyer'], ['leitura', 'viewer']] as const) {
    u[k] = crypto.randomUUID();
    await db.insert(user).values({ id: u[k], name: `${TAG} ${k}`, email: `${TAG.toLowerCase()}-${k}@teste.com`, emailVerified: true, role, active: true });
  }
  [{ id: caseId }] = await db.insert(cases).values({ number: NUM.replace(/\D/g, ''), portfolio: 'civil', ownerId: u.a }).returning({ id: cases.id });
  [{ id: taskId }] = await db.insert(task).values({ title: `${TAG} tarefa da A`, caseId, ownerId: u.a, dueDate: '2026-12-10' }).returning({ id: task.id });
  await db.insert((await import('@/db/schema/task')).taskAssignee).values({ taskId, userId: u.a });
});
afterAll(async () => {
  await limpa();
  const { pool } = await import('@/db');
  await pool.end();
});

describe('processos e tarefas são compartilhados', () => {
  it('o processo de uma advogada aparece na busca sem filtro de responsável, para qualquer pessoa', async () => {
    const { searchCases } = await import('@/server/cases');
    const todos = await searchCases({ status: 'all', q: NUM });
    expect(todos.rows.map((r) => r.id)).toContain(caseId);
    // filtro por responsável é opcional e só estreita quando a pessoa escolhe
    expect((await searchCases({ status: 'all', q: NUM, ownerId: u.b })).rows).toHaveLength(0);
    expect((await searchCases({ status: 'all', q: NUM, ownerId: u.a })).rows).toHaveLength(1);
  });

  it('as tarefas de uma advogada aparecem para todas na visão "Todas"; "Minhas" é só um atalho', async () => {
    const { listTasks } = await import('@/server/tasks');
    const ve = async (userId: string, view: 'all' | 'mine') =>
      (await listTasks({ view, userId })).some((t) => t.id === taskId);
    for (const quem of [u.a, u.b, u.leitura, adminId]) expect(await ve(quem, 'all')).toBe(true);
    expect(await ve(u.b, 'mine')).toBe(false); // atalho "Minhas" estreita por escolha
    expect(await ve(u.a, 'mine')).toBe(true);
  });

  it('a advogada B edita e reatribui a tarefa da A (nada é bloqueado pelo responsável)', async () => {
    const { updateTask, assignTask } = await import('@/server/task-edit');
    const r = await updateTask(u.b, taskId, { title: `${TAG} tarefa da A (ajustada pela B)`, typeId: '', dueDate: '2026-12-11', dueTime: '', ownerId: u.a, reviewerId: '' });
    expect(r).toMatchObject({ ok: true, changed: true });
    expect(await assignTask(u.b, taskId, u.b)).toMatchObject({ ok: true });
  });

  it('prazos de hoje e atrasados do Início mostram tarefas de todas, não só da advogada do dia', async () => {
    const { dueTodayAndLate } = await import('@/server/tasks');
    const rows = await dueTodayAndLate('2026-12-31'); // 11/12 já está atrasado nessa data
    expect(rows.some((t) => t.id === taskId)).toBe(true);
  });
});
