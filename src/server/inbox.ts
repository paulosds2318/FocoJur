import ExcelJS from 'exceljs';
import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { Readable } from 'node:stream';
import { db } from '@/db';
import { user } from '@/db/schema';
import { cases } from '@/db/schema/case';
import { importBatch, inboxItem } from '@/db/schema/inbox';
import { audit } from '@/lib/audit';
import { normalizeCaseNumber } from '@/lib/case-number';
import { mapHeaders, rowToRecord, type CaseRecord } from '@/lib/migration/spreadsheet';
import { caseFormSchema, createCase } from './cases';
import { withRiskFormula } from './risk';

export type InboxSource = 'projuris_api' | 'import' | 'djen_term' | 'domicilio' | 'manual';
export type InboxStatus = 'new' | 'in_review' | 'possible_duplicate' | 'confirmed' | 'discarded';

export type Parsed = Partial<{
  portfolio: 'civil' | 'labor' | 'procon'; system: string; state: string; city: string; court: string; plaintiff: string;
  claimValue: number; details: string; costCenter: string; contracts: string[]; subject: string; claim: string;
  prognosis: string; distributedAt: string; obtainedBy: string; nameVariation: string;
}>;

/** Procura o número (normalizado) entre processos cadastrados e outros itens ainda abertos na caixa. */
export async function findDuplicate(number: string, exceptItemId?: string) {
  const [c] = await db.select({ id: cases.id }).from(cases).where(and(eq(cases.number, number), isNull(cases.deletedAt))).limit(1);
  if (c) return { caseId: c.id, itemId: null };
  const conds: SQL[] = [eq(inboxItem.caseNumber, number), inArray(inboxItem.status, ['new', 'in_review', 'possible_duplicate', 'confirmed'])];
  const [i] = await db.select({ id: inboxItem.id }).from(inboxItem).where(and(...conds)).limit(1);
  return i && i.id !== exceptItemId ? { caseId: null, itemId: i.id } : null;
}

/** Publicação do diário guardada no item da caixa até a advogada confirmar o processo. */
export type Publication = { id: string; data: string; tipo: string; orgao: string; texto: string; link: string };

/** RF-11: duplicado pelo número normalizado. Retorna o item criado e se foi marcado como duplicado. */
export async function addInboxItem(input: {
  source: InboxSource; caseNumber: string; parsed?: Parsed; payload?: unknown; externalId?: string | null; importBatchId?: string | null;
}) {
  const number = normalizeCaseNumber(input.caseNumber);
  if (number.length < 5) return { ok: false as const, error: 'Número do processo inválido.' };
  if (input.externalId) {
    const [same] = await db.select({ id: inboxItem.id }).from(inboxItem).where(and(eq(inboxItem.source, input.source), eq(inboxItem.externalId, input.externalId))).limit(1);
    if (same) return { ok: true as const, id: same.id, duplicate: true, skipped: true };
  }
  // várias publicações do mesmo processo ainda não cadastrado ficam num item só (a nova entra na lista de publicações)
  const pubs = (input.payload as { publications?: Publication[] } | undefined)?.publications;
  if (input.source === 'djen_term' && pubs?.length) {
    const [open] = await db.select().from(inboxItem)
      .where(and(eq(inboxItem.caseNumber, number), eq(inboxItem.source, 'djen_term'), inArray(inboxItem.status, ['new', 'in_review', 'possible_duplicate']))).limit(1);
    if (open) {
      const cur = (open.payload ?? {}) as { publications?: Publication[] };
      const have = new Set((cur.publications ?? []).map((p) => p.id));
      const novas = pubs.filter((p) => !have.has(p.id));
      if (novas.length) await db.update(inboxItem).set({ payload: { ...cur, publications: [...(cur.publications ?? []), ...novas] } }).where(eq(inboxItem.id, open.id));
      return { ok: true as const, id: open.id, duplicate: false, skipped: true, grouped: novas.length > 0 };
    }
  }
  const dup = await findDuplicate(number);
  const [row] = await db
    .insert(inboxItem)
    .values({
      source: input.source, caseNumber: number, parsed: input.parsed ?? {}, payload: input.payload ?? null,
      externalId: input.externalId ?? null, importBatchId: input.importBatchId ?? null,
      status: dup ? 'possible_duplicate' : 'new', duplicateOf: dup?.caseId ?? null,
    })
    .returning({ id: inboxItem.id });
  return { ok: true as const, id: row.id, duplicate: !!dup, skipped: false, grouped: false };
}

export type InboxFilter = 'all' | 'projuris' | 'domicilio' | 'djen' | 'duplicate' | 'discarded';

export const INBOX_PAGE_SIZE = 25;

