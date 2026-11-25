import { and, desc, eq, gte, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { auditLog, user } from '@/db/schema';
import { cases } from '@/db/schema/case';
import { lookup } from '@/db/schema/lookups';
import { collectIds } from '@/lib/audit-format';
import { formatCaseNumber } from '@/lib/case-number';

export const AUDIT_PAGE_SIZE = 30;

export const ENTITY_LABEL: Record<string, string> = {
  case: 'Processo', case_risk: 'Prognóstico e risco', task: 'Tarefa', movement: 'Andamento', inbox_item: 'Item da triagem',
  deadline_suggestion: 'Sugestão de prazo', financial_entry: 'Lançamento financeiro', lookup: 'Lista oficial', holiday: 'Feriado',
  monitored_term: 'Termo monitorado', group_entity: 'Loja/CNPJ do grupo', name_decision: 'Variação de nome', import_batch: 'Importação',
  ai_task_config: 'Modelo de IA', ai_budget: 'Limite de IA', fx_rate: 'Cotação', app_setting: 'Configuração', user: 'Usuário', session: 'Acesso',
};
export const ACTION_LABEL: Record<string, string> = {
  create: 'Criou', update: 'Alterou', delete: 'Excluiu', login: 'Entrou no sistema', login_failed: 'Tentativa de acesso recusada',
  password_change: 'Trocou a senha', temp_password_generated: 'Gerou senha temporária', ai_accept: 'Aceitou sugestão da IA',
};

export type AuditFilters = {
  /** id do usuário, 'system' (ações automáticas, sem usuário) ou vazio (todos) */
  userId?: string; entity?: string; action?: string;
  /** datas 'YYYY-MM-DD' no fuso de São Paulo, inclusivas */
  from?: string; to?: string; page?: number;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const startOf = (d: string) => new Date(`${d}T00:00:00-03:00`);
const nextDay = (d: string) => new Date(startOf(d).getTime() + 24 * 3600 * 1000);

function conditions(f: AuditFilters): SQL | undefined {
  const c: SQL[] = [];
  if (f.userId === 'system') c.push(isNull(auditLog.actorId));
  else if (f.userId) c.push(eq(auditLog.actorId, f.userId));
  if (f.entity) c.push(eq(auditLog.entity, f.entity));
  if (f.action) c.push(eq(auditLog.action, f.action));
  if (f.from && DAY.test(f.from)) c.push(gte(auditLog.at, startOf(f.from)));
  if (f.to && DAY.test(f.to)) c.push(lt(auditLog.at, nextDay(f.to)));
  return c.length ? and(...c) : undefined;
}

/** Trilha de auditoria paginada, com o nome de quem fez (nulo = sistema). Só o admin consulta. */
export async function listAudit(f: AuditFilters) {
  const where = conditions(f);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(auditLog).where(where);
  const page = Math.min(Math.max(1, f.page ?? 1), Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)));
  const rows = await db
    .select({
      id: auditLog.id, at: auditLog.at, actorId: auditLog.actorId, entity: auditLog.entity, entityId: auditLog.entityId, action: auditLog.action, diff: auditLog.diff,
      actorName: sql<string | null>`(select name from "user" where id = ${auditLog.actorId})`,
    })
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(AUDIT_PAGE_SIZE)
    .offset((page - 1) * AUDIT_PAGE_SIZE);
  return { rows, total, page, pageSize: AUDIT_PAGE_SIZE };
}

/** Quanto cada usuário fez no período (para o resumo no topo da tela). */
export async function auditSummaryByUser(f: Pick<AuditFilters, 'from' | 'to'>) {
  return db
    .select({
      actorId: auditLog.actorId, n: sql<number>`count(*)::int`, last: sql<Date>`max(${auditLog.at})`,
      actorName: sql<string | null>`(select name from "user" where id = ${auditLog.actorId})`,
    })
    .from(auditLog)
    .where(conditions(f))
    .groupBy(auditLog.actorId)
    .orderBy(desc(sql`count(*)`));
}

export async function auditFacets() {
  const [entities, actions] = await Promise.all([
    db.selectDistinct({ v: auditLog.entity }).from(auditLog).orderBy(auditLog.entity),
    db.selectDistinct({ v: auditLog.action }).from(auditLog).orderBy(auditLog.action),
  ]);
  return { entities: entities.map((e) => e.v), actions: actions.map((a) => a.v) };
}

/** Nomes dos ids que aparecem nos diffs (usuários, itens de lista, processos), para a tela mostrar "Maria" e não um código. */
export async function resolveAuditNames(diffs: unknown[]): Promise<Map<string, string>> {
  const ids = new Set<string>();
  diffs.forEach((d) => collectIds(d, ids));
  const all = [...ids];
  const names = new Map<string, string>();
  if (!all.length) return names;
  const uuids = all.filter((i) => /^[0-9a-f-]{36}$/i.test(i));
  const [users, lookups, caseRows] = await Promise.all([
    db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, all)),
    uuids.length ? db.select({ id: lookup.id, label: lookup.label }).from(lookup).where(inArray(lookup.id, uuids)) : [],
    uuids.length ? db.select({ id: cases.id, number: cases.number }).from(cases).where(inArray(cases.id, uuids)) : [],
  ]);
  users.forEach((u) => names.set(u.id, u.name));
  lookups.forEach((l) => names.set(l.id, l.label));
  caseRows.forEach((c) => names.set(c.id, formatCaseNumber(c.number)));
  return names;
}
