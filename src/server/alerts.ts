import { and, desc, eq, gte, isNull, lt, ne, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { auditLog } from '@/db/schema';
import { cases } from '@/db/schema/case';
import { movement } from '@/db/schema/movement';

/** Alertas = andamentos dos processos. Pendentes aguardam decisão; tratados viraram tarefa, foram ignorados (ou lidos, no legado). */
export type AlertView = 'pending' | 'handled' | 'all';
export type AlertFilters = {
  view: AlertView; source?: string; state?: string; portfolio?: string; unlinked?: boolean; withSuggestion?: boolean;
  /** só nos tratados */
  outcome?: string; decidedBy?: string;
  /** datas 'YYYY-MM-DD' (Brasília), inclusivas, sobre o momento em que foi tratado */
  from?: string; to?: string;
};
export const ALERT_PAGE_SIZE = 20;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const startOf = (d: string) => new Date(`${d}T00:00:00-03:00`);

const sug = (col: string) => sql.raw(`(select d.${col} from deadline_suggestion d where d.movement_id = "movement"."id" and d.decision is null order by d.created_at desc limit 1)`);
const task = (col: string) => sql.raw(`(select t.${col} from task t where (t.movement_id = "movement"."id" or t.id = "movement"."updated_task_id") order by t.created_at desc limit 1)`);

const columns = () => ({
  id: movement.id, source: movement.source, occurredAt: movement.occurredAt, title: movement.title, rawText: movement.rawText,
  aiSummary: movement.aiSummary, caseId: movement.caseId, caseNumber: cases.number, portfolio: cases.portfolio, state: cases.state,
  arrivedAt: movement.createdAt, termId: movement.matchedTermId, status: movement.triageStatus, discardReason: movement.discardReason, readAt: movement.readAt, readBy: movement.readBy,
  readerName: sql<string | null>`(select name from "user" where id = ${movement.readBy})`,
  sugId: sql<string | null>`${sug('id')}`, sugAct: sql<string | null>`${sug('act_type')}`, sugDays: sql<number | null>`${sug('days')}`,
  sugCount: sql<string | null>`${sug('day_count')}`, sugDue: sql<string | null>`${sug('due_date')}`, sugBasis: sql<string | null>`${sug('legal_basis')}`,
  sugConf: sql<string | null>`${sug('confidence')}`,
  taskUpdated: sql<boolean>`${movement.updatedTaskId} is not null`,
  taskId: sql<string | null>`${task('id')}`, taskTitle: sql<string | null>`${task('title')}`,
  taskDue: sql<string | null>`${task('due_date')}`, taskInternalDue: sql<string | null>`${task('internal_due_date')}`,
});

function conditions(f: AlertFilters): SQL | undefined {
  const c: SQL[] = [];
  if (f.view === 'pending') c.push(eq(movement.triageStatus, 'pending'));
  if (f.view === 'handled') c.push(ne(movement.triageStatus, 'pending'));
  if (f.source) c.push(eq(movement.source, f.source as 'djen'));
  if (f.unlinked) c.push(isNull(movement.caseId));
  if (f.portfolio) c.push(eq(cases.portfolio, f.portfolio as 'civil'));
  if (f.state) c.push(eq(cases.state, f.state.toUpperCase()));
  if (f.view === 'pending' && f.withSuggestion) c.push(sql`exists (select 1 from deadline_suggestion d where d.movement_id = ${movement.id} and d.decision is null)`);
  if (f.view !== 'pending') {
    if (f.outcome && ['task_created', 'discarded', 'linked'].includes(f.outcome)) c.push(eq(movement.triageStatus, f.outcome as 'discarded'));
    if (f.decidedBy) c.push(eq(movement.readBy, f.decidedBy));
    if (f.from && DAY.test(f.from)) c.push(gte(movement.readAt, startOf(f.from)));
    if (f.to && DAY.test(f.to)) c.push(lt(movement.readAt, new Date(startOf(f.to).getTime() + 24 * 3600 * 1000)));
  }
  return c.length ? and(...c) : undefined;
}

export async function listAlerts(f: AlertFilters, opts: { page?: number } = {}) {
  const where = conditions(f);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(movement).leftJoin(cases, eq(cases.id, movement.caseId)).where(where);
  const page = Math.min(Math.max(1, opts.page ?? 1), Math.max(1, Math.ceil(total / ALERT_PAGE_SIZE)));
  const rows = await db
    .select(columns())
    .from(movement)
    .leftJoin(cases, eq(cases.id, movement.caseId))
    .where(where)
    .orderBy(f.view === 'pending' ? desc(movement.occurredAt) : desc(sql`coalesce(${movement.readAt}, ${movement.occurredAt})`), desc(movement.id))
    .limit(ALERT_PAGE_SIZE)
    .offset((page - 1) * ALERT_PAGE_SIZE);
  return { rows, total, page, pageSize: ALERT_PAGE_SIZE };
}

export type AlertRow = Awaited<ReturnType<typeof listAlerts>>['rows'][number];

/** Um alerta, pendente ou tratado (para o painel de detalhe). */
export async function getAlert(id: string): Promise<AlertRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await db.select(columns()).from(movement).leftJoin(cases, eq(cases.id, movement.caseId)).where(eq(movement.id, id));
  return row ?? null;
}

