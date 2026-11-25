import { cellText, norm, parseDate } from './spreadsheet';

export const CNJ_REGEX = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;

export const PLANNER_ALIASES: Record<string, string[]> = {
  title: ['NOME DA TAREFA', 'TASK NAME', 'TITULO', 'TAREFA'],
  bucket: ['NOME DO BUCKET', 'BUCKET NAME', 'BUCKET'],
  progress: ['PROGRESSO', 'PROGRESS'],
  assignee: ['ATRIBUIDO A', 'ATRIBUIDA A', 'ASSIGNED TO', 'ATRIBUIDO'],
  due: ['DATA DE VENCIMENTO', 'DATA DE CONCLUSAO PREVISTA', 'DUE DATE', 'VENCIMENTO'],
  completedAt: ['DATA DE CONCLUSAO', 'CONCLUIDO EM', 'COMPLETED DATE', 'DATA DE CONCLUSAO REAL'],
  description: ['DESCRICAO', 'DESCRIPTION', 'NOTAS'],
};

export function mapPlannerHeaders(headerRow: unknown[]) {
  const idx: Record<string, number> = {};
  const n = headerRow.map(norm);
  for (const [f, al] of Object.entries(PLANNER_ALIASES)) {
    const i = n.findIndex((h) => al.map(norm).includes(h));
    if (i !== -1) idx[f] = i;
  }
  return idx;
}

/** Mapeamento bucket → tipo de tarefa (lista oficial `task_type`). Validar com o Jurídico (questão 4 do PRD). */
export const BUCKET_TO_TYPE: Record<string, string> = {
  'AUDIENCIAS E CONTESTACOES': 'Audiência',
  'TAREFAS PENDENTES': 'Geral',
  'DIRETORIA GERAL E SOCIOS': 'Geral',
  'REGULARIZACAO DE LOJAS': 'Geral',
  'ARMAZENAMENTO DOS CONTRATOS': 'Geral',
  CONTESTACAO: 'Contestação',
  RECURSO: 'Recurso',
  PAGAMENTO: 'Pagamento',
};

export type PlannerTask = {
  row: number; title: string; bucket: string | null; typeLabel: string | null; caseNumber: string | null;
  completed: boolean; dueDate: string | null; completedAt: string | null; assignees: string[]; description: string | null;
};

export function rowToPlannerTask(row: number, idx: Record<string, number>, cells: unknown[]): PlannerTask | null {
  const get = (f: string) => (idx[f] === undefined ? '' : cellText(cells[idx[f]]));
  const title = get('title');
  if (!title) return null;
  const m = title.match(CNJ_REGEX) ?? get('description').match(CNJ_REGEX);
  const progress = norm(get('progress'));
  const completedAt = parseDate(idx.completedAt === undefined ? null : cells[idx.completedAt]);
  const bucket = get('bucket') || null;
  return {
    row, title, bucket, typeLabel: bucket ? BUCKET_TO_TYPE[norm(bucket)] ?? null : null,
    caseNumber: m ? m[0].replace(/\D/g, '') : null,
    completed: progress.includes('CONCLU') || progress === 'COMPLETED' || !!completedAt,
    dueDate: parseDate(idx.due === undefined ? null : cells[idx.due]), completedAt,
    assignees: get('assignee').split(/[;,]/).map((s) => s.trim()).filter(Boolean),
    description: get('description') || null,
  };
}

/** Nomes distintos de bucket das tarefas (na grafia do export; o primeiro nome visto de cada um) com a contagem. */
export function plannerBuckets(tasks: Pick<PlannerTask, 'bucket'>[], normalize: (s: string) => string): { name: string; count: number }[] {
  const seen = new Map<string, { name: string; count: number }>();
  for (const t of tasks) {
    const name = (t.bucket ?? '').trim();
    if (!name) continue;
    const k = normalize(name);
    const cur = seen.get(k);
    if (cur) cur.count++;
    else seen.set(k, { name, count: 1 });
  }
  return [...seen.values()];
}
