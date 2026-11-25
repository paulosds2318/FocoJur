import { and, asc, desc, eq, gte, isNull, lt, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import { movement } from '@/db/schema/movement';
import { z } from 'zod';
import { db } from '@/db';
import { user } from '@/db/schema';
import { cases } from '@/db/schema/case';
import { lookup } from '@/db/schema/lookups';
import { holiday, task, taskAssignee, type TaskStatus } from '@/db/schema/task';
import { audit } from '@/lib/audit';
import { subBusinessDays, todayInSaoPaulo } from '@/lib/deadlines';

export const TASK_STATUSES: TaskStatus[] = ['todo', 'doing', 'review', 'done'];
export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'A fazer', doing: 'Em andamento', review: 'Aguardando revisão', done: 'Concluídas', cancelled: 'Canceladas',
};

export type HolidayCtx = { state?: string | null; city?: string | null; court?: string | null };

/**
 * Feriados que valem para um prazo: os nacionais sempre; os estaduais, municipais e do tribunal só quando
 * batem com o processo (UF, cidade, vara). Sem `ctx`, só os nacionais (telas de listagem).
 */
export async function getHolidaySet(ctx?: HolidayCtx): Promise<Set<string>> {
  const rows = await db.select().from(holiday);
  const norm = (v?: string | null) => (v ?? '').trim().toLowerCase();
  return new Set(
    rows
      .filter((h) =>
        h.scope === 'national' ||
        (h.scope === 'state' && !!ctx?.state && norm(h.state) === norm(ctx.state)) ||
        (h.scope === 'city' && !!ctx?.city && norm(h.city) === norm(ctx.city) && (!h.state || norm(h.state) === norm(ctx.state))) ||
        (h.scope === 'court' && !!ctx?.court && !!h.court && norm(ctx.court).includes(norm(h.court))),
      )
      .map((h) => h.date),
  );
}

/** UFs com algum calendário local (estadual, municipal ou de tribunal) cadastrado: as demais ganham o aviso "conferir feriados locais". */
export async function statesWithLocalCalendar(): Promise<Set<string>> {
  const rows = await db.select({ state: holiday.state, scope: holiday.scope }).from(holiday);
  return new Set(rows.filter((r) => r.scope !== 'national' && r.state).map((r) => r.state!.toUpperCase()));
}

export type TaskView = 'all' | 'mine' | 'general';
export const NO_OWNER = 'none';
export type TaskFilters = {
  view?: TaskView; portfolio?: string; typeId?: string; caseId?: string; userId: string;
  /** id de um usuário (responsável) ou 'none' (sem responsável) */
  ownerId?: string;
  /** dia 'YYYY-MM-DD': tarefas cujo prazo limite OU prazo interno cai nesse dia */
  day?: string;
  /** id da coluna (bucket) ou 'none' (sem bucket) */
  bucketId?: string;
  /** intervalo 'YYYY-MM-DD' (inclusivo) sobre o prazo limite OU interno: usado pelo calendário */
  from?: string; to?: string;
  /** concluídas aparecem se foram concluídas nos últimos N dias (padrão 30); 'all' = todas (calendário) */
  doneDays?: number | 'all';
};
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function listTasks(f: TaskFilters) {
  const conds: SQL[] = [ne(task.status, 'cancelled')];
  if (f.caseId) conds.push(eq(task.caseId, f.caseId));
  if (f.view === 'mine') conds.push(or(hasAssignee(f.userId), eq(task.reviewerId, f.userId))!);
  if (f.view === 'general') conds.push(isNull(task.caseId));
  if (f.portfolio) conds.push(eq(cases.portfolio, f.portfolio as 'civil'));
  if (f.typeId) conds.push(eq(task.typeId, f.typeId));
  if (f.ownerId === NO_OWNER) conds.push(sql`not exists (select 1 from task_assignee ta where ta.task_id = ${task.id})`);
  else if (f.ownerId) conds.push(hasAssignee(f.ownerId));
  if (f.day && DAY_RE.test(f.day)) conds.push(or(eq(task.dueDate, f.day), eq(task.internalDueDate, f.day))!);
  if (f.bucketId === NO_OWNER) conds.push(isNull(task.bucketId));
  else if (f.bucketId) conds.push(eq(task.bucketId, f.bucketId));
  if (f.from && f.to && DAY_RE.test(f.from) && DAY_RE.test(f.to)) {
    conds.push(or(and(gte(task.dueDate, f.from), lte(task.dueDate, f.to)), and(gte(task.internalDueDate, f.from), lte(task.internalDueDate, f.to)))!);
  }
  // concluídas só aparecem se foram concluídas nos últimos N dias (ou nesta consulta por processo / calendário)
  if (!f.caseId && f.doneDays !== 'all') {
    const since = new Date(new Date(`${todayInSaoPaulo()}T00:00:00-03:00`).getTime() - ((f.doneDays ?? 30) - 1) * 24 * 3600 * 1000);
    conds.push(or(ne(task.status, 'done'), gte(task.completedAt, since))!);
  }

  return db
    .select({
      id: task.id, title: task.title, status: task.status, dueDate: task.dueDate, internalDueDate: task.internalDueDate, dueTime: task.dueTime,
      ownerId: task.ownerId, reviewerId: task.reviewerId, caseId: task.caseId, origin: task.origin, bucketId: task.bucketId,
      caseNumber: cases.number, portfolio: cases.portfolio,
      typeLabel: lookup.label,
      assignees: sql<{ id: string; name: string }[]>`(select coalesce(json_agg(json_build_object('id', u.id, 'name', u.name) order by ta.created_at, u.name), '[]'::json) from task_assignee ta join "user" u on u.id = ta.user_id where ta.task_id = "task"."id")`,
      reviewerName: sql<string | null>`(select name from "user" where id = ${task.reviewerId})`,
    })
    .from(task)
    .leftJoin(cases, eq(cases.id, task.caseId))
    .leftJoin(lookup, eq(lookup.id, task.typeId))
    .where(and(...conds))
    .orderBy(sql`${task.dueDate} asc nulls last`, desc(task.createdAt));
}

