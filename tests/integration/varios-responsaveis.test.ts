import 'dotenv/config';
import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Vários responsáveis por tarefa (como no Planner): criar, listar, filtrar, editar, validar e auditar. */
const TAG = 'TESTE-MULTI';
const ids: Record<'a' | 'b' | 'c' | 'leitura' | 'inativa', string> = { a: '', b: '', c: '', leitura: '', inativa: '' };
let adminId: string;
const form = (o: Record<string, string>) => ({ title: `${TAG} ${Math.random()}`, caseId: '', typeId: '', dueDate: '', dueTime: '', ownerId: '', reviewerId: '', ...o });

async function limpa() {
  const { db } = await import('@/db');
  const { auditLog, user } = await import('@/db/schema');
  const { task } = await import('@/db/schema/task');
  const t = await db.select({ id: task.id }).from(task).where(like(task.title, `${TAG}%`));
  if (t.length) {
    await db.delete(auditLog).where(inArray(auditLog.entityId, t.map((x) => x.id)));
    await db.delete(task).where(inArray(task.id, t.map((x) => x.id))); // os responsáveis saem junto (cascata)
  }
  await db.delete(user).where(like(user.email, `${TAG.toLowerCase()}%`));
}

beforeAll(async () => {
  const { db } = await import('@/db');
  const { user } = await import('@/db/schema');
  await limpa();
  const [a] = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);
  adminId = a.id;
  const mk = async (k: keyof typeof ids, role: string, active: boolean) => {
    const id = crypto.randomUUID();
    await db.insert(user).values({ id, name: `${TAG} ${k}`, email: `${TAG.toLowerCase()}-${k}@teste.com`, emailVerified: true, role, active });
    ids[k] = id;
  };
  await mk('a', 'lawyer', true); await mk('b', 'lawyer', true); await mk('c', 'lawyer', true);
  await mk('leitura', 'viewer', true); await mk('inativa', 'lawyer', false);
});
afterAll(limpa);

const assigneesOf = async (taskId: string) => {
  const { db } = await import('@/db');
  const { taskAssignee } = await import('@/db/schema/task');
  return (await db.select().from(taskAssignee).where(eq(taskAssignee.taskId, taskId)).orderBy(taskAssignee.createdAt)).map((r) => r.userId);
};

