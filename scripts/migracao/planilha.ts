import 'dotenv/config';
import path from 'node:path';
import ExcelJS from 'exceljs';

/**
 * Migração da planilha Contencioso (PRD 9.2). Idempotente: processos já existentes (número + carteira) são pulados.
 *
 *   pnpm migrar:planilha -- "C:/caminho/CONTENCIOSO.xlsx" --dry-run
 *   pnpm migrar:planilha -- "C:/caminho/CONTENCIOSO.xlsx" --report relatorio-excecoes.xlsx
 *
 * Gera `relatorio-excecoes.xlsx` para o Jurídico validar. Exceção "grave" não entra; "aviso" entra e fica no relatório.
 */
async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const file = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const reportPath = args.includes('--report') ? args[args.indexOf('--report') + 1] : 'relatorio-excecoes.xlsx';
  if (!file) {
    console.error('Uso: pnpm migrar:planilha -- <arquivo.xlsx> [--dry-run] [--report saida.xlsx]');
    process.exit(1);
  }

  const { isImportable, mapHeaders, markDuplicates, norm, rowToRecord, sheetKind } = await import('../../src/lib/migration/spreadsheet');
  type CaseRecord = import('../../src/lib/migration/spreadsheet').CaseRecord;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(file));

  const records: CaseRecord[] = [];
  const skippedSheets: string[] = [];
  for (const ws of wb.worksheets) {
    const kind = sheetKind(ws.name);
    if (!kind) { skippedSheets.push(ws.name); continue; }
    // cabeçalho: primeira linha (nas 10 primeiras) que reconhece pelo menos 3 colunas
    let headerRow = 0;
    let idx: Record<string, number> = {};
    for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
      const m = mapHeaders((ws.getRow(r).values as unknown[]).slice(1));
      if (Object.keys(m).length >= 3 && m.number !== undefined) { headerRow = r; idx = m; break; }
    }
    if (!headerRow) { skippedSheets.push(`${ws.name} (cabeçalho não reconhecido)`); continue; }
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const cells = (ws.getRow(r).values as unknown[]).slice(1);
      const rec = rowToRecord(ws.name, r, kind, idx, cells);
      if (rec) records.push(rec);
    }
  }
  markDuplicates(records);
  console.log(`Lidos ${records.length} processos em ${wb.worksheets.length - skippedSheets.length} abas. Abas ignoradas: ${skippedSheets.join(', ') || 'nenhuma'}.`);

  // ---------- gravação (mesmo gravador da tela de Importação) ----------
  const stats = { created: 0, existing: 0, blocked: 0 };
  const unknownLists = new Map<string, Set<string>>(); // lista → valores sem correspondência (para o Jurídico aprovar)

  if (!dryRun) {
    const { writeRecords } = await import('../../src/server/base-import');
    const { audit } = await import('../../src/lib/audit');
    const { pool } = await import('../../src/db');
    const res = await writeRecords(records);
    stats.created = res.stats.created;
    stats.existing = res.stats.existing;
    stats.blocked = res.stats.blocked;
    for (const u of res.unknown) unknownLists.set(u.type, new Set(u.values));
    await audit({ entity: 'migration', action: 'create', diff: { file: path.basename(file), ...res.stats } });
    await pool.end();
  }

  // ---------- relatório de exceções ----------
  const out = new ExcelJS.Workbook();
  const sum = out.addWorksheet('Resumo');
  sum.addRows([
    ['Arquivo', path.basename(file)],
    ['Modo', dryRun ? 'Simulação (nada foi gravado)' : 'Gravado'],
    ['Linhas lidas', records.length],
    ['Importáveis', records.filter(isImportable).length],
    ['Bloqueadas (exceção grave)', records.filter((r) => !isImportable(r)).length],
    ['Com avisos', records.filter((r) => r.issues.some((i) => i.severity === 'aviso')).length],
    ...(dryRun ? [] : [['Criados', stats.created], ['Já existiam', stats.existing]]),
    ['Abas ignoradas', skippedSheets.join(', ')],
  ]);
  sum.getColumn(1).width = 30; sum.getColumn(1).font = { bold: true };
  const ex = out.addWorksheet('Exceções');
  ex.columns = [
    { header: 'Aba', key: 'sheet', width: 18 }, { header: 'Linha', key: 'row', width: 8 }, { header: 'Processo', key: 'number', width: 26 },
    { header: 'Gravidade', key: 'severity', width: 11 }, { header: 'Código', key: 'code', width: 24 }, { header: 'Mensagem', key: 'message', width: 90 },
    { header: 'Decisão do Jurídico', key: 'decision', width: 30 },
  ];
  ex.getRow(1).font = { bold: true };
  for (const r of records) for (const i of r.issues) ex.addRow({ sheet: r.sheet, row: r.row, number: r.number, ...i });
  if (unknownLists.size) {
    const un = out.addWorksheet('Valores fora das listas');
    un.columns = [{ header: 'Lista', key: 'type', width: 24 }, { header: 'Valor da planilha', key: 'value', width: 50 }, { header: 'Aprovar / mapear para', key: 'map', width: 40 }];
    un.getRow(1).font = { bold: true };
    for (const [type, vals] of unknownLists) for (const value of vals) un.addRow({ type, value });
  }
  await out.xlsx.writeFile(reportPath);
  console.log(`Relatório: ${path.resolve(reportPath)}`);
  if (!dryRun) console.log(`Criados: ${stats.created}, já existiam: ${stats.existing}, bloqueados: ${stats.blocked}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
