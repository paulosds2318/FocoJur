import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { cases } from '@/db/schema/case';
import { deadlineSuggestion, movement } from '@/db/schema/movement';
import { task } from '@/db/schema/task';
import { lookup } from '@/db/schema/lookups';
import { audit } from '@/lib/audit';
import { normalizeCaseNumber } from '@/lib/case-number';
import { addBusinessDays, addCalendarDays, addDays, todayInSaoPaulo } from '@/lib/deadlines';
import { markAccepted, runAiTask } from '@/lib/ai';
import { canonicalOption, optionLines } from '@/lib/ai/options';
import { getLookups } from './lookups';
import { createTask, getHolidaySet, internalDateFor, statesWithLocalCalendar, type HolidayCtx } from './tasks';

export type MovementSource = 'djen' | 'domicilio' | 'datajud' | 'portal';

export const DISCARD_REASONS = ['Não é da Foco (homônimo)', 'Já tratado', 'Sem providência', 'Duplicado'] as const;

/** Grava a movimentação sem duplicar (source + external_id) e liga ao processo quando o número já existe. */
export async function ingestMovement(i: {
  source: MovementSource; externalId: string; caseNumber?: string | null; occurredAt: Date; title?: string | null;
  rawText: string; matchedTermId?: string | null;
  /** publicação que a advogada já viu (ex.: a que trouxe o processo à Triagem): entra como lida, sem gerar alerta */
  alreadyRead?: { by: string | null };
}) {
  const [dup] = await db.select({ id: movement.id }).from(movement).where(and(eq(movement.source, i.source), eq(movement.externalId, i.externalId))).limit(1);
  if (dup) return { id: dup.id, created: false, linked: false };
  let caseId: string | null = null;
  if (i.caseNumber) {
    const n = normalizeCaseNumber(i.caseNumber);
    const [c] = await db.select({ id: cases.id, monitoring: cases.monitoring }).from(cases).where(and(eq(cases.number, n), isNull(cases.deletedAt))).limit(1);
    // processo cadastrado com o monitoramento desligado (ou encerrado): não gera alerta. Conta como "tratado" (linked) para
    // não virar processo novo na Triagem.
    if (c && !c.monitoring) return { id: '', created: false, linked: true, skipped: 'monitoring_off' as const };
    caseId = c?.id ?? null;
  }
  const [row] = await db
    .insert(movement)
    .values({
      caseId, source: i.source, externalId: i.externalId, occurredAt: i.occurredAt, title: i.title ?? null, rawText: i.rawText, matchedTermId: i.matchedTermId ?? null,
      ...(i.alreadyRead ? { triageStatus: 'linked' as const, readBy: i.alreadyRead.by, readAt: new Date() } : {}),
    })
    .returning({ id: movement.id });
  if (caseId) await db.update(cases).set({ lastMovementAt: sql`greatest(coalesce(${cases.lastMovementAt}, 'epoch'), ${i.occurredAt.toISOString()}::timestamptz)` }).where(eq(cases.id, caseId));
  return { id: row.id, created: true, linked: !!caseId };
}

/** Calcula a data final com o calendário do sistema (regra 2); a data da IA serve só de conferência. */
export async function computeDueDate(startDate: string, days: number, dayCount: 'business' | 'calendar', ctx?: HolidayCtx) {
  const holidays = await getHolidaySet(ctx);
  return dayCount === 'business' ? addBusinessDays(startDate, days, holidays) : addCalendarDays(startDate, days, holidays);
}

/** Texto enviado à IA para o prazo: a publicação + os tipos de ato cadastrados com a descrição (prazo e contagem) de cada um. */
export function buildDeadlinePrompt(text: string, types: { label: string; description?: string | null }[]) {
  if (!types.length) return text;
  return `${text}\n\nTipos de ato cadastrados (escolha um rótulo EXATO para actType, seguindo a descrição):\n${optionLines(types)}`;
}

/**
 * Resumo e sugestão de prazo por IA (nunca cria tarefa sozinho — regra 1).
 * Retorna sem erro se a IA não estiver configurada: a movimentação segue para triagem sem resumo.
 */
