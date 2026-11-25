import 'dotenv/config';
import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Edição de tarefa: responsável, revisor, prazo, título; regras e auditoria. Usa usuários temporários e remove tudo no fim. */
const TAG = 'TESTE-EDIT';
const ids: Record<'adv1' | 'adv2' | 'leitura' | 'inativa', string> = { adv1: '', adv2: '', leitura: '', inativa: '' };
let adminId: string;
const taskIds: string[] = [];

async function limpa() {
  const { db } = await import('@/db');
  const { auditLog, user } = await import('@/db/schema');
  const { task } = await import('@/db/schema/task');
  const t = await db.select({ id: task.id }).from(task).where(like(task.title, `${TAG}%`));
  if (t.length) {
    await db.delete(auditLog).where(inArray(auditLog.entityId, t.map((x) => x.id)));
    await db.delete(task).where(inArray(task.id, t.map((x) => x.id)));
  }
  await db.delete(user).where(like(user.email, `${TAG.toLowerCase()}%`));
}

beforeAll(async () => {
  const { db } = await import('@/db');
  const { user } = await import('@/db/schema');
  await limpa();
  const [a] = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);
  adminId = a.id;
  const mk = async (key: keyof typeof ids, role: string, active: boolean) => {
    const id = crypto.randomUUID();
    await db.insert(user).values({ id, name: `${TAG} ${key}`, email: `${TAG.toLowerCase()}-${key}@teste.com`, emailVerified: true, role, active });
    ids[key] = id;
  };
  await mk('adv1', 'lawyer', true);
  await mk('adv2', 'lawyer', true);
  await mk('leitura', 'viewer', true);
  await mk('inativa', 'lawyer', false);
});
afterAll(async () => {
  await limpa();
  const { pool } = await import('@/db');
  await pool.end();
});

async function novaTarefa(extra: Record<string, string> = {}) {
  const { createTask } = await import('@/server/tasks');
  const r = await createTask(adminId, { title: `${TAG} tarefa ${Math.random()}`, caseId: '', typeId: '', dueDate: '2026-12-10', dueTime: '', ownerId: '', reviewerId: '', ...extra });
  if (!r.ok) throw new Error(r.error);
  taskIds.push(r.id);
  return r.id;
}

describe('troca rápida de responsável', () => {
  it('atribui, deixa sem responsável, grava auditoria e recusa responsável inválido', async () => {
    const { assignTask } = await import('@/server/task-edit');
    const { db } = await import('@/db');
    const { task } = await import('@/db/schema/task');
    const { auditLog } = await import('@/db/schema');
    const id = await novaTarefa();

    expect(await assignTask(adminId, id, ids.adv1)).toEqual({ ok: true, changed: true });
    expect((await db.select().from(task).where(eq(task.id, id)))[0].ownerId).toBe(ids.adv1);
    expect(await assignTask(adminId, id, ids.adv1)).toEqual({ ok: true, changed: false }); // igual: nada a fazer

    expect(await assignTask(adminId, id, ids.leitura)).toMatchObject({ ok: false }); // perfil de leitura não recebe tarefa
    expect(await assignTask(adminId, id, ids.inativa)).toMatchObject({ ok: false }); // usuário desativado também não
    expect(await assignTask(adminId, id, '00000000-0000-0000-0000-000000000000')).toMatchObject({ ok: false });

    expect(await assignTask(adminId, id, null)).toEqual({ ok: true, changed: true }); // fica sem responsável
    expect((await db.select().from(task).where(eq(task.id, id)))[0].ownerId).toBeNull();

    const log = (await db.select().from(auditLog).where(eq(auditLog.entityId, id))).filter((l) => l.action === 'update');
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(log[0].diff)).toContain('assigneeIds');
  });

  it('o responsável não pode ser o próprio revisor', async () => {
    const { assignTask } = await import('@/server/task-edit');
    const id = await novaTarefa({ reviewerId: ids.adv2 });
    expect(await assignTask(adminId, id, ids.adv2)).toMatchObject({ ok: false, error: expect.stringContaining('revisor') });
    expect(await assignTask(adminId, id, ids.adv1)).toMatchObject({ ok: true });
  });
});

describe('edição completa', () => {
  it('muda título, prazo, horário, responsável e revisor; registra só o que mudou', async () => {
    const { updateTask } = await import('@/server/task-edit');
    const { db } = await import('@/db');
    const { task } = await import('@/db/schema/task');
    const { auditLog } = await import('@/db/schema');
    const id = await novaTarefa();
    const base = { title: `${TAG} renomeada`, typeId: '', dueDate: '2026-12-15', dueTime: '14:30', ownerId: ids.adv1, reviewerId: ids.adv2 };

    expect(await updateTask(adminId, id, base)).toEqual({ ok: true, changed: true });
    const [t] = await db.select().from(task).where(eq(task.id, id));
    expect(t).toMatchObject({ title: `${TAG} renomeada`, dueDate: '2026-12-15', ownerId: ids.adv1, reviewerId: ids.adv2 });
    expect(t.dueTime?.slice(0, 5)).toBe('14:30');

    // salvar de novo sem mudar nada não gera ruído
    expect(await updateTask(adminId, id, base)).toEqual({ ok: true, changed: false });
    const diffs = (await db.select().from(auditLog).where(eq(auditLog.entityId, id))).filter((l) => l.action === 'update');
    expect(diffs).toHaveLength(1);
    expect(Object.keys(diffs[0].diff as object).sort()).toEqual(['assigneeIds', 'dueDate', 'dueTime', 'reviewerId', 'title']);
  });

  it('recusa título curto, data inválida, revisor igual ao responsável e usuário inativo', async () => {
    const { updateTask } = await import('@/server/task-edit');
    const id = await novaTarefa();
    const ok = { title: `${TAG} válida`, typeId: '', dueDate: '2026-12-15', dueTime: '', ownerId: '', reviewerId: '' };
    expect(await updateTask(adminId, id, { ...ok, title: 'ab' })).toMatchObject({ ok: false });
    expect(await updateTask(adminId, id, { ...ok, dueDate: '15/12/2026' })).toMatchObject({ ok: false });
    expect(await updateTask(adminId, id, { ...ok, ownerId: ids.adv1, reviewerId: ids.adv1 })).toMatchObject({ ok: false, error: expect.stringContaining('revisor') });
    expect(await updateTask(adminId, id, { ...ok, ownerId: ids.inativa })).toMatchObject({ ok: false });
    expect(await updateTask(adminId, id, { ...ok, reviewerId: ids.leitura })).toMatchObject({ ok: false });
    expect(await updateTask(adminId, '00000000-0000-0000-0000-000000000000', ok)).toMatchObject({ ok: false });
  });

  it('tarefa aguardando revisão não pode ficar sem revisor', async () => {
    const { updateTask } = await import('@/server/task-edit');
    const { moveTask } = await import('@/server/tasks');
    const id = await novaTarefa({ reviewerId: ids.adv2, ownerId: ids.adv1 });
    await moveTask(ids.adv1, 'lawyer', id, 'done'); // responsável tenta concluir: vai para revisão
    const r = await updateTask(adminId, id, { title: `${TAG} x1`, typeId: '', dueDate: '2026-12-15', dueTime: '', ownerId: ids.adv1, reviewerId: '' });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('revisão') });
  });
});