export type TaskRow = Awaited<ReturnType<typeof listTasks>>[number];

const optId = z.string().trim().transform((v) => v || null);

/** A pessoa está entre os responsáveis da tarefa? (a tarefa pode ter várias). */
const hasAssignee = (userId: string) => sql`exists (select 1 from task_assignee ta where ta.task_id = ${task.id} and ta.user_id = ${userId})`;

/** Lê os responsáveis do formulário: `assigneeIds` (ids separados por vírgula; vale mesmo vazio) ou, no formato antigo, `ownerId`. */
export function readAssignees(raw: Record<string, unknown>): string[] {
  const list = typeof raw.assigneeIds === 'string' ? raw.assigneeIds.split(',') : raw.ownerId ? [String(raw.ownerId)] : [];
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))];
}

/** Usuário ativo e que não é só leitura (pode ser responsável ou revisor). Vazio vale. */
export async function activeUser(id: string | null) {
  if (!id) return true;
  const [u] = await db.select({ active: user.active, role: user.role }).from(user).where(eq(user.id, id));
  return !!u && u.active !== false && u.role !== 'viewer';
}

/** Valida a lista de responsáveis: todos ativos e com perfil que trabalha tarefas, e o revisor fora da lista. Devolve a mensagem de erro, se houver. */
export async function checkAssignees(ids: string[], reviewerId: string | null): Promise<string | null> {
  if (reviewerId && ids.includes(reviewerId)) return ids.length === 1 ? 'O revisor deve ser diferente do responsável.' : 'O revisor não pode estar entre os responsáveis.';
  for (const id of ids) if (!(await activeUser(id))) return 'Responsável inválido (usuário inativo ou com perfil de leitura).';
  return null;
}

export const taskFormSchema = z.object({
  title: z.string().trim().min(3, 'Informe o título da tarefa.'),
  caseId: optId,
  typeId: optId,
  bucketId: z.string().trim().optional().default('').transform((v) => v || null),
  dueDate: z.string().trim().transform((v) => v || null),
  internalDueDate: z.string().trim().optional().default('').transform((v) => v || null),
  dueTime: z.string().trim().transform((v) => v || null),
  ownerId: z.string().trim().optional().default('').transform((v) => v || null),
  assigneeIds: z.string().trim().optional().default(''),
  reviewerId: optId,
  movementId: z.string().trim().optional().default('').transform((v) => v || null),
});

