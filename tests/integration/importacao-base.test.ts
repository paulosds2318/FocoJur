import 'dotenv/config';
import ExcelJS from 'exceljs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq, like, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Importação da base atual pela tela: envio, mapeamento, prévia, execução, concluídos sem monitoramento e ligação dos itens da Triagem. */
const PFX = '99844';
const N = (i: number) => `${PFX}${String(i).padStart(3, '0')}0220268210001`.padEnd(20, '0').slice(0, 20); // 20 dígitos
const fmt = (d: string) => `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
const HEADERS = ['Número do processo', 'Advogada responsável', 'Sistema', 'UF', 'Vara', 'Demandante', 'Objeto', 'Prognóstico', 'Valor da causa', 'Valor de risco', 'Status'];

let adminId: string;
const batchIds: string[] = [];

async function planilha() {
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet('Cível 2026');
  a.addRow(HEADERS);
  a.addRow([fmt(N(1)), 'Pessoa Que Nao Existe', 'PJe', 'RS', '1ª Vara', 'Fulano', 'No show', 'Possível', 1000, 500, 'Em andamento']);
  a.addRow([fmt(N(2)), '', 'eProc', 'RS', '2ª Vara', 'Beltrano', 'Objeto Inventado Teste', 'Provável', 2000, 2000, 'Em andamento']);
  const b = wb.addWorksheet('Cível encerrados');
  b.addRow(HEADERS);
  b.addRow([fmt(N(3)), '', 'PJe', 'RS', '1ª Vara', 'Cicrano', 'No show', 'Remoto', 3000, 0, 'Encerrado']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function limpa() {
  const { db } = await import('@/db');
  const { cases } = await import('@/db/schema/case');
  const { inboxItem, baseImport } = await import('@/db/schema/inbox');
  const { movement } = await import('@/db/schema/movement');
  const { auditLog } = await import('@/db/schema');
  const ids = batchIds.length ? batchIds : [];
  await db.execute(sql`delete from movement where case_id in (select id from "case" where number like ${PFX + '%'})`);
  await db.delete(movement).where(like(movement.externalId, 'djen:TESTE-IMP%'));
  for (const t of ['case_civil', 'case_labor', 'case_procon', 'case_party', 'case_risk', 'rental_link']) {
    await db.execute(sql.raw(`delete from ${t} where case_id in (select id from "case" where number like '${PFX}%')`));
  }
  await db.delete(inboxItem).where(like(inboxItem.caseNumber, `${PFX}%`));
  await db.delete(cases).where(like(cases.number, `${PFX}%`));
  await db.execute(sql`delete from audit_log where entity = 'base_import' and entity_id in (select id::text from base_import where file_name like 'TESTE-IMP%')`);
  await db.delete(baseImport).where(like(baseImport.fileName, 'TESTE-IMP%'));
  void ids; void auditLog;
}

beforeAll(async () => {
  process.env.STORAGE_DIR = mkdtempSync(path.join(tmpdir(), 'focojur-imp-'));
  const { db } = await import('@/db');
  const { user } = await import('@/db/schema');
  await limpa();
  const [a] = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);
  adminId = a.id;
});
afterAll(limpa);

describe('importação da base atual', () => {
  it('recusa o que não é .xlsx válido', async () => {
    const { createBatch } = await import('@/server/base-import');
    expect(await createBatch(adminId, 'TESTE-IMP.csv', Buffer.from('a,b'))).toMatchObject({ ok: false });
    expect(await createBatch(adminId, 'TESTE-IMP.xlsx', Buffer.from('isto não é excel'))).toMatchObject({ ok: false });
    expect(await createBatch(adminId, 'TESTE-IMP.xlsx', Buffer.alloc(0))).toMatchObject({ ok: false });
  });

  it('envia, sugere o mapeamento, mostra a prévia, importa e guarda concluídos sem monitoramento', async () => {
    const { createBatch, getBatch, batchWorkbook, previewRecords, saveConfig, startImport, runImport } = await import('@/server/base-import');
    const { buildRecords } = await import('@/lib/migration/base-import');
    const { addInboxItem } = await import('@/server/inbox');
    const { db } = await import('@/db');
    const { cases } = await import('@/db/schema/case');
    const { movement } = await import('@/db/schema/movement');
    const { inboxItem } = await import('@/db/schema/inbox');

    // o processo 1 já esperava na Triagem, com uma publicação do DJEN
    await addInboxItem({
      source: 'djen_term', caseNumber: N(1), externalId: 'djen:TESTE-IMP-1',
      payload: { publications: [{ id: 'TESTE-IMP-1', data: '2026-11-10', tipo: 'Intimação', orgao: 'Vara', texto: 'Texto que esperava na Triagem', link: '' }] },
    });

    const created = await createBatch(adminId, 'TESTE-IMP.xlsx', await planilha());
    if (!created.ok) throw new Error(created.error);
    batchIds.push(created.id);
    let batch = (await getBatch(created.id))!;
    expect(batch.status).toBe('draft');

    // prévia
    const wb = await batchWorkbook(batch);
    const { records, notes } = buildRecords(wb, batch.config as never);
    const pv = await previewRecords(records, notes);
    expect(pv).toMatchObject({ total: 3, toCreate: 3, toCreateClosed: 1, existing: 0, blocked: 0 });
    expect(pv.unknown.some((u) => u.type === 'subject' && u.values.includes('Objeto Inventado Teste'))).toBe(true);
    expect(pv.noOwner).toEqual(['Pessoa Que Nao Existe']);

    // salvar o mapeamento (ex.: o Jurídico desmarca a aba de encerrados) e voltar
    const cfg = structuredClone(batch.config as { sheets: { name: string; use: boolean }[] });
    cfg.sheets.find((s) => s.name === 'Cível encerrados')!.use = false;
    expect((await saveConfig(adminId, created.id, cfg)).ok).toBe(true);
    batch = (await getBatch(created.id))!;
    expect(buildRecords(await batchWorkbook(batch), batch.config as never).records).toHaveLength(2);
    cfg.sheets.find((s) => s.name === 'Cível encerrados')!.use = true;
    await saveConfig(adminId, created.id, cfg);

    // importar
    expect((await startImport(adminId, created.id)).ok).toBe(true);
    expect((await startImport(adminId, created.id)).ok).toBe(false); // não inicia duas vezes
    expect((await saveConfig(adminId, created.id, cfg)).ok).toBe(false); // nem aceita mudar o mapeamento depois
    const run = await runImport(created.id, adminId);
    expect(run).toMatchObject({ ok: true, created: 3, createdClosed: 1, existing: 0 });
    batch = (await getBatch(created.id))!;
    expect(batch.status).toBe('done');
    expect(batch.progressDone).toBe(3);

    const rows = await db.select().from(cases).where(like(cases.number, `${PFX}%`));
    expect(rows).toHaveLength(3);
    const byNum = new Map(rows.map((c) => [c.number, c]));
    expect(byNum.get(N(1))).toMatchObject({ monitoring: true, source: 'migration', externalFirm: 'Pessoa Que Nao Existe' });
    expect(byNum.get(N(3))).toMatchObject({ monitoring: false }); // concluído: só consulta

    // o item que esperava na Triagem passou a ser do processo 1; a publicação vira histórico lido, sem alerta
    const movs = await db.select().from(movement).where(eq(movement.caseId, byNum.get(N(1))!.id));
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ triageStatus: 'linked' });
    expect(movs[0].readAt).not.toBeNull();
    const [it] = await db.select().from(inboxItem).where(eq(inboxItem.caseNumber, N(1)));
    expect(it.status).toBe('confirmed');
    expect(batch.summary).toMatchObject({ inboxLinked: 1, publicationsLinked: 1 });
  });

  it('reimportar a mesma planilha não duplica (já existem) e o relatório em Excel sai com as abas certas', async () => {
    const { createBatch, startImport, runImport, getBatch, reportWorkbook } = await import('@/server/base-import');
    const created = await createBatch(adminId, 'TESTE-IMP-2.xlsx', await planilha());
    if (!created.ok) throw new Error(created.error);
    batchIds.push(created.id);
    await startImport(adminId, created.id);
    expect(await runImport(created.id, adminId)).toMatchObject({ ok: true, created: 0, existing: 3 });
    const done = (await getBatch(created.id))!;
    const wb = await reportWorkbook(done);
    expect(wb.worksheets.map((w) => w.name)).toEqual(expect.arrayContaining(['Resumo', 'Exceções']));
    expect((await wb.xlsx.writeBuffer()).byteLength).toBeGreaterThan(1000); // o arquivo é gerado de verdade
  });

  it('execução só vale para lote em andamento', async () => {
    const { runImport } = await import('@/server/base-import');
    expect(await runImport('00000000-0000-4000-8000-000000000000')).toMatchObject({ ok: false });
  });
});