/** Itens da caixa com paginação no servidor e busca por número do processo ou nome da parte. */
export async function listInbox(filter: InboxFilter, opts: { page?: number; q?: string } = {}) {
  const open: SQL = inArray(inboxItem.status, ['new', 'in_review', 'possible_duplicate']);
  const byFilter: SQL | undefined =
    filter === 'discarded' ? eq(inboxItem.status, 'discarded')
    : filter === 'duplicate' ? eq(inboxItem.status, 'possible_duplicate')
    : filter === 'projuris' ? and(open, inArray(inboxItem.source, ['projuris_api', 'import']))
    : filter === 'domicilio' ? and(open, eq(inboxItem.source, 'domicilio'))
    : filter === 'djen' ? and(open, eq(inboxItem.source, 'djen_term'))
    : open;
  const q = opts.q?.trim();
  const digits = q ? normalizeCaseNumber(q) : '';
  const bySearch: SQL | undefined = q
    ? or(digits.length >= 4 ? ilike(inboxItem.caseNumber, `%${digits}%`) : undefined, sql`${inboxItem.parsed}->>'plaintiff' ilike ${`%${q}%`}`, sql`${inboxItem.parsed}->>'court' ilike ${`%${q}%`}`)
    : undefined;
  const where = and(byFilter, bySearch);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(inboxItem).where(where);
  const pages = Math.max(1, Math.ceil(total / INBOX_PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page ?? 1), pages);
  const rows = await db.select().from(inboxItem).where(where).orderBy(desc(inboxItem.capturedAt), desc(inboxItem.id)).limit(INBOX_PAGE_SIZE).offset((page - 1) * INBOX_PAGE_SIZE);
  return { rows, total, page, pageSize: INBOX_PAGE_SIZE };
}

export async function inboxCounts() {
  const rows = (await db.execute<{ k: string; n: number }>(sql`
    select case when status = 'discarded' then 'discarded' when status = 'possible_duplicate' then 'duplicate'
      when source in ('projuris_api','import') then 'projuris' when source = 'domicilio' then 'domicilio'
      when source = 'djen_term' then 'djen' else 'manual' end as k, count(*)::int as n
    from inbox_item where status in ('new','in_review','possible_duplicate','discarded') group by 1`)).rows;
  const get = (k: string) => rows.find((r) => r.k === k)?.n ?? 0;
  const [{ open }] = (await db.execute<{ open: number }>(sql`select count(*)::int as open from inbox_item where status in ('new','in_review','possible_duplicate')`)).rows;
  return { all: open, projuris: get('projuris'), domicilio: get('domicilio'), djen: get('djen'), duplicate: get('duplicate'), discarded: get('discarded') };
}

export async function getInboxItem(id: string) {
  const [item] = await db.select().from(inboxItem).where(eq(inboxItem.id, id));
  return item ?? null;
}

/** RF-14: confirmar cria `case` + extensão + vínculo de contrato e marca o item como confirmado. */
export async function confirmInboxItem(actorId: string, itemId: string, raw: Record<string, string>) {
  const item = await getInboxItem(itemId);
  if (!item || item.status === 'confirmed' || item.status === 'discarded') return { ok: false as const, error: 'Item já tratado.' };
  // campos que o painel de revisão não mostra entram vazios (o schema exige a chave)
  const blank = Object.fromEntries(['systemId', 'courtTypeId', 'state', 'city', 'court', 'ownerId', 'receivedAt', 'citedAt', 'costCenter', 'details', 'plaintiff', 'subjectId', 'claimId', 'riskTotal', 'riskMaterial', 'riskMoral', 'claimValue', 'contractCode'].map((k) => [k, '']));
  const parsed = caseFormSchema.safeParse(await withRiskFormula({ ...blank, prognosis: '', portfolio: 'civil', ...raw, number: item.caseNumber ?? raw.number }));
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message, field: String(parsed.error.issues[0].path[0]) };
  const res = await createCase(actorId, parsed.data);
  if (!res.ok) return res;
  await db.update(cases).set({ source: item.source === 'import' ? 'import' : item.source === 'manual' ? 'manual' : item.source }).where(eq(cases.id, res.id));
  await db.update(inboxItem).set({ status: 'confirmed', caseId: res.id, reviewedBy: actorId }).where(eq(inboxItem.id, itemId));
  // as publicações recebidas antes do cadastro viram movimentações do processo (vão para a triagem, com resumo e prazo por IA)
  const pubs = ((item.payload ?? {}) as { publications?: Publication[] }).publications ?? [];
  const { ingestMovement } = await import('./movements');
  for (const pub of pubs) {
    await ingestMovement({ source: 'djen', externalId: `djen:${pub.id}`, caseNumber: item.caseNumber ?? '', occurredAt: pub.data ? new Date(pub.data) : new Date(), title: pub.tipo, rawText: pub.texto, alreadyRead: { by: actorId } });
  }
  await audit({ actorId, entity: 'inbox_item', entityId: itemId, action: 'update', diff: { after: { status: 'confirmed', caseId: res.id } } });
  return { ok: true as const, caseId: res.id };
}

export async function markInboxDuplicate(actorId: string, itemId: string) {
  await db.update(inboxItem).set({ status: 'discarded', reviewedBy: actorId }).where(eq(inboxItem.id, itemId));
  await audit({ actorId, entity: 'inbox_item', entityId: itemId, action: 'update', diff: { after: { status: 'discarded', reason: 'duplicado' } } });
}

