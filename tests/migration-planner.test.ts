import { describe, expect, it } from 'vitest';
import { mapPlannerHeaders, rowToPlannerTask } from '@/lib/migration/planner';

describe('Planner', () => {
  const idx = mapPlannerHeaders(['Nome da tarefa', 'Nome do Bucket', 'Progresso', 'Atribuído a', 'Data de vencimento', 'Data de conclusão']);

  it('extrai o número CNJ do título e mapeia o bucket', () => {
    const t = rowToPlannerTask(2, idx, ['INTERPOR RR - 0100584-60.2025.5.01.0062', 'Audiências e Contestações', 'Em andamento', 'Ana; Beatriz', '04/12/2026', ''])!;
    expect(t.caseNumber).toBe('01005846020255010062');
    expect(t.typeLabel).toBe('Audiência');
    expect(t.assignees).toEqual(['Ana', 'Beatriz']);
    expect(t.dueDate).toBe('2026-12-04');
    expect(t.completed).toBe(false);
  });

  it('tarefa sem número vira geral e concluída é detectada', () => {
    const g = rowToPlannerTask(3, idx, ['Regularização de lojas: documentação', 'Regularização de lojas', 'Não iniciado', '', '', ''])!;
    expect(g.caseNumber).toBeNull();
    const c = rowToPlannerTask(4, idx, ['Pagar custas', 'Tarefas pendentes', 'Concluída', 'Ana', '', '01/11/2026'])!;
    expect(c.completed).toBe(true);
    expect(rowToPlannerTask(5, idx, ['', '', '', '', '', ''])).toBeNull();
  });
});
