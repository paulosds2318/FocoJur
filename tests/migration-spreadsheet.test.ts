import { describe, expect, it } from 'vitest';
import {
  isImportable, mapHeaders, markDuplicates, normalizeSystem, parseDate, parseMoney, rowToRecord, sheetKind,
} from '@/lib/migration/spreadsheet';

describe('células', () => {
  it('lê dinheiro em vários formatos e sinaliza texto livre', () => {
    expect(parseMoney('R$ 1.234,56')).toEqual({ value: 1234.56, invalid: false });
    expect(parseMoney(5000)).toEqual({ value: 5000, invalid: false });
    expect(parseMoney('2450.5')).toEqual({ value: 2450.5, invalid: false });
    expect(parseMoney('FAZER OS CÁLCULOS NA IA')).toEqual({ value: null, invalid: true });
    expect(parseMoney('')).toEqual({ value: null, invalid: false });
  });
  it('lê datas', () => {
    expect(parseDate('13/11/2026')).toBe('2026-11-13');
    expect(parseDate(new Date('2026-11-13T00:00:00Z'))).toBe('2026-11-13');
    expect(parseDate('xx')).toBeNull();
  });
  it('normaliza o sistema contra a lista oficial', () => {
    expect(normalizeSystem('E-SAJ')).toBe('eSaj');
    expect(normalizeSystem('PROUJDI')).toBe('Projudi');
    expect(normalizeSystem('DOMICILIO')).toBe('Domicílio Judicial');
  });
});

describe('abas', () => {
  it('classifica abas por carteira e ignora as de indicadores', () => {
    expect(sheetKind('Cível 2026')?.portfolio).toBe('civil');
    expect(sheetKind('Trabalhista 2026')?.portfolio).toBe('labor');
    expect(sheetKind('Procon')?.portfolio).toBe('procon');
    expect(sheetKind('Polo Ativo')?.polarity).toBe('active');
    expect(sheetKind('Cível 2021')?.closedSheet).toBe(true);
    expect(sheetKind('Gráficos')).toBeNull();
    expect(sheetKind('Indicadores Procon')).toBeNull();
  });
});

describe('linhas', () => {
  const header = ['Número do Processo', 'Sistema', 'UF', 'ATIVO', 'Status', 'Data de Recebimento', 'Valor de Risco', 'Detalhamento', 'Prognóstico'];
  const idx = mapHeaders(header);
  const kind = sheetKind('Cível 2026')!;

  it('mapeia cabeçalhos por apelido', () => {
    expect(idx.number).toBe(0);
    expect(idx.riskTotal).toBe(6);
  });

  it('gera registro com contrato extraído e exceções de qualidade', () => {
    const r = rowToRecord('Cível 2026', 2, kind, idx, [
      '0100584-60.2025.5.01.0062', 'PROUJDI', 'rj', 'SIM', 'ENCERRADO', '10/01/2027', 'FAZER OS CÁLCULOS', 'Ver contrato AJU004343-25', 'Possível',
    ], 2026)!;
    expect(r.number).toBe('01005846020255010062');
    expect(r.system).toBe('Projudi');
    expect(r.state).toBe('RJ');
    expect(r.contracts).toEqual(['AJU004343-25']);
    expect(r.prognosis).toBe('possible');
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain('ano_futuro');
    expect(codes).toContain('ativo_x_encerrado');
    expect(codes).toContain('valor_invalido');
    expect(isImportable(r)).toBe(true); // só avisos
  });

  it('ignora linha sem número e marca duplicado entre abas como grave', () => {
    expect(rowToRecord('Cível 2026', 3, kind, idx, ['', 'PJe'])).toBeNull();
    const a = rowToRecord('Cível 2026', 2, kind, idx, ['111', 'PJe', 'SP', 'SIM', 'Ativo', '', '', '', ''])!;
    const b = rowToRecord('Cível 2025', 9, kind, idx, ['111', 'PJe', 'SP', 'SIM', 'Ativo', '', '', '', ''])!;
    markDuplicates([a, b]);
    expect(isImportable(a)).toBe(true);
    expect(isImportable(b)).toBe(false);
  });
});
