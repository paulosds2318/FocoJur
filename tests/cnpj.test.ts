import { describe, expect, it } from 'vitest';
import { cnpjRoot, findCnpjs, formatCnpj, isValidCnpj, textMentionsDocument } from '@/lib/cnpj';
import { FOCO_ALUGUEL, FOCO_NOMES, FOCO_SEMINOVOS } from '@/db/seed/termos-foco';

describe('CNPJ', () => {
  it('valida os dígitos verificadores', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false);
    expect(isValidCnpj('00.000.000/0000-00')).toBe(false);
    expect(isValidCnpj('123')).toBe(false);
  });

  it('todos os CNPJs do grupo Foco informados pelo Jurídico têm dígitos válidos e a mesma raiz', () => {
    const invalidos = [...FOCO_ALUGUEL, ...FOCO_SEMINOVOS].filter(([c]) => !isValidCnpj(c)).map(([c]) => c);
    expect(invalidos).toEqual([]); // se falhar, é erro de digitação na lista
    expect(new Set(FOCO_ALUGUEL.map(([c]) => cnpjRoot(c)))).toEqual(new Set(['07730797']));
    expect(FOCO_NOMES.every((n) => isValidCnpj(n.document))).toBe(true);
    expect(new Set(FOCO_ALUGUEL.map(([c]) => c)).size).toBe(FOCO_ALUGUEL.length); // sem repetidos
  });

  it('formata e encontra CNPJs no texto', () => {
    expect(formatCnpj('07730797000121')).toBe('07.730.797/0001-21');
    expect(findCnpjs('Autor x FOCO, CNPJ 07.730.797/0005-55 e 62.029.309/0001-61.')).toEqual(['07.730.797/0005-55', '62.029.309/0001-61']);
  });

  it('confere a parte pela raiz: citar outra filial não é homônimo', () => {
    const texto = 'Cite-se FOCO ALUGUEL DE CARROS S/A, CNPJ 07.730.797/0005-55, na pessoa do representante legal';
    expect(textMentionsDocument(texto, '07.730.797/0001-21')).toBe(true); // matriz cadastrada, filial no texto
    expect(textMentionsDocument(texto, '99.999.999/0001-99')).toBe(false); // outra empresa
    expect(textMentionsDocument('CPF 123.456.789-09', '12345678909')).toBe(true); // CPF compara inteiro
  });
});