describe('vários responsáveis', () => {
  it('cria com dois responsáveis: o primeiro fica como principal e a lista traz os dois', async () => {
    const { createTask, listTasks } = await import('@/server/tasks');
    const { db } = await import('@/db');
    const { task } = await import('@/db/schema/task');
    const r = await createTask(adminId, form({ assigneeIds: `${ids.a},${ids.b},${ids.a}` })); // repetido é ignorado
    if (!r.ok) throw new Error(r.error);
    expect(await assigneesOf(r.id)).toEqual([ids.a, ids.b]);
    expect((await db.select().from(task).where(eq(task.id, r.id)))[0].ownerId).toBe(ids.a);
    const row = (await listTasks({ userId: adminId })).find((t) => t.id === r.id)!;
    expect(row.assignees.map((x) => x.id)).toEqual([ids.a, ids.b]);
    expect(row.assignees[0].name).toBe(`${TAG} a`);
  });

  it('o formato antigo (ownerId) continua valendo; sem nada, fica sem responsável', async () => {
    const { createTask } = await import('@/server/tasks');
    const um = await createTask(adminId, form({ ownerId: ids.c }));
    if (!um.ok) throw new Error(um.error);
    expect(await assigneesOf(um.id)).toEqual([ids.c]);
    const nenhum = await createTask(adminId, form({ assigneeIds: '' }));
    if (!nenhum.ok) throw new Error(nenhum.error);
    expect(await assigneesOf(nenhum.id)).toEqual([]);
  });

  it('filtro por responsável acha por qualquer um; "Minhas" e "Sem responsável" respeitam a lista', async () => {
    const { createTask, listTasks, NO_OWNER } = await import('@/server/tasks');
    const r = await createTask(adminId, form({ title: `${TAG} filtro`, assigneeIds: `${ids.a},${ids.b}` }));
    const s = await createTask(adminId, form({ title: `${TAG} filtro livre` }));
    if (!r.ok || !s.ok) throw new Error('falhou');
    const has = async (f: Parameters<typeof listTasks>[0], id: string) => (await listTasks(f)).some((t) => t.id === id);
    expect(await has({ userId: adminId, ownerId: ids.a }, r.id)).toBe(true);
    expect(await has({ userId: adminId, ownerId: ids.b }, r.id)).toBe(true); // o segundo também
    expect(await has({ userId: adminId, ownerId: ids.c }, r.id)).toBe(false);
    expect(await has({ userId: ids.b, view: 'mine' }, r.id)).toBe(true); // "Minhas" para o segundo responsável
    expect(await has({ userId: ids.c, view: 'mine' }, r.id)).toBe(false);
    expect(await has({ userId: adminId, ownerId: NO_OWNER }, r.id)).toBe(false);
    expect(await has({ userId: adminId, ownerId: NO_OWNER }, s.id)).toBe(true);
  });

  it('valida: revisor fora da lista, usuário inativo ou só leitura não podem ser responsáveis', async () => {
    const { createTask } = await import('@/server/tasks');
    expect(await createTask(adminId, form({ assigneeIds: `${ids.a},${ids.b}`, reviewerId: ids.b }))).toMatchObject({ ok: false, error: expect.stringContaining('revisor') });
    expect(await createTask(adminId, form({ assigneeIds: `${ids.a},${ids.inativa}` }))).toMatchObject({ ok: false });
    expect(await createTask(adminId, form({ assigneeIds: ids.leitura }))).toMatchObject({ ok: false });
  });

  it('setAssignees troca a lista, mantém o principal em sincronia e audita antes/depois; repetir não muda', async () => {
    const { createTask } = await import('@/server/tasks');
    const { setAssignees } = await import('@/server/task-edit');
    const { db } = await import('@/db');
    const { task } = await import('@/db/schema/task');
    const { auditLog } = await import('@/db/schema');
    const r = await createTask(adminId, form({ assigneeIds: `${ids.a}` }));
    if (!r.ok) throw new Error(r.error);
    expect(await setAssignees(adminId, r.id, [ids.b, ids.c])).toEqual({ ok: true, changed: true });
    expect(await assigneesOf(r.id)).toEqual([ids.b, ids.c]);
    expect((await db.select().from(task).where(eq(task.id, r.id)))[0].ownerId).toBe(ids.b);
    expect(await setAssignees(adminId, r.id, [ids.c, ids.b])).toEqual({ ok: true, changed: true }); // mudou o principal
    expect((await db.select().from(task).where(eq(task.id, r.id)))[0].ownerId).toBe(ids.c);
    expect(await setAssignees(adminId, r.id, [ids.c, ids.b])).toEqual({ ok: true, changed: false });
    expect(await setAssignees(adminId, r.id, [])).toEqual({ ok: true, changed: true });
    expect((await db.select().from(task).where(eq(task.id, r.id)))[0].ownerId).toBeNull();
    const logs = await db.select().from(auditLog).where(eq(auditLog.entityId, r.id));
    expect(logs.filter((l) => JSON.stringify(l.diff).includes('assigneeIds')).length).toBeGreaterThanOrEqual(3);
  });

  it('o revisor da tarefa não vira responsável pela troca rápida', async () => {
    const { createTask } = await import('@/server/tasks');
    const { setAssignees } = await import('@/server/task-edit');
    const r = await createTask(adminId, form({ assigneeIds: ids.a, reviewerId: ids.b }));
    if (!r.ok) throw new Error(r.error);
    expect(await setAssignees(adminId, r.id, [ids.a, ids.b])).toMatchObject({ ok: false, error: expect.stringContaining('revisor') });
    expect(await assigneesOf(r.id)).toEqual([ids.a]);
  });

  it('editar pela ficha: a lista inteira vale (inclusive esvaziar) e o diff mostra os nomes na auditoria', async () => {
    const { createTask } = await import('@/server/tasks');
    const { updateTask } = await import('@/server/task-edit');
    const { db } = await import('@/db');
    const { auditLog } = await import('@/db/schema');
    const { formatAuditDiff } = await import('@/lib/audit-format');
    const { resolveAuditNames } = await import('@/server/audit-log');
    const r = await createTask(adminId, form({ title: `${TAG} edit`, assigneeIds: `${ids.a},${ids.b}` }));
    if (!r.ok) throw new Error(r.error);
    const base = { title: `${TAG} edit`, typeId: '', dueDate: '', dueTime: '', reviewerId: '' };
    expect(await updateTask(adminId, r.id, { ...base, assigneeIds: ids.b })).toEqual({ ok: true, changed: true });
    expect(await assigneesOf(r.id)).toEqual([ids.b]);
    expect(await updateTask(adminId, r.id, { ...base, assigneeIds: ids.b })).toEqual({ ok: true, changed: false });
    expect(await updateTask(adminId, r.id, { ...base, assigneeIds: '' })).toEqual({ ok: true, changed: true });
    expect(await assigneesOf(r.id)).toEqual([]);
    const logs = await db.select().from(auditLog).where(eq(auditLog.entityId, r.id));
    const diffs = logs.map((l) => l.diff);
    const names = await resolveAuditNames(diffs);
    const lines = formatAuditDiff(diffs.find((d) => (d as { assigneeIds?: { before: string[] } })?.assigneeIds?.before?.length === 2), names);
    expect(lines.find((l) => l.label === 'Responsáveis')).toMatchObject({ before: `${TAG} a, ${TAG} b`, after: `${TAG} b` });
  });
});
