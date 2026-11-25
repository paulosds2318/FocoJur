import { describe, expect, it } from 'vitest';
import { plannerBuckets } from '@/lib/migration/planner';
import { norm } from '@/lib/migration/spreadsheet';

describe('buckets do Planner viram colunas do quadro', () => {
  it('lista os nomes distintos (sem acento/caixa) com a contagem e ignora tarefa sem bucket', () => {
    const r = plannerBuckets(
      [{ bucket: 'Audiências e Contestações' }, { bucket: 'AUDIENCIAS E CONTESTACOES' }, { bucket: 'Tarefas pendentes' }, { bucket: null }, { bucket: '  ' }],
      norm,
    );
    expect(r).toEqual([
      { name: 'Audiências e Contestações', count: 2 },
      { name: 'Tarefas pendentes', count: 1 },
    ]);
  });

  it('sem tarefas, nenhuma coluna', () => {
    expect(plannerBuckets([], norm)).toEqual([]);
  });
});