export async function enrichMovementWithAI(movementId: string, fetchFn?: typeof fetch) {
  const [m] = await db.select().from(movement).where(eq(movement.id, movementId));
  if (!m?.rawText) return { ok: false as const, error: 'Movimentação sem texto.' };
  const ctx = { caseId: m.caseId, fetchFn };
  const text = `${m.title ?? ''}\n${m.rawText}`.slice(0, 12_000);
  const sum = await runAiTask('movement_summary', text, ctx);
  if (sum.ok) await db.update(movement).set({ aiSummary: sum.output.summary }).where(eq(movement.id, movementId));
  const types = (await getLookups(['task_type'])).task_type;
  const sug = await runAiTask('deadline_suggestion', buildDeadlinePrompt(text, types), ctx);
  if (!sug.ok || !sug.output.hasDeadline || !sug.output.actType) return { ok: sum.ok, summary: sum.ok, suggestion: false };
  const o = sug.output;
  const start = o.startDate && /^\d{4}-\d{2}-\d{2}$/.test(o.startDate) ? o.startDate : m.occurredAt.toISOString().slice(0, 10);
  const [c] = m.caseId ? await db.select({ state: cases.state, city: cases.city, court: cases.court }).from(cases).where(eq(cases.id, m.caseId)) : [];
  const dueDate = o.days && o.dayCount ? await computeDueDate(start, o.days, o.dayCount, c) : o.hearing?.date ?? o.dueDate ?? null;
  await db.insert(deadlineSuggestion).values({
    movementId, actType: canonicalOption(o.actType, types) ?? (o.actType as string), days: o.days ?? null, dayCount: o.dayCount ?? null, dueDate: dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null,
    legalBasis: o.legalBasis ?? null, confidence: o.confidence.toFixed(3), aiCallId: sug.aiCallId,
  });
  return { ok: true as const, summary: sum.ok, suggestion: true };
}

// ---------- triagem ----------
export type TriageFilters = { source?: string; state?: string; portfolio?: string; unlinked?: boolean; withSuggestion?: boolean };

export const TRIAGE_PAGE_SIZE = 20;

export async function listPendingMovements(f: TriageFilters, opts: { page?: number; pageSize?: number } = {}) {
  const size = opts.pageSize ?? TRIAGE_PAGE_SIZE;
  const conds: SQL[] = [eq(movement.triageStatus, 'pending')];
  if (f.source) conds.push(eq(movement.source, f.source as 'djen'));
  if (f.unlinked) conds.push(isNull(movement.caseId));
  if (f.portfolio) conds.push(eq(cases.portfolio, f.portfolio as 'civil'));
  if (f.state) conds.push(eq(cases.state, f.state.toUpperCase()));
  if (f.withSuggestion) conds.push(sql`exists (select 1 from deadline_suggestion d where d.movement_id = ${movement.id} and d.decision is null)`);
  const filtered = and(...conds);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(movement).leftJoin(cases, eq(cases.id, movement.caseId)).where(filtered);
  const page = Math.min(Math.max(1, opts.page ?? 1), Math.max(1, Math.ceil(total / size)));
  const rows = await db
    .select({
      id: movement.id, source: movement.source, occurredAt: movement.occurredAt, title: movement.title, rawText: movement.rawText,
      aiSummary: movement.aiSummary, caseId: movement.caseId, caseNumber: cases.number, portfolio: cases.portfolio, state: cases.state,
      termId: movement.matchedTermId,
      sugId: sql<string | null>`(select d.id from deadline_suggestion d where d.movement_id = ${movement.id} and d.decision is null order by d.created_at desc limit 1)`,
      sugAct: sql<string | null>`(select d.act_type from deadline_suggestion d where d.movement_id = ${movement.id} and d.decision is null order by d.created_at desc limit 1)`,
      sugDays: sql<number | null>`(select d.days from deadline_suggestion d where d.movement_id = ${movement.id} and d.decision is null order by d.created_at desc limit 1)`,
      sugCount: sql<string | null>`(select d.day_count from deadline_suggestion d where d.movement_id = ${movement.id} and d.decision is null order by d.created_at desc limit 1)`,
      sugDue: sql<string | null>`(select d.due_date from deadline_suggestion d where d.movement_id = ${movement.id} and d.decision is null order by d.created_at desc limit 1)`,
      sugBasis: sql<string | null>`(select d.legal_basis from deadline_suggestion d where d.movement_id = ${movement.id} and d.decision is null order by d.created_at desc limit 1)`,
      sugConf: sql<string | null>`(select d.confidence from deadline_suggestion d where d.movement_id = ${movement.id} and d.decision is null order by d.created_at desc limit 1)`,
    })
    .from(movement)
    .leftJoin(cases, eq(cases.id, movement.caseId))
    .where(filtered)
    .orderBy(desc(movement.occurredAt), desc(movement.id))
    .limit(size)
    .offset((page - 1) * size);
  return { rows, total, page, pageSize: size };
}

