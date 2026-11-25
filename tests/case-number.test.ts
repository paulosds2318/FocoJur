import { describe, expect, it } from 'vitest';
import { extractContractCodes, formatCaseNumber, isValidCnj, normalizeCaseNumber } from '@/lib/case-number';

describe('número do processo', () => {
  it('normaliza e formata o número CNJ', () => {
    expect(normalizeCaseNumber('0100584-60.2025.5.01.0062')).toBe('01005846020255010062');
    expect(formatCaseNumber('01005846020255010062')).toBe('0100584-60.2025.5.01.0062');
    expect(formatCaseNumber('1588507/2026')).toBe('1588507/2026');
  });
  it('valida o dígito verificador', () => {
    expect(isValidCnj('0100584-60.2025.5.01.0062')).toBe(true);
    expect(isValidCnj('0100584-61.2025.5.01.0062')).toBe(false);
    expect(isValidCnj('123')).toBe(false);
  });
});

describe('contrato', () => {
  it('extrai códigos do texto livre sem duplicar', () => {
    expect(extractContractCodes('Contrato AJU004343-25 e SDU008174-26; de novo AJU004343-25')).toEqual([
      'AJU004343-25',
      'SDU008174-26',
    ]);
  });
});