export async function discardInboxItem(actorId: string, itemId: string) {
  await db.update(inboxItem).set({ status: 'discarded', reviewedBy: actorId }).where(eq(inboxItem.id, itemId));
  await audit({ actorId, entity: 'inbox_item', entityId: itemId, action: 'update', diff: { after: { status: 'discarded' } } });
}

// ---------- RF-19a: importação em lote (Excel/CSV exportado do Projuris) ----------
function recordToParsed(r: CaseRecord): Parsed {
  return {
    portfolio: r.portfolio, system: r.system ?? undefined, state: r.state ?? undefined, city: r.city ?? undefined, court: r.court ?? undefined,
    plaintiff: r.plaintiff ?? undefined, claimValue: r.claimValue ?? undefined, details: r.details ?? undefined, costCenter: r.costCenter ?? undefined,
    contracts: r.contracts, subject: r.subject ?? undefined, claim: r.claim ?? undefined, distributedAt: r.receivedAt ?? undefined,
  };
}

export async function importProjurisFile(actorId: string, fileName: string, buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    if (/\.csv$/i.test(fileName)) await wb.csv.read(Readable.from(buffer));
    else await wb.xlsx.load(buffer as never);
  } catch {
    return { ok: false as const, error: 'Não foi possível ler o arquivo. Envie um Excel (.xlsx) ou CSV.' };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { ok: false as const, error: 'O arquivo está vazio.' };

  let headerRow = 0;
  let idx: Record<string, number> = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const m = mapHeaders((ws.getRow(r).values as unknown[]).slice(1));
    if (m.number !== undefined) { headerRow = r; idx = m; break; }
  }
  if (!headerRow) return { ok: false as const, error: 'Não encontrei a coluna do número do processo (ex.: "Número do Processo").' };

  const [batch] = await db.insert(importBatch).values({ source: 'projuris_export', uploadedBy: actorId, fileKey: fileName }).returning({ id: importBatch.id });
  const report: { row: number; number: string; result: 'novo' | 'duplicado' | 'erro'; detail?: string }[] = [];
  const stats = { total: 0, novo: 0, duplicado: 0, erro: 0 };

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const cells = (ws.getRow(r).values as unknown[]).slice(1);
    const rec = rowToRecord(ws.name, r, { portfolio: 'civil' }, idx, cells);
    if (!rec) continue;
    stats.total++;
    // o Projuris não traz a carteira: entra como Cível e a advogada confirma ao revisar
    const res = await addInboxItem({ source: 'import', caseNumber: rec.number, parsed: recordToParsed(rec), importBatchId: batch.id, payload: { row: r } });
    if (!res.ok) { stats.erro++; report.push({ row: r, number: rec.number, result: 'erro', detail: res.error }); }
    else if (res.duplicate) { stats.duplicado++; report.push({ row: r, number: rec.number, result: 'duplicado' }); }
    else { stats.novo++; report.push({ row: r, number: rec.number, result: 'novo' }); }
  }
  await db.update(importBatch).set({ rowsTotal: stats.total, rowsNew: stats.novo, rowsDuplicate: stats.duplicado, rowsError: stats.erro, report }).where(eq(importBatch.id, batch.id));
  await audit({ actorId, entity: 'import_batch', entityId: batch.id, action: 'create', diff: { file: fileName, ...stats } });
  return { ok: true as const, batchId: batch.id, ...stats };
}

export async function ownersForReview() {
  return (await db.select().from(user)).filter((u) => u.role !== 'viewer' && u.active !== false);
}

/**
 * Ao cadastrar um processo por importação: itens que estavam esperando na Triagem com o mesmo número são ligados a ele. As publicações
 * viram andamentos do processo já como lidos (histórico, sem alerta: só as atualizações seguintes geram alerta) e o item fica confirmado.
 */
export async function linkOpenInboxItems(caseId: string, caseNumber: string, actorId?: string | null) {
  const number = normalizeCaseNumber(caseNumber);
  const items = await db.select().from(inboxItem).where(and(eq(inboxItem.caseNumber, number), inArray(inboxItem.status, ['new', 'in_review', 'possible_duplicate'])));
  if (!items.length) return { items: 0, alerts: 0, publications: 0 };
  const { ingestMovement } = await import('./movements');
  let publications = 0;
  for (const it of items) {
    const pubs = ((it.payload ?? {}) as { publications?: Publication[] }).publications ?? [];
    for (const p of pubs) {
      const r = await ingestMovement({ source: 'djen', externalId: `djen:${p.id}`, caseNumber: number, occurredAt: p.data ? new Date(p.data) : new Date(), title: p.tipo, rawText: p.texto, alreadyRead: { by: actorId ?? null } });
      if (r.created) publications++;
    }
    await db.update(inboxItem).set({ status: 'confirmed', caseId, reviewedBy: actorId ?? null }).where(eq(inboxItem.id, it.id));
  }
  await audit({ actorId: actorId ?? null, entity: 'case', entityId: caseId, action: 'update', diff: { inboxLinked: { items: items.length, publications } } });
  return { items: items.length, alerts: 0, publications };
}
