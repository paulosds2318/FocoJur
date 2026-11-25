import { describe, expect, it } from 'vitest';
import { pageWindow, parsePage, rangeOf, totalPages } from '@/lib/pagination';

describe('paginação', () => {
  it('lê a página da URL e limita ao intervalo válido', () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage('abc')).toBe(1);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('-3')).toBe(1);
    expect(parsePage('3')).toBe(3);
    expect(parsePage('99', 430, 25)).toBe(18); // 430 itens / 25 = 18 páginas
    expect(parsePage(['2', '5'])).toBe(2);
  });

  it('calcula total de páginas e faixa mostrada', () => {
    expect(totalPages(430, 25)).toBe(18);
    expect(totalPages(0, 25)).toBe(1);
    expect(rangeOf(1, 25, 430)).toEqual({ from: 1, to: 25 });
    expect(rangeOf(18, 25, 430)).toEqual({ from: 426, to: 430 });
    expect(rangeOf(1, 25, 0)).toEqual({ from: 0, to: 0 });
  });

  it('janela de páginas: primeira, última e vizinhas, com reticências nos saltos', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(1, 18)).toEqual([1, 2, 3, null, 18]);
    expect(pageWindow(9, 18)).toEqual([1, null, 7, 8, 9, 10, 11, null, 18]);
    expect(pageWindow(18, 18)).toEqual([1, null, 16, 17, 18]);
  });
});
