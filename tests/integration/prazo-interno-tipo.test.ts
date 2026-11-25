import 'dotenv/config';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Prazo interno automático por tipo de tarefa (dias úteis antes do limite). */
const TAG = 'TESTE-PIT';
let adminId: string;
let tipoId: string;
const form = (o: Record<string, string>) => ({ caseId: '', typeId: '', bucketId: '', dueDate: '', internalDueDate: '', dueTime: '', ownerId: '', reviewerId: '', movementId: '', ...o });

async function limpa() {
  const { db } = await import('@/db');
  const { auditLog } = await import('@/db/schema');
  const { task } = await import('@/db/schema/task');
  const { lookup } = await import('@/db/schema/lookups');
  const t = await db.select({ id: task.id }).from(task).where(like(task.title, `${TAG}%`));
  for (const x of t) await db.delete(auditLog).where(eq(auditLog.entityId, x.id));
  await db.delete(task).where(like(task.title, `${TAG}%`));
  await db.delete(lookup).where(like(lookup.code, 'teste_pit%'));
}

beforeAll(async () => {
  const { db } = await import('@/db');
  const { user } = await import('@/db/schema');
  const { lookup } = await import('@/db/schema/lookups');
  await limpa();
  const [a] = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);
  adminId = a.id;
  const [t] = await db.insert(lookup).values({ type: 'task_type', code: 'teste_pit_tipo', label: `${TAG} tipo`, sort: 99 }).returning({ id: lookup.id });
  tipoId = t.id;
});
afterAll(limpa);

describe('prazo interno automático pelo tipo', () => {
  it('tipo com regra: calcula N dias úteis antes do limite; digitado vence; sem regra não calcula', async () => {
    const { setLookupInternalDays } = await import('@/server/lookups');
    const { createTask } = await import('@/server/tasks');
    const { db } = await import('@/db');
    const { task } = await import('@/db/schema/task');
    expect((await setLookupInternalDays(adminId, tipoId, '2')).ok).toBe(true);
    expect((await setLookupInternalDays(adminId, tipoId, 'x')).ok).toBe(false);

    const lim = '2031-06-18'; // quarta-feira
    const a = await createTask(adminId, form({ title: `${TAG} auto`, typeId: tipoId, dueDate: lim }));
    if (!a.ok) throw new Error(a.error);
    expect((await db.select().from(task).where(eq(task.id, a.id)))[0].internalDueDate).toBe('2031-06-16'); // segunda-feira

    const b = await createTask(adminId, form({ title: `${TAG} manual`, typeId: tipoId, dueDate: lim, internalDueDate: '2031-06-17' }));
    if (!b.ok) throw new Error(b.error);
    expect((await db.select().from(task).where(eq(task.id, b.id)))[0].internalDueDate).toBe('2031-06-17');

    expect((await setLookupInternalDays(adminId, tipoId, '')).ok).toBe(true); // tira a regra
    const c = await createTask(adminId, form({ title: `${TAG} sem regra`, typeId: tipoId, dueDate: lim }));
    if (!c.ok) throw new Error(c.error);
    expect((await db.select().from(task).where(eq(task.id, c.id)))[0].internalDueDate).toBeNull();
  });

  it('prazo limite muito próximo: o interno nunca fica antes de hoje nem depois do limite', async () => {
    const { setLookupInternalDays } = await import('@/server/lookups');
    const { createTask } = await import('@/server/tasks');
    const { todayInSaoPaulo } = await import('@/lib/deadlines');
    const { db } = await import('@/db');
    const { task } = await import('@/db/schema/task');
    await setLookupInternalDays(adminId, tipoId, '30');
    const hoje = todayInSaoPaulo();
    const r = await createTask(adminId, form({ title: `${TAG} perto`, typeId: tipoId, dueDate: hoje }));
    if (!r.ok) throw new Error(r.error);
    expect((await db.select().from(task).where(eq(task.id, r.id)))[0].internalDueDate).toBe(hoje);
    await setLookupInternalDays(adminId, tipoId, '');
  });

  it('o mesmo cálculo vale para tarefa criada pela sugestão da IA (internalDateFor)', async () => {
    const { setLookupInternalDays } = await import('@/server/lookups');
    const { internalDateFor } = await import('@/server/tasks');
    await setLookupInternalDays(adminId, tipoId, '2');
    expect(await internalDateFor(tipoId, '2031-06-18')).toBe('2031-06-16'); // quarta -> segunda, 2 dias úteis antes
    expect(await internalDateFor(null, '2031-06-18')).toBeNull(); // sem tipo
    expect(await internalDateFor(tipoId, null)).toBeNull(); // sem prazo limite
    await setLookupInternalDays(adminId, tipoId, '');
    expect(await internalDateFor(tipoId, '2031-06-18')).toBeNull(); // sem regra
  });

  it('a regra vale só para tipo de tarefa', async () => {
    const { setLookupInternalDays } = await import('@/server/lookups');
    const { db } = await import('@/db');
    const { lookup } = await import('@/db/schema/lookups');
    const [s] = await db.select().from(lookup).where(eq(lookup.type, 'subject')).limit(1);
    expect(await setLookupInternalDays(adminId, s.id, '3')).toMatchObject({ ok: false });
  });
});
