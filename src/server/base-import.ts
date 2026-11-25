import ExcelJS from 'exceljs';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { user } from '@/db/schema';
import { caseCivil, caseLabor, caseParty, caseProcon, caseRisk, cases, rentalLink } from '@/db/schema/case';
import { baseImport } from '@/db/schema/inbox';
import { lookup } from '@/db/schema/lookups';
import { audit } from '@/lib/audit';
import { autoColumns, buildRecords, defaultConfig, headersOf, sanitizeConfig, type ImportConfig } from '@/lib/migration/base-import';
import { isImportable, norm, type CaseRecord, type Issue } from '@/lib/migration/spreadsheet';
import { storage } from '@/lib/storage';
import { linkOpenInboxItems } from './inbox';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export async function loadWorkbook(buffer: Buffer | ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  return wb;
}

// ---------- lote ----------
export async function createBatch(actorId: string, fileName: string, buffer: Buffer) {
  if (!/\.xlsx$/i.test(fileName)) return { ok: false as const, error: 'Envie um arquivo Excel (.xlsx).' };
  if (buffer.length === 0) return { ok: false as const, error: 'O arquivo está vazio.' };
  if (buffer.length > MAX_FILE_BYTES) return { ok: false as const, error: 'O arquivo passa de 25 MB.' };
  let wb: ExcelJS.Workbook;
  try { wb = await loadWorkbook(buffer); } catch { return { ok: false as const, error: 'Não consegui ler o arquivo. Confira se é um .xlsx válido.' }; }
  if (!wb.worksheets.length) return { ok: false as const, error: 'A planilha não tem abas.' };
  const fileKey = `imports/${crypto.randomUUID()}.xlsx`;
  await storage().put(fileKey, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const [row] = await db.insert(baseImport).values({ fileName: fileName.slice(0, 200), fileKey, uploadedBy: actorId, config: defaultConfig(wb) }).returning({ id: baseImport.id });
  await audit({ actorId, entity: 'base_import', entityId: row.id, action: 'create', diff: { after: { fileName } } });
  return { ok: true as const, id: row.id };
}

export async function getBatch(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [b] = await db.select().from(baseImport).where(eq(baseImport.id, id));
  return b ?? null;
}

export const listBatches = () => db.select().from(baseImport).orderBy(desc(baseImport.createdAt)).limit(30);

export async function batchWorkbook(batch: { fileKey: string }) {
  return loadWorkbook(await storage().get(batch.fileKey));
}

/** Guarda o de-para escolhido. Se a linha do cabeçalho de uma aba mudou, as colunas dela voltam à sugestão automática para a nova linha. */
export async function saveConfig(actorId: string, id: string, raw: unknown) {
  const batch = await getBatch(id);
  if (!batch) return { ok: false as const, error: 'Importação não encontrada.' };
  if (batch.status !== 'draft') return { ok: false as const, error: 'Esta importação já foi executada.' };
  const wb = await batchWorkbook(batch);
  const before = (batch.config ?? { sheets: [] }) as ImportConfig;
  const cfg = sanitizeConfig(raw, wb);
  for (const s of cfg.sheets) {
    const old = before.sheets.find((x) => x.name === s.name);
    if (old && old.headerRow !== s.headerRow) {
      const ws = wb.getWorksheet(s.name);
      if (ws) s.columns = autoColumns(ws, s.headerRow);
    }
  }
  await db.update(baseImport).set({ config: cfg }).where(eq(baseImport.id, id));
  await audit({ actorId, entity: 'base_import', entityId: id, action: 'update', diff: { config: { sheets: cfg.sheets.filter((s) => s.use).map((s) => s.name) } } });
  return { ok: true as const };
}

/** Linha de cabeçalho e títulos de cada aba, para montar os seletores de coluna. */
export function sheetHeaders(wb: ExcelJS.Workbook, config: ImportConfig) {
  return Object.fromEntries(config.sheets.map((s) => {
    const ws = wb.getWorksheet(s.name);
    return [s.name, { rows: ws?.rowCount ?? 0, headers: ws ? headersOf(ws, s.headerRow) : [] }];
  }));
}

// ---------- listas oficiais e advogadas ----------
const LIST_OF_FIELD = { system: 'system', courtType: 'court_type', status: 'status', subject: 'subject', claim: 'claim', closingReason: 'closing_reason', rentalType: 'rental_type' } as const;

async function resolvers() {
  const lookups = await db.select().from(lookup);
  const users = await db.select().from(user);
  const unknown = new Map<string, Set<string>>();
  const find = (type: string, label: string | null) => {
    if (!label) return null;
    const hit = lookups.find((l) => l.type === type && norm(l.label) === norm(label));
    if (!hit) {
      const set = unknown.get(type) ?? new Set<string>();
      set.add(label);
      unknown.set(type, set);
    }
    return hit?.id ?? null;
  };
  const findUser = (name: string | null) => {
    if (!name) return null;
    const n = norm(name);
    return users.find((u) => norm(u.name) === n) ?? users.find((u) => norm(u.name).split(' ')[0] === n.split(' ')[0] && n.split(' ').length === 1) ?? null;
  };
  return { find, findUser, unknown };
}

const isClosed = (r: CaseRecord) => r.closedSheet || !!r.closedAt || (r.status ? /ENCERR|ARQUIV|EXTINT/.test(norm(r.status)) : false) || r.active === false;

export type IssueRow = Issue & { sheet: string; row: number; number: string };
const issueRows = (records: CaseRecord[]): IssueRow[] => records.flatMap((r) => r.issues.map((i) => ({ ...i, sheet: r.sheet, row: r.row, number: r.number })));

// ---------- prévia (só leitura) ----------
export async function previewRecords(records: CaseRecord[], notes: string[] = []) {
  const importable = records.filter(isImportable);
  const numbers = [...new Set(importable.map((r) => r.number))];
  const existing = new Set<string>();
  for (let i = 0; i < numbers.length; i += 1000) {
    const rows = await db.select({ n: cases.number, p: cases.portfolio }).from(cases).where(and(inArray(cases.number, numbers.slice(i, i + 1000)), isNull(cases.deletedAt)));
    rows.forEach((x) => existing.add(`${x.p}:${x.n}`));
  }
  const { find, findUser, unknown } = await resolvers();
  const noOwner = new Set<string>();
  for (const r of importable) {
    for (const [field, type] of Object.entries(LIST_OF_FIELD)) find(type, (r as unknown as Record<string, string | null>)[field]);
    if (r.owner && !findUser(r.owner)) noOwner.add(r.owner);
  }
  const sheets = [...new Set(records.map((r) => r.sheet))].map((name) => {
    const rs = records.filter((r) => r.sheet === name);
    return {
      name, total: rs.length, importable: rs.filter(isImportable).length, blocked: rs.filter((r) => !isImportable(r)).length,
      closed: rs.filter((r) => isImportable(r) && isClosed(r)).length, warnings: rs.filter((r) => r.issues.some((i) => i.severity === 'aviso')).length,
    };
  });
  const toCreate = importable.filter((r) => !existing.has(`${r.portfolio}:${r.number}`));
  return {
    notes, sheets, total: records.length, importable: importable.length, blocked: records.length - importable.length,
    existing: importable.length - toCreate.length, toCreate: toCreate.length, toCreateClosed: toCreate.filter(isClosed).length,
    unknown: [...unknown].map(([type, set]) => ({ type, values: [...set].sort() })), noOwner: [...noOwner].sort(),
    issues: issueRows(records),
  };
}
export type Preview = Awaited<ReturnType<typeof previewRecords>>;

// ---------- gravação (tela e linha de comando) ----------
export async function writeRecords(records: CaseRecord[], opts: { actorId?: string | null; onProgress?: (done: number, total: number) => void | Promise<void> } = {}) {
  const { find, findUser, unknown } = await resolvers();
  const stats = { created: 0, existing: 0, blocked: 0, createdClosed: 0, inboxLinked: 0, publicationsLinked: 0 };
  const noOwner = new Set<string>();
  let done = 0;
  for (const r of records) {
    done++;
    if (done % 25 === 0) await opts.onProgress?.(done, records.length);
    if (!isImportable(r)) { stats.blocked++; continue; }
    const [exists] = await db.select({ id: cases.id }).from(cases).where(and(eq(cases.number, r.number), eq(cases.portfolio, r.portfolio), isNull(cases.deletedAt))).limit(1);
    if (exists) { stats.existing++; continue; }

    const closed = isClosed(r);
    const owner = findUser(r.owner);
    if (r.owner && !owner) {
      noOwner.add(r.owner);
      r.issues.push({ severity: 'aviso', code: 'advogada_sem_usuario', message: `Advogada "${r.owner}" sem usuário correspondente (gravada em escritório externo)` });
    }
    const caseId = await db.transaction(async (tx) => {
      const [c] = await tx.insert(cases).values({
        number: r.number, portfolio: r.portfolio, polarity: r.polarity,
        systemId: find('system', r.system), courtTypeId: find('court_type', r.courtType),
        state: r.state, city: r.city, court: r.court,
        statusId: find('status', r.status ?? (closed ? 'Encerrado' : 'Em andamento')),
        contingencyStatusId: find('contingency_status', closed ? 'Encerrado' : 'Em andamento'),
        ownerId: owner?.id ?? null, externalFirm: r.owner && !owner ? r.owner : null,
        receivedAt: r.receivedAt, citedAt: r.citedAt, closedAt: r.closedAt ?? null,
        closingReasonId: find('closing_reason', r.closingReason), costCenter: r.costCenter, details: r.details,
        source: 'migration', monitoring: !closed, // concluído entra só para consulta, sem monitoramento
      }).returning({ id: cases.id });
      if (r.portfolio === 'civil') {
        await tx.insert(caseCivil).values({
          caseId: c.id, subjectId: find('subject', r.subject), claimId: find('claim', r.claim), avoidable: r.avoidable,
          rootCause: r.rootCause, rentalTypeId: find('rental_type', r.rentalType),
        });
      } else if (r.portfolio === 'labor') await tx.insert(caseLabor).values({ caseId: c.id });
      else await tx.insert(caseProcon).values({ caseId: c.id });
      if (r.plaintiff) await tx.insert(caseParty).values({ caseId: c.id, role: 'plaintiff', name: r.plaintiff });
      if (r.prognosis || r.riskTotal !== null || r.claimValue !== null) {
        await tx.insert(caseRisk).values({
          caseId: c.id, prognosis: r.prognosis, riskTotal: r.riskTotal?.toFixed(2) ?? null, riskMaterial: r.riskMaterial?.toFixed(2) ?? null,
          riskMoral: r.riskMoral?.toFixed(2) ?? null, claimValue: r.claimValue?.toFixed(2) ?? null,
        });
      }
      for (const code of r.contracts) {
        await tx.insert(rentalLink).values({ caseId: c.id, contractCode: code, plate: r.plate, vehicleModel: r.vehicleModel, rentalType: r.rentalType, source: 'ai' });
      }
      return c.id;
    });
    stats.created++;
    if (closed) stats.createdClosed++;
    // itens que esperavam na Triagem com este número passam a ser do processo; as publicações viram histórico dele (sem alerta)
    const h = await linkOpenInboxItems(caseId, r.number, opts.actorId ?? null);
    stats.inboxLinked += h.items;
    stats.publicationsLinked += h.publications;
  }
  await opts.onProgress?.(records.length, records.length);
  return { stats, unknown: [...unknown].map(([type, set]) => ({ type, values: [...set].sort() })), noOwner: [...noOwner].sort(), issues: issueRows(records) };
}

// ---------- execução em segundo plano ----------
export async function startImport(actorId: string, id: string) {
  const [claimed] = await db.update(baseImport).set({ status: 'running', error: null, progressDone: 0 }).where(and(eq(baseImport.id, id), eq(baseImport.status, 'draft'))).returning({ id: baseImport.id });
  if (!claimed) return { ok: false as const, error: 'Esta importação já foi iniciada.' };
  await audit({ actorId, entity: 'base_import', entityId: id, action: 'update', diff: { status: { before: 'draft', after: 'running' } } });
  return { ok: true as const };
}

export async function runImport(id: string, actorId: string | null = null) {
  const batch = await getBatch(id);
  if (!batch || batch.status !== 'running') return { ok: false as const, error: 'Importação não está em execução.' };
  try {
    const wb = await batchWorkbook(batch);
    const { records, notes } = buildRecords(wb, (batch.config ?? { sheets: [] }) as ImportConfig);
    await db.update(baseImport).set({ progressTotal: records.length, progressDone: 0 }).where(eq(baseImport.id, id));
    const res = await writeRecords(records, {
      actorId: actorId ?? batch.uploadedBy,
      onProgress: async (done) => { await db.update(baseImport).set({ progressDone: done }).where(eq(baseImport.id, id)); },
    });
    await db.update(baseImport).set({
      status: 'done', finishedAt: new Date(), progressDone: records.length, summary: { ...res.stats, total: records.length },
      report: { notes, unknown: res.unknown, noOwner: res.noOwner, issues: res.issues.slice(0, 5000), issuesTotal: res.issues.length },
    }).where(eq(baseImport.id, id));
    await audit({ actorId: actorId ?? batch.uploadedBy, entity: 'migration', entityId: id, action: 'create', diff: { file: batch.fileName, ...res.stats } });
    return { ok: true as const, ...res.stats };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(baseImport).set({ status: 'error', error: msg.slice(0, 1000), finishedAt: new Date() }).where(eq(baseImport.id, id));
    return { ok: false as const, error: msg };
  }
}

/** Relatório de exceções em Excel (o mesmo formato do relatório da linha de comando). */
export async function reportWorkbook(batch: { fileName: string; summary: unknown; report: unknown }) {
  const rep = (batch.report ?? {}) as { issues?: IssueRow[]; unknown?: { type: string; values: string[] }[]; noOwner?: string[]; notes?: string[] };
  const sum = (batch.summary ?? {}) as Record<string, number>;
  const out = new ExcelJS.Workbook();
  const s = out.addWorksheet('Resumo');
  s.addRows([
    ['Arquivo', batch.fileName], ['Linhas lidas', sum.total ?? 0], ['Criados', sum.created ?? 0], ['  dos quais concluídos (sem monitoramento)', sum.createdClosed ?? 0],
    ['Já existiam', sum.existing ?? 0], ['Bloqueados (exceção grave)', sum.blocked ?? 0],
    ['Itens da Triagem ligados ao processo', sum.inboxLinked ?? 0], ['Publicações deles guardadas no histórico dos processos', sum.publicationsLinked ?? 0], ['Avisos da leitura', (rep.notes ?? []).join(' | ')],
  ]);
  s.getColumn(1).width = 42; s.getColumn(1).font = { bold: true }; s.getColumn(2).width = 40;
  const ex = out.addWorksheet('Exceções');
  ex.columns = [
    { header: 'Aba', key: 'sheet', width: 18 }, { header: 'Linha', key: 'row', width: 8 }, { header: 'Processo', key: 'number', width: 26 },
    { header: 'Gravidade', key: 'severity', width: 11 }, { header: 'Código', key: 'code', width: 24 }, { header: 'Mensagem', key: 'message', width: 90 },
    { header: 'Decisão do Jurídico', key: 'decision', width: 30 },
  ];
  ex.getRow(1).font = { bold: true };
  (rep.issues ?? []).forEach((i) => ex.addRow(i));
  if (rep.unknown?.length) {
    const un = out.addWorksheet('Valores fora das listas');
    un.columns = [{ header: 'Lista', key: 'type', width: 24 }, { header: 'Valor da planilha', key: 'value', width: 50 }, { header: 'Aprovar / mapear para', key: 'map', width: 40 }];
    un.getRow(1).font = { bold: true };
    rep.unknown.forEach((u) => u.values.forEach((value) => un.addRow({ type: u.type, value })));
  }
  if (rep.noOwner?.length) {
    const no = out.addWorksheet('Advogadas sem usuário');
    no.columns = [{ header: 'Nome na planilha', key: 'n', width: 40 }];
    no.getRow(1).font = { bold: true };
    rep.noOwner.forEach((n) => no.addRow({ n }));
  }
  return out;
}