/** Prazo interno: data válida, exige o prazo limite e não pode passar dele. */
export function checkInternalDue(due: string | null, internal: string | null): string | null {
  if (!internal) return null;
  if (!DAY_RE.test(internal)) return 'Prazo interno inválido.';
  if (!due) return 'Informe o prazo limite para definir um prazo interno.';
  if (internal > due) return 'O prazo interno não pode ser depois do prazo limite.';
  return null;
}

/**
 * Prazo interno automático: se o tipo da tarefa tem a regra "N dias úteis antes do limite" (Listas oficiais), devolve limite menos N dias úteis,
 * nunca antes de hoje nem depois do limite. Sem regra, sem tipo ou sem prazo limite, nulo.
 */
export async function internalDateFor(typeId: string | null, dueDate: string | null): Promise<string | null> {
  if (!typeId || !dueDate || !DAY_RE.test(dueDate)) return null;
  const [ty] = await db.select({ n: lookup.internalDays }).from(lookup).where(eq(lookup.id, typeId));
  if (!ty?.n || ty.n < 1) return null;
  const calc = subBusinessDays(dueDate, ty.n, await getHolidaySet());
  const today = todayInSaoPaulo();
  return calc >= today ? calc : today <= dueDate ? today : dueDate;
}

export async function createTask(actorId: string, raw: Record<string, FormDataEntryValue>) {
  const p = taskFormSchema.safeParse(raw);
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message };
  const { movementId, assigneeIds: _ignored, ...d } = p.data;
  void _ignored;
  const assignees = readAssignees(raw);
  d.ownerId = assignees[0] ?? null; // o primeiro responsável fica também em task.owner_id
  const assigneeErr = await checkAssignees(assignees, d.reviewerId);
  if (assigneeErr) return { ok: false as const, error: assigneeErr };
  const dueErr = checkInternalDue(d.dueDate, d.internalDueDate);
  if (dueErr) return { ok: false as const, error: dueErr };
  // prazo interno em branco: se o tipo tem a regra "N dias úteis antes do limite", o sistema calcula (nunca antes de hoje)
  let autoInternal = false;
  if (!d.internalDueDate) {
    const auto = await internalDateFor(d.typeId, d.dueDate);
    if (auto) { d.internalDueDate = auto; autoInternal = true; }
  }
  if (movementId) {
    const [m] = await db.select({ caseId: movement.caseId, status: movement.triageStatus }).from(movement).where(eq(movement.id, movementId));
    if (!m) return { ok: false as const, error: 'Andamento não encontrado.' };
    if (m.caseId && d.caseId && m.caseId !== d.caseId) return { ok: false as const, error: 'O andamento é de outro processo.' };
  }
  if (d.caseId) {
    const [c] = await db.select({ id: cases.id }).from(cases).where(and(eq(cases.id, d.caseId), isNull(cases.deletedAt)));
    if (!c) return { ok: false as const, error: 'Processo não encontrado.' };
  }
  const [row] = await db.insert(task).values({ ...d, movementId, origin: 'manual', status: 'todo' }).returning({ id: task.id });
  if (assignees.length) await db.insert(taskAssignee).values(assignees.map((userId) => ({ taskId: row.id, userId })));
  const { ownerId: _o, ...shown } = d;
  void _o;
  await audit({ actorId, entity: 'task', entityId: row.id, action: 'create', diff: { after: { ...shown, assigneeIds: assignees, movementId, ...(autoInternal ? { internalCalculado: true } : {}) } } });
  if (movementId) {
    // o alerta do andamento só sai da fila quando uma tarefa é criada a partir dele: fica como lido
    await db.update(movement).set({ triageStatus: 'task_created', readBy: actorId, readAt: new Date() }).where(eq(movement.id, movementId));
    await audit({ actorId, entity: 'movement', entityId: movementId, action: 'update', diff: { after: { triage: 'task_created', taskId: row.id } } });
  }
  return { ok: true as const, id: row.id };
}

/** Move a tarefa de coluna (bucket); vazio = "Sem bucket". Audita. */
export async function moveToBucket(actorId: string, taskId: string, bucketId: string | null) {
  const [t] = await db.select().from(task).where(eq(task.id, taskId));
  if (!t) return { ok: false as const, error: 'Tarefa não encontrada.' };
  if (bucketId) {
    const [b] = await db.select({ id: lookup.id }).from(lookup).where(and(eq(lookup.id, bucketId), eq(lookup.type, 'task_bucket'), eq(lookup.active, true)));
    if (!b) return { ok: false as const, error: 'Coluna inválida.' };
  }
  if ((t.bucketId ?? null) === bucketId) return { ok: true as const, changed: false };
  await db.update(task).set({ bucketId }).where(eq(task.id, taskId));
  await audit({ actorId, entity: 'task', entityId: taskId, action: 'update', diff: { bucketId: { before: t.bucketId, after: bucketId } } });
  return { ok: true as const, changed: true };
}

