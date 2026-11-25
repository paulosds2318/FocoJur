import { describe, expect, it } from 'vitest';
import { collectIds, formatAuditDiff } from '@/lib/audit-format';

const U = '3f2b8c1e-1111-4222-8333-444455556666';

describe('auditoria legível', () => {
  it('campo antes/depois vira linha com rótulo, data em pt-BR e "vazio" no lugar de null', () => {
    const lines = formatAuditDiff({ title: { before: 'A', after: 'A (ajustada)' }, dueDate: { before: null, after: '2030-01-15' } });
    expect(lines).toEqual([
      { label: 'Título', before: 'A', after: 'A (ajustada)' },
      { label: 'Prazo limite', before: null, after: '15/01/2030' },
    ]);
  });

  it('ids viram nomes e status viram rótulos; id sem nome não aparece cru', () => {
    const names = new Map([[U, 'Maria Souza']]);
    const lines = formatAuditDiff({ ownerId: { before: null, after: U }, reviewerId: { before: U, after: '99999999-9999-4999-8999-999999999999' }, status: { before: 'todo', after: 'review' } }, names);
    expect(lines[0]).toEqual({ label: 'Responsável', before: null, after: 'Maria Souza' });
    expect(lines[1].after).toBe('(registro removido)');
    expect(lines[2]).toEqual({ label: 'Situação', before: 'A fazer', after: 'Aguardando revisão' });
  });

  it('criação ({ after: {...} }) mostra só os valores novos; antes/depois de objetos compara campo a campo', () => {
    expect(formatAuditDiff({ after: { number: '00000000000000000001', portfolio: 'civil' } }).map((l) => l.label)).toEqual(['Número do processo', 'Carteira']);
    const l = formatAuditDiff({ before: { riskTotal: '1000.00', prognosis: 'possible' }, after: { riskTotal: 2000, prognosis: 'possible' } });
    expect(l).toEqual([{ label: 'Valor de risco total', before: expect.stringContaining('1.000,00'), after: expect.stringContaining('2.000,00') }]);
  });

  it('configuração da fórmula e booleanos ficam legíveis; ruído (id, datas técnicas) some', () => {
    const l = formatAuditDiff({ before: { enabled: false, pct: { probable: 100, possible: 50, remote: 0 } }, after: { enabled: true, pct: { probable: 100, possible: 40, remote: 0 } } });
    expect(l[0]).toEqual({ label: 'Ligada', before: 'Não', after: 'Sim' });
    expect(l[1].after).toBe('Provável 100% · Possível 40% · Remoto 0%');
    expect(formatAuditDiff({ id: 'x', createdAt: 'y', title: { before: 'a', after: 'b' } })).toHaveLength(1);
  });

  it('collectIds acha os ids em qualquer nível; diff vazio ou inválido não quebra', () => {
    expect([...collectIds({ ownerId: { after: U }, x: [{ y: U }] })]).toEqual([U]);
    expect(formatAuditDiff(null)).toEqual([]);
    expect(formatAuditDiff('texto')).toEqual([]);
  });
});
