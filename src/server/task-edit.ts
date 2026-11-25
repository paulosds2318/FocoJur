import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { cases } from '@/db/schema/case';
import { lookup } from '@/db/schema/lookups';
import { task, taskAssignee } from '@/db/schema/task';
import { audit } from '@/lib/audit';
import { activeUser, checkAssignees, checkInternalDue, readAssignees } from './tasks';

const optId = z.string().trim().transform((v) => v || null);

const editSchema = z.object({
  title: z.string().trim().min(3, 'Informe o título da tarefa.'),
  typeId: optId,
  bucketId: z.string().trim().optional().default('').transform((v) => v || null),
  dueDate: z.string().trim().transform((v) => v || null).refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Data de prazo inválida.'),
  dueTime: z.string().trim().transform((v) => v || null).refine((v) => v === null || /^\d{2}:\d{2}$/.test(v), 'Horário inválido.'),
  internalDueDate: z.string().trim().optional().default('').transform((v) => v || null).refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Prazo interno inválido.'),
  ownerId: z.string().trim().optional().default('').transform((v) => v || null),
  assigneeIds: z.string().trim().optional().default(''),
  reviewerId: optId,
});

/** Tarefa com os nomes ligados (processo, tipo, responsável, revisor) para a tela de edição. */
export async function getTask(id: string) {
  const [t] = await db.select().from(task).where(eq(task.id, id));
  if (!t) return null;
  const [c] = t.caseId ? await db.select({ number: cases.number, portfolio: cases.portfolio }).from(cases).where(eq(cases.id, t.caseId)) : [];
  const [type] = t.typeId ? await db.select({ label: lookup.label }).from(lookup).where(eq(lookup.id, t.typeId)) : [];
  const assigneeIds = (await db.select({ id: taskAssignee.userId }).from(taskAssignee).where(eq(taskAssignee.taskId, id)).orderBy(taskAssignee.createdAt)).map((a) => a.id);
  return { ...t, assigneeIds, caseNumber: c?.number ?? null, portfolio: c?.portfolio ?? null, typeLabel: type?.label ?? null };
}

const idsOf = async (taskId: string) => (await db.select({ id: taskAssignee.userId }).from(taskAssignee).where(eq(taskAssignee.taskId, taskId)).orderBy(taskAssignee.createdAt)).map((r) => r.id);
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Troca os responsáveis (uma ou várias pessoas; lista vazia = sem responsável). O primeiro fica também em task.owner_id. Audita. */
async function writeAssignees(taskId: string, ids: string[]) {
  await db.transaction(async (tx) => {
    await tx.delete(taskAssignee).where(eq(taskAssignee.taskId, taskId));
    if (ids.length) await tx.insert(taskAssignee).values(ids.map((userId) => ({ taskId, userId })));
    await tx.update(task).set({ ownerId: ids[0] ?? null }).where(eq(task.id, taskId));
  });
}

/**
 * Edita a tarefa: título, tipo, coluna, prazos, responsáveis (várias pessoas) e revisor. O processo e o status não mudam aqui
 * (o status se muda no quadro, onde vale a regra do revisor). Tudo o que mudou fica na auditoria.
 */
export async function updateTask(actorId: string, taskId: string, raw: Record<string, FormDataEntryValue>) {
  const p = editSchema.safeParse(raw);
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message };
  const { assigneeIds: _ignored, ...d } = p.data;
  void _ignored;
  const [cur] = await db.select().from(task).where(eq(task.id, taskId));
  if (!cur) return { ok: false as const, error: 'Tarefa não encontrada.' };
  const before = await idsOf(taskId);
  // sem o campo de responsáveis no formulário (formato antigo), vale ownerId
  const assignees = 'assigneeIds' in raw || raw.ownerId !== undefined ? readAssignees(raw) : before;
  d.ownerId = assignees[0] ?? null;
  const assigneeErr = await checkAssignees(assignees, d.reviewerId);
  if (assigneeErr) return { ok: false as const, error: assigneeErr };
  const dueErr = checkInternalDue(d.dueDate, d.internalDueDate);
  if (dueErr) return { ok: false as const, error: dueErr };
  if (cur.status === 'review' && !d.reviewerId) return { ok: false as const, error: 'Esta tarefa está aguardando revisão e precisa de um revisor. Mude o status no quadro antes de tirar o revisor.' };
  if (!(await activeUser(d.reviewerId))) return { ok: false as const, error: 'Revisor inválido (usuário inativo ou com perfil de leitura).' };

  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const k of ['title', 'typeId', 'bucketId', 'dueDate', 'internalDueDate', 'dueTime', 'reviewerId'] as const) {
    const was = k === 'dueTime' ? (cur.dueTime ? cur.dueTime.slice(0, 5) : null) : (cur[k] ?? null);
    if (was !== d[k]) diff[k] = { before: was, after: d[k] };
  }
  const assigneesChanged = !sameSet(before, assignees) || (before[0] ?? null) !== (assignees[0] ?? null);
  if (assigneesChanged) diff.assigneeIds = { before, after: assignees };
  if (Object.keys(diff).length === 0) return { ok: true as const, changed: false };
  const { ownerId: _o, ...patch } = d;
  void _o;
  await db.update(task).set(patch).where(eq(task.id, taskId));
  if (assigneesChanged) await writeAssignees(taskId, assignees);
  await audit({ actorId, entity: 'task', entityId: taskId, action: 'update', diff });
  return { ok: true as const, changed: true };
}

/** Define quem são os responsáveis (várias pessoas; vazio = sem responsável). */
export async function setAssignees(actorId: string, taskId: string, ids: string[]) {
  const [cur] = await db.select().from(task).where(eq(task.id, taskId));
  if (!cur) return { ok: false as const, error: 'Tarefa não encontrada.' };
  const list = [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
  if (cur.reviewerId && list.includes(cur.reviewerId)) return { ok: false as const, error: 'O responsável não pode ser o próprio revisor da tarefa.' };
  const err = await checkAssignees(list, null);
  if (err) return { ok: false as const, error: err };
  const before = await idsOf(taskId);
  if (sameSet(before, list) && (before[0] ?? null) === (list[0] ?? null)) return { ok: true as const, changed: false };
  await writeAssignees(taskId, list);
  await audit({ actorId, entity: 'task', entityId: taskId, action: 'update', diff: { assigneeIds: { before, after: list } } });
  return { ok: true as const, changed: true };
}

/** Troca rápida para uma pessoa só (vazio = sem responsável). */
export async function assignTask(actorId: string, taskId: string, ownerId: string | null) {
  return setAssignees(actorId, taskId, ownerId ? [ownerId] : []);
}