/** Totais das abas, independentes dos filtros. */
export async function alertTotals() {
  const [r] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${movement.triageStatus} = 'pending')::int`,
      handled: sql<number>`count(*) filter (where ${movement.triageStatus} <> 'pending')::int`,
    })
    .from(movement);
  return { pending: r?.pending ?? 0, handled: r?.handled ?? 0 };
}

/** Linha do tempo do alerta na auditoria: vínculo, tarefa criada, ignorado... com quem fez e quando. */
export async function alertHistory(id: string) {
  return db
    .select({
      id: auditLog.id, at: auditLog.at, action: auditLog.action, diff: auditLog.diff,
      actorName: sql<string | null>`(select name from "user" where id = ${auditLog.actorId})`,
    })
    .from(auditLog)
    .where(and(eq(auditLog.entity, 'movement'), eq(auditLog.entityId, id)))
    .orderBy(auditLog.at);
}

/** Texto curto de um registro de auditoria do alerta. */
export function describeAlertEvent(diff: unknown): string {
  const after = ((diff ?? {}) as { after?: Record<string, unknown>; reason?: string }).after ?? {};
  const d = (diff ?? {}) as { reason?: string };
  if (after.triage === 'task_created' && after.updatedExisting) return 'Atualizou a tarefa que já existia e o alerta ficou como lido';
  if (after.triage === 'task_created') return 'Criou a tarefa e o alerta ficou como lido';
  if (after.triage === 'discarded' || d.reason) return `Ignorou${d.reason ? `: ${d.reason}` : ''}`;
  if (after.caseId) return 'Vinculou a um processo';
  return 'Atualizou o alerta';
}

/** Dias (de calendário, em Brasília) desde que o alerta chegou: 0 = chegou hoje. */
export function daysPending(arrivedAt: Date, now = new Date()) {
  const day = (d: Date) => new Date(d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) + 'T00:00:00Z').getTime();
  return Math.max(0, Math.round((day(now) - day(arrivedAt)) / 86_400_000));
}

/** Os alertas pendentes mais recentes (para o sininho do topo). */
export async function recentPending(limit = 8) {
  return db
    .select({ id: movement.id, title: movement.title, arrivedAt: movement.createdAt, caseNumber: cases.number, summary: movement.aiSummary, rawText: movement.rawText })
    .from(movement)
    .leftJoin(cases, eq(cases.id, movement.caseId))
    .where(eq(movement.triageStatus, 'pending'))
    .orderBy(desc(movement.createdAt), desc(movement.id))
    .limit(limit);
}