/** Alerta pendente de um processo cadastrado, para a tela de criar tarefa (nada se o alerta já foi tratado ou não tem processo). */
export async function getPendingMovement(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [m] = await db
    .select({
      id: movement.id, caseId: movement.caseId, caseNumber: cases.number, title: movement.title, rawText: movement.rawText,
      aiSummary: movement.aiSummary, occurredAt: movement.occurredAt,
      sugAct: sql<string | null>`(select d.act_type from deadline_suggestion d where d.movement_id = ${movement.id} and d.decision is null order by d.created_at desc limit 1)`,
    })
    .from(movement)
    .innerJoin(cases, eq(cases.id, movement.caseId))
    .where(and(eq(movement.id, id), eq(movement.triageStatus, 'pending')));
  return m ?? null;
}

export type PendingMovement = Awaited<ReturnType<typeof listPendingMovements>>['rows'][number];

/** Linha do tempo de um processo: todos os andamentos (pendentes, lidos, com tarefa, descartados), do mais recente ao mais antigo. */
export async function listCaseMovements(caseId: string) {
  return db
    .select({
      id: movement.id, source: movement.source, occurredAt: movement.occurredAt, title: movement.title, rawText: movement.rawText,
      aiSummary: movement.aiSummary, status: movement.triageStatus, discardReason: movement.discardReason, readAt: movement.readAt,
      readerName: sql<string | null>`(select name from "user" where id = ${movement.readBy})`,
      taskId: sql<string | null>`(select t.id from task t where t.movement_id = "movement"."id" order by t.created_at desc limit 1)`,
      taskTitle: sql<string | null>`(select t.title from task t where t.movement_id = "movement"."id" order by t.created_at desc limit 1)`,
      taskDue: sql<string | null>`(select t.due_date from task t where t.movement_id = "movement"."id" order by t.created_at desc limit 1)`,
    })
    .from(movement)
    .where(eq(movement.caseId, caseId))
    .orderBy(desc(movement.occurredAt), desc(movement.id));
}

/** RF-102: vincular a um processo existente (busca pelo número). */
export async function linkMovement(actorId: string, movementId: string, caseNumber: string) {
  const n = normalizeCaseNumber(caseNumber);
  const [c] = await db.select({ id: cases.id }).from(cases).where(and(eq(cases.number, n), isNull(cases.deletedAt))).limit(1);
  if (!c) return { ok: false as const, error: 'Processo não encontrado. Cadastre-o pela Triagem.' };
  // vincular NÃO tira da fila: o andamento segue pendente para a advogada criar a tarefa, marcar como lido ou descartar
  await db.update(movement).set({ caseId: c.id }).where(and(eq(movement.id, movementId), eq(movement.triageStatus, 'pending')));
  await audit({ actorId, entity: 'movement', entityId: movementId, action: 'update', diff: { after: { caseId: c.id } } });
  return { ok: true as const };
}

export async function discardMovements(actorId: string, ids: string[], reason: string) {
  if (!DISCARD_REASONS.includes(reason as never)) return { ok: false as const, error: 'Escolha o motivo do descarte.' };
  if (!ids.length) return { ok: false as const, error: 'Nada selecionado.' };
  await db.update(movement).set({ triageStatus: 'discarded', discardReason: reason, readBy: actorId, readAt: new Date() }).where(and(inArray(movement.id, ids), eq(movement.triageStatus, 'pending')));
  // um registro por alerta, para o histórico de cada um
  for (const id of ids) await audit({ actorId, entity: 'movement', entityId: id, action: 'update', diff: { reason, after: { triage: 'discarded' } } });
  return { ok: true as const, n: ids.length };
}

export async function markMovementsRead(actorId: string, ids: string[]) {
  if (!ids.length) return;
  await db.update(movement).set({ triageStatus: 'linked', readBy: actorId, readAt: new Date() }).where(and(inArray(movement.id, ids), eq(movement.triageStatus, 'pending')));
  await audit({ actorId, entity: 'movement', action: 'update', diff: { read: ids } });
}

/**
 * RF-04: Confirmar prazo cria a tarefa e grava `accepted`; Ajustar grava `edited`. Nada vira tarefa sem este clique.
 */
