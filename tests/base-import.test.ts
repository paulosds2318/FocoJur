import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildRecords, defaultConfig, detectHeaderRow, sanitizeConfig } from '@/lib/migration/base-import';

const HEADERS = ['Número do processo', 'Advogada responsável', 'Sistema', 'UF', 'Vara', 'Demandante', 'Objeto', 'Prognóstico', 'Valor da causa', 'Valor de risco', 'Status'];

function workbook() {
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet('Cível 2026');
  a.addRow(['CONTROLE DE PROCESSOS']); // título acima do cabeçalho
  a.addRow(HEADERS);
  a.addRow(['5011870-02.2026.8.21.0001', 'Ana', 'PJe', 'rs', '1ª Vara', 'Fulano', 'No show', 'Possível', 'R$ 10.000,00', 5000, 'Em andamento']);
  a.addRow(['5011871-02.2026.8.21.0001', 'Ana', 'eProc', 'RS', '2ª Vara', 'Beltrano', '404', 'Provável', 2000, 2000, 'Em andamento']);
  const b = wb.addWorksheet('Cível encerrados');
  b.addRow(HEADERS);
  b.addRow(['5011999-02.2024.8.21.0001', 'Ana', 'PJe', 'RS', '1ª Vara', 'Cicrano', 'No show', 'Remoto', 1000, 0, 'Encerrado']);
  const c = wb.addWorksheet('Gráficos'); // aba de apoio
  c.addRow(['x']);
  const d = wb.addWorksheet('Qualquer coisa'); // aba que o sistema não reconhece
  d.addRow(HEADERS);
  d.addRow(['5012000-02.2026.8.21.0001', 'Ana']);
  return wb;
}

describe('importação da base: de-para', () => {
  it('acha a linha do cabeçalho mesmo com título acima e sugere o mapeamento', () => {
    const wb = workbook();
    expect(detectHeaderRow(wb.getWorksheet('Cível 2026')!)).toBe(2);
    const cfg = defaultConfig(wb);
    const civ = cfg.sheets.find((s) => s.name === 'Cível 2026')!;
    expect(civ).toMatchObject({ use: true, portfolio: 'civil', closedSheet: false, headerRow: 2 });
    expect(civ.columns.number).toBe(0);
    expect(civ.columns.owner).toBe(1);
    expect(civ.columns.riskTotal).toBe(9);
    expect(civ.columns.plate).toBeNull(); // não existe na planilha
  });

  it('aba de encerrados vem marcada como concluídos; abas de apoio e desconhecidas ficam de fora por padrão', () => {
    const cfg = defaultConfig(workbook());
    expect(cfg.sheets.find((s) => s.name === 'Cível encerrados')).toMatchObject({ use: true, closedSheet: true });
    expect(cfg.sheets.find((s) => s.name === 'Gráficos')!.use).toBe(false);
    expect(cfg.sheets.find((s) => s.name === 'Qualquer coisa')!.use).toBe(false);
  });

  it('lê os registros pelo mapeamento e marca os de aba encerrada', () => {
    const wb = workbook();
    const { records, notes } = buildRecords(wb, defaultConfig(wb));
    expect(notes).toEqual([]);
    expect(records).toHaveLength(3);
    const r1 = records.find((r) => r.number === '50118700220268210001')!;
    expect(r1).toMatchObject({ state: 'RS', system: 'PJe', prognosis: 'possible', claimValue: 10000, riskTotal: 5000, closedSheet: false, portfolio: 'civil' });
    expect(records.find((r) => r.number === '50119990220248210001')!.closedSheet).toBe(true);
  });

  it('a pessoa pode corrigir o de-para: trocar colunas, incluir uma aba e mudar a carteira', () => {
    const wb = workbook();
    const cfg = defaultConfig(wb);
    const civ = cfg.sheets.find((s) => s.name === 'Cível 2026')!;
    civ.columns.owner = 5; // "Demandante" no lugar da advogada (só para provar que vale o escolhido)
    civ.portfolio = 'labor';
    cfg.sheets.find((s) => s.name === 'Qualquer coisa')!.use = true;
    const { records } = buildRecords(wb, sanitizeConfig(cfg, wb));
    const r1 = records.find((r) => r.number === '50118700220268210001')!;
    expect(r1.owner).toBe('Fulano');
    expect(r1.portfolio).toBe('labor');
    expect(records.some((r) => r.number === '50120000220268210001')).toBe(true);
  });

  it('aba usada sem a coluna do número vira aviso, não erro', () => {
    const wb = workbook();
    const cfg = defaultConfig(wb);
    cfg.sheets.find((s) => s.name === 'Cível 2026')!.columns.number = null;
    const { notes } = buildRecords(wb, cfg);
    expect(notes[0]).toMatch(/Cível 2026.*número do processo/);
  });

  it('configuração inválida é saneada: coluna fora do limite, carteira desconhecida e linha absurda', () => {
    const wb = workbook();
    const raw = { sheets: [{ name: 'Cível 2026', use: true, portfolio: 'xx', headerRow: 9999, columns: { number: 500, owner: -1 } }, { name: 'Inexistente', use: true }] };
    const cfg = sanitizeConfig(raw, wb);
    const civ = cfg.sheets.find((s) => s.name === 'Cível 2026')!;
    expect(civ.portfolio).toBe('civil'); // volta ao sugerido
    expect(civ.headerRow).toBe(2);
    expect(civ.columns.number).toBeNull();
    expect(civ.columns.owner).toBeNull();
    expect(cfg.sheets.some((s) => s.name === 'Inexistente')).toBe(false);
  });

  it('número repetido entre abas: o primeiro vale e o outro é exceção grave', () => {
    const wb = workbook();
    wb.getWorksheet('Cível encerrados')!.addRow(['5011870-02.2026.8.21.0001', 'Ana']);
    const { records } = buildRecords(wb, defaultConfig(wb));
    const dup = records.filter((r) => r.number === '50118700220268210001');
    expect(dup).toHaveLength(2);
    expect(dup[1].issues.some((i) => i.severity === 'grave' && i.code === 'numero_duplicado')).toBe(true);
  });
});
