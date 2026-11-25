import type ExcelJS from 'exceljs';
import { cellText, markDuplicates, mapHeaders, norm, rowToRecord, sheetKind, type CaseRecord } from './spreadsheet';

/**
 * Importação da base atual pela tela: lê a planilha, sugere o de-para (aba → carteira/situação, coluna → campo) e monta os registros
 * com o mapeamento que a pessoa confirmou. Sem acesso a banco; a gravação fica em `src/server/base-import.ts`.
 */
export type Portfolio = 'civil' | 'labor' | 'procon';
export type SheetConfig = {
  name: string;
  use: boolean;
  portfolio: Portfolio;
  /** aba de processos encerrados (entram como concluídos, sem monitoramento) */
  closedSheet: boolean;
  polarity: 'passive' | 'active';
  /** linha (1 = primeira) em que estão os títulos das colunas */
  headerRow: number;
  /** campo → posição da coluna (0 = primeira); nulo = não importar */
  columns: Record<string, number | null>;
};
export type ImportConfig = { sheets: SheetConfig[] };

/** Campos que a planilha pode alimentar, na ordem da tela de mapeamento. */
export const FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: 'number', label: 'Número do processo', required: true },
  { key: 'owner', label: 'Advogada responsável' }, { key: 'system', label: 'Sistema / portal' }, { key: 'courtType', label: 'Foro / esfera' },
  { key: 'state', label: 'UF' }, { key: 'city', label: 'Comarca / cidade' }, { key: 'court', label: 'Vara / órgão' },
  { key: 'plaintiff', label: 'Demandante' }, { key: 'subject', label: 'Objeto' }, { key: 'claim', label: 'Pedido' },
  { key: 'status', label: 'Status do processo' }, { key: 'active', label: 'Ativo (sim/não)' },
  { key: 'receivedAt', label: 'Data de recebimento' }, { key: 'citedAt', label: 'Data da citação' },
  { key: 'closedAt', label: 'Data de encerramento' }, { key: 'closingReason', label: 'Motivo de encerramento' },
  { key: 'costCenter', label: 'Loja / centro de custo' }, { key: 'details', label: 'Detalhamento' },
  { key: 'prognosis', label: 'Prognóstico' }, { key: 'claimValue', label: 'Valor da causa' }, { key: 'riskTotal', label: 'Valor de risco total' },
  { key: 'riskMaterial', label: 'Risco dano material' }, { key: 'riskMoral', label: 'Risco dano moral' },
  { key: 'avoidable', label: 'Evitável pela Foco' }, { key: 'rootCause', label: 'Causa raiz (detalhe do erro)' },
  { key: 'plate', label: 'Placa' }, { key: 'vehicleModel', label: 'Modelo do veículo' }, { key: 'rentalType', label: 'Tipo de locação' },
];

const rowCells = (ws: ExcelJS.Worksheet, r: number) => (ws.getRow(r).values as unknown[]).slice(1);

/** Títulos da linha de cabeçalho (texto de cada célula). */
export function headersOf(ws: ExcelJS.Worksheet, headerRow: number): string[] {
  const cells = rowCells(ws, headerRow);
  const out: string[] = [];
  for (let i = 0; i < cells.length; i++) out.push(cellText(cells[i]));
  return out;
}

/** Sugere a linha do cabeçalho (a primeira, nas 10 primeiras, que reconhece o número do processo e pelo menos 3 colunas). */
export function detectHeaderRow(ws: ExcelJS.Worksheet): number | null {
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const m = mapHeaders(rowCells(ws, r));
    if (Object.keys(m).length >= 3 && m.number !== undefined) return r;
  }
  return null;
}

/** Colunas sugeridas para uma linha de cabeçalho: todos os campos, com `null` onde nada foi reconhecido. */
export function autoColumns(ws: ExcelJS.Worksheet, headerRow: number): Record<string, number | null> {
  const m = mapHeaders(rowCells(ws, headerRow));
  return Object.fromEntries(FIELDS.map((f) => [f.key, m[f.key] ?? null]));
}

export function defaultSheetConfig(ws: ExcelJS.Worksheet): SheetConfig {
  const kind = sheetKind(ws.name);
  const header = detectHeaderRow(ws);
  const headerRow = header ?? 1;
  return {
    name: ws.name, use: !!kind && header !== null, portfolio: kind?.portfolio ?? 'civil', closedSheet: !!kind?.closedSheet,
    polarity: kind?.polarity ?? 'passive', headerRow, columns: autoColumns(ws, headerRow),
  };
}

export const defaultConfig = (wb: ExcelJS.Workbook): ImportConfig => ({ sheets: wb.worksheets.map(defaultSheetConfig) });

/** Valida o que veio do formulário contra a planilha (abas existentes, linhas e colunas dentro do limite). */
export function sanitizeConfig(raw: unknown, wb: ExcelJS.Workbook): ImportConfig {
  const given = ((raw ?? {}) as { sheets?: Partial<SheetConfig>[] }).sheets ?? [];
  const sheets = wb.worksheets.map((ws): SheetConfig => {
    const g = given.find((s) => s.name === ws.name);
    const base = defaultSheetConfig(ws);
    if (!g) return base;
    const portfolio = (['civil', 'labor', 'procon'] as const).includes(g.portfolio as Portfolio) ? (g.portfolio as Portfolio) : base.portfolio;
    const headerRow = Number.isInteger(g.headerRow) && g.headerRow! >= 1 && g.headerRow! <= Math.max(1, ws.rowCount) ? g.headerRow! : base.headerRow;
    const width = Math.max(ws.columnCount, 1);
    const columns = Object.fromEntries(FIELDS.map((f) => {
      const v = g.columns?.[f.key];
      return [f.key, Number.isInteger(v) && (v as number) >= 0 && (v as number) < width ? (v as number) : null];
    }));
    return { name: ws.name, use: !!g.use, portfolio, closedSheet: !!g.closedSheet, polarity: g.polarity === 'active' ? 'active' : 'passive', headerRow, columns };
  });
  return { sheets };
}

/** Monta os registros com o mapeamento escolhido. `notes` explica abas que não puderam ser lidas. */
export function buildRecords(wb: ExcelJS.Workbook, config: ImportConfig): { records: CaseRecord[]; notes: string[] } {
  const records: CaseRecord[] = [];
  const notes: string[] = [];
  for (const sc of config.sheets) {
    if (!sc.use) continue;
    const ws = wb.getWorksheet(sc.name);
    if (!ws) { notes.push(`Aba "${sc.name}" não encontrada.`); continue; }
    const idx = Object.fromEntries(Object.entries(sc.columns).filter(([, v]) => v !== null)) as Record<string, number>;
    if (idx.number === undefined) { notes.push(`Aba "${sc.name}": escolha a coluna do número do processo.`); continue; }
    for (let r = sc.headerRow + 1; r <= ws.rowCount; r++) {
      const rec = rowToRecord(sc.name, r, { portfolio: sc.portfolio, polarity: sc.polarity, closedSheet: sc.closedSheet }, idx, rowCells(ws, r));
      if (rec) records.push(rec);
    }
  }
  markDuplicates(records);
  return { records, notes };
}

export { norm };