export async function decideSuggestion(actorId: string, suggestionId: string, decision: 'accepted' | 'edited' | 'rejected', finalDue?: string | null) {
  const [s] = await db.select().from(deadlineSuggestion).where(eq(deadlineSuggestion.id, suggestionId));
  if (!s || s.decision) return { ok: false as const, error: 'Sugestão já decidida.' };
  const [m] = await db.select().from(movement).where(eq(movement.id, s.movementId));
  const due = decision === 'edited' ? finalDue : s.dueDate;
  if (decision !== 'rejected' && (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due))) return { ok: false as const, error: 'Informe uma data de prazo válida.' };

  let taskId: string | null = null;
  if (decision !== 'rejected') {
    const [t] = await db.select({ id: lookup.id }).from(lookup).where(and(eq(lookup.type, 'task_type'), sql`lower(${lookup.label}) = lower(${s.actType})`)).limit(1);
    const [created] = await db.insert(task).values({
      title: s.actType, caseId: m?.caseId ?? null, movementId: s.movementId, typeId: t?.id ?? null, dueDate: due!, origin: 'ai_suggestion', status: 'todo',
      internalDueDate: await internalDateFor(t?.id ?? null, due!), // prazo interno automático do tipo, quando houver a regra
    }).returning({ id: task.id });
    taskId = created.id;
    await db.update(movement).set({ triageStatus: 'task_created', readBy: actorId, readAt: new Date() }).where(eq(movement.id, s.movementId));
  }
  await db.update(deadlineSuggestion).set({ decision, decidedBy: actorId, decidedAt: new Date(), finalDueDate: decision === 'rejected' ? null : due }).where(eq(deadlineSuggestion.id, suggestionId));
  if (s.aiCallId) await markAccepted(s.aiCallId, decision === 'accepted');
  await audit({ actorId, entity: 'deadline_suggestion', entityId: suggestionId, action: decision === 'accepted' ? 'ai_accept' : decision === 'edited' ? 'ai_edit' : 'ai_reject', diff: { suggested: s.dueDate, final: due ?? null, taskId } });
  return { ok: true as const, taskId };
}

/**
 * Criação MANUAL de tarefa a partir de um andamento (não depende da IA). O prazo vem de uma data escolhida OU de "N dias úteis/corridos"
 * contados da data da publicação, sempre calculados pelo sistema com o calendário de feriados (regra 2).
 */
export async function createTaskFromMovement(actorId: string, movementId: string, raw: Record<string, string>) {
  const [m] = await db.select().from(movement).where(eq(movement.id, movementId));
  if (!m) return { ok: false as const, error: 'Andamento não encontrado.' };
  if (!m.caseId) return { ok: false as const, error: 'Vincule o andamento a um processo antes de criar a tarefa.' };
  const title = (raw.title ?? '').trim();
  if (title.length < 3) return { ok: false as const, error: 'Informe o título da tarefa.' };
  let due = (raw.dueDate ?? '').trim();
  if (raw.days?.trim()) {
    const days = Number(raw.days);
    if (!Number.isInteger(days) || days < 1 || days > 365) return { ok: false as const, error: 'Dias do prazo: informe um número entre 1 e 365.' };
    const [c] = await db.select({ state: cases.state, city: cases.city, court: cases.court }).from(cases).where(eq(cases.id, m.caseId));
    due = await computeDueDate(m.occurredAt.toISOString().slice(0, 10), days, raw.dayCount === 'calendar' ? 'calendar' : 'business', c);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return { ok: false as const, error: 'Informe a data do prazo ou o número de dias.' };
  const res = await createTask(actorId, { title, caseId: m.caseId, typeId: raw.typeId ?? '', dueDate: due, internalDueDate: raw.internalDueDate ?? '', dueTime: '', ownerId: raw.ownerId ?? '', reviewerId: '' });
  if (!res.ok) return res;
  await db.update(task).set({ movementId }).where(eq(task.id, res.id));
  await db.update(movement).set({ triageStatus: 'task_created', readBy: actorId, readAt: new Date() }).where(eq(movement.id, movementId));
  await audit({ actorId, entity: 'movement', entityId: movementId, action: 'update', diff: { after: { triage: 'task_created', taskId: res.id, dueDate: due } } });
  return { ok: true as const, taskId: res.id, dueDate: due };
}

/** Aviso "conferir feriados locais": vale para processos de UF sem calendário local cadastrado (ou sem UF). */
export async function localHolidayWarnings() {
  const have = await statesWithLocalCalendar();
  return (state?: string | null) => !state || !have.has(state.toUpperCase());
}

export { addDays, todayInSaoPaulo };

export async function pendingTriageCount() {
  const [r] = await db.execute<{ n: number }>(sql`select count(*)::int as n from movement where triage_status = 'pending'`).then((x) => x.rows);
  return r?.n ?? 0;
}