/**
 * RF-20/23: muda o status. Tarefa com revisor só vai para "Concluída" pela aprovação do revisor:
 * se o responsável tenta concluir, ela vai para "Aguardando revisão".
 */
export async function moveTask(actorId: string, actorRole: string, taskId: string, to: TaskStatus) {
  const [t] = await db.select().from(task).where(eq(task.id, taskId));
  if (!t) return { ok: false as const, error: 'Tarefa não encontrada.' };
  let target = to;
  if (to === 'done' && t.reviewerId && t.reviewerId !== actorId && actorRole !== 'admin') target = 'review';
  if (t.status === 'review' && target === 'done' && t.reviewerId && t.reviewerId !== actorId && actorRole !== 'admin') {
    return { ok: false as const, error: 'Só o revisor aprova a conclusão desta tarefa.' };
  }
  if (target === t.status) return { ok: true as const, status: target };
  await db
    .update(task)
    .set({ status: target, completedAt: target === 'done' ? new Date() : null })
    .where(eq(task.id, taskId));
  await audit({ actorId, entity: 'task', entityId: taskId, action: 'update', diff: { status: { before: t.status, after: target } } });
  return { ok: true as const, status: target };
}

export async function cancelTask(actorId: string, taskId: string) {
  await db.update(task).set({ status: 'cancelled' }).where(eq(task.id, taskId));
  await audit({ actorId, entity: 'task', entityId: taskId, action: 'update', diff: { status: { after: 'cancelled' } } });
}

/** Tarefas abertas de um processo (RF-47 pede decisão ao encerrar). */
export async function openTasksOfCase(caseId: string) {
  return db
    .select({ id: task.id, title: task.title })
    .from(task)
    .where(and(eq(task.caseId, caseId), ne(task.status, 'done'), ne(task.status, 'cancelled')));
}

export async function cancelOpenTasksOfCase(actorId: string, caseId: string) {
  const open = await openTasksOfCase(caseId);
  for (const t of open) await cancelTask(actorId, t.id);
  return open.length;
}

// ---------- Início ----------
export async function dashboardCounts(today: string, userId?: string) {
  const [prazosHoje] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(task)
    .where(and(eq(task.dueDate, today), ne(task.status, 'done'), ne(task.status, 'cancelled')));
  const [atrasadas] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(task)
    .where(and(lt(task.dueDate, today), ne(task.status, 'done'), ne(task.status, 'cancelled')));
  const [inbox] = await db.execute<{ n: number }>(sql`select count(*)::int as n from inbox_item where status in ('new','in_review','possible_duplicate')`).then((r) => r.rows);
  const [mov] = await db.execute<{ n: number }>(sql`select count(*)::int as n from movement where read_at is null and triage_status = 'pending'`).then((r) => r.rows);
  void userId;
  return { prazosHoje: prazosHoje.n, atrasadas: atrasadas.n, inbox: inbox?.n ?? 0, movimentacoes: mov?.n ?? 0 };
}

export async function dueTodayAndLate(today: string) {
  return db
    .select({
      id: task.id, title: task.title, dueDate: task.dueDate, status: task.status, caseId: task.caseId,
      caseNumber: cases.number, portfolio: cases.portfolio, typeLabel: lookup.label,
      ownerName: sql<string | null>`(select string_agg(u.name, ', ' order by ta.created_at, u.name) from task_assignee ta join "user" u on u.id = ta.user_id where ta.task_id = "task"."id")`,
      plaintiff: sql<string | null>`(select name from case_party p where p.case_id = ${task.caseId} and p.role = 'plaintiff' limit 1)`,
    })
    .from(task)
    .leftJoin(cases, eq(cases.id, task.caseId))
    .leftJoin(lookup, eq(lookup.id, task.typeId))
    .where(and(sql`${task.dueDate} <= ${today}`, ne(task.status, 'done'), ne(task.status, 'cancelled')))
    .orderBy(asc(task.dueDate))
    .limit(50);
}

