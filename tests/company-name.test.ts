import { describe, expect, it } from 'vitest';
import { judgeParties, levenshtein, matchCompanyName, normalizeCompanyName } from '@/lib/company-name';

// como estão cadastrados de verdade: sem a forma societária
const known = ['FOCO ALUGUEL DE CARROS', 'FOCO SEMINOVOS'];

describe('nome da empresa nas publicações', () => {
  it('trata S/A, SA, S.A. e S A como a mesma coisa', () => {
    const n = normalizeCompanyName('Foco Aluguel de Carros S.A.');
    for (const v of ['FOCO ALUGUEL DE CARROS S/A', 'FOCO ALUGUEL DE CARROS SA', 'FOCO ALUGUEL DE CARROS S A', 'FOCO ALUGUEL DE CARROS S.A', 'foco aluguel de carros s.a.']) {
      expect(normalizeCompanyName(v)).toBe(n);
    }
    expect(normalizeCompanyName('2. FOCO ALUGUEL DE CARROS S/A (AGRAVADO)')).toContain('FOCO ALUGUEL DE CARROS SA');
  });

  it('as variações reais vistas nas publicações são reconhecidas ou ficam para decisão', () => {
    // confirmadas sozinhas
    for (const v of ['FOCO ALUGUEL DE CARROS S/A', 'FOCO ALUGUEL DE CARROS SA', 'FOCO ALUGUEL DE CARROS S.A.', 'FOCO ALUGUEL DE CARROS S A', 'FOCO ALUGUEL DE CARROS S.A (FILIAL)', 'FOCO RET A CAR (FOCO ALUGUEL DE CARROS S/A)', '2. FOCO ALUGUEL DE CARROS S/A (AGRAVADO)']) {
      expect(matchCompanyName(v, known), v).toBe('exact');
    }
    expect(matchCompanyName('FOCO ALUGUEIS DE CARROS S/A', known)).toBe('similar'); // erro de digitação
    expect(matchCompanyName('FOCO SEMINOVOS LTDA', known)).toBe('exact'); // forma societária não decide
    // outra grafia: pode ser a Foco ou homônimo, o admin decide
    for (const v of ['FOCO ALUGUEL DE VEICULOS LTDA', 'LOCADORA FOCO', 'FOCO LOCADORA DE CARROS S/A', 'FOCO DESIGN E SOFTWARE LTDA']) {
      expect(matchCompanyName(v, known), v).toBe('none');
    }
  });

  it('distância de edição', () => {
    expect(levenshtein('ALUGUEL', 'ALUGUEIS')).toBe(2);
    expect(levenshtein('a', 'a')).toBe(0);
  });

  it('julga a publicação: confirma, pede conferência ou ignora o que o admin já rejeitou', () => {
    expect(judgeParties(['FOCO ALUGUEL DE CARROS SA'], known, [])).toEqual({ status: 'confirmed', matched: 'FOCO ALUGUEL DE CARROS SA' });
    expect(judgeParties(['FOCO LOCADORA DE VEICULOS LTDA'], known, [])).toEqual({ status: 'variation', name: 'FOCO LOCADORA DE VEICULOS LTDA' });
    expect(judgeParties(['FOCO LOCADORA DE VEICULOS LTDA'], known, ['foco locadora de veiculos ltda'])).toEqual({ status: 'rejected' });
    expect(judgeParties(['FULANO DE TAL'], known, [])).toEqual({ status: 'no-party' });
    // uma parte confirmada vence uma variação duvidosa na mesma publicação
    expect(judgeParties(['LOCADORA FOCO', 'FOCO ALUGUEL DE CARROS S/A'], known, []).status).toBe('confirmed');
  });
});
