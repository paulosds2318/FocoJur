import { formatCaseNumber } from '@/lib/case-number';

/** Transforma o `diff` cru da auditoria em linhas legíveis ("Prazo limite: vazio → 15/01/2030"). */
export type AuditLine = { label: string; before: string | null; after: string | null };
export type NameMap = ReadonlyMap<string, string>;

const LABEL: Record<string, string> = {
  title: 'Título', assigneeIds: 'Responsáveis', dueDate: 'Prazo limite', internalDueDate: 'Prazo interno', dueTime: 'Horário', ownerId: 'Responsável', reviewerId: 'Revisor',
  typeId: 'Tipo', status: 'Situação', caseId: 'Processo', movementId: 'Andamento', origin: 'Origem', triage: 'Decisão', taskId: 'Tarefa', reason: 'Motivo',
  number: 'Número do processo', portfolio: 'Carteira', prognosis: 'Prognóstico', riskTotal: 'Valor de risco total', riskMaterial: 'Risco dano material',
  riskMoral: 'Risco dano moral', claimValue: 'Valor da causa', settlementLimit: 'Limite de acordo', enabled: 'Ligada', pct: 'Percentuais',
  state: 'UF', city: 'Cidade', court: 'Vara', details: 'Detalhamento', costCenter: 'Loja', monitoring: 'Monitoramento', closedAt: 'Encerrado em',
  closingReasonId: 'Motivo de encerramento', active: 'Ativo', role: 'Perfil', name: 'Nome', email: 'E-mail', description: 'Descrição', label: 'Rótulo',
  systemId: 'Sistema', subjectId: 'Objeto', claimId: 'Pedido', courtTypeId: 'Foro / esfera', receivedAt: 'Recebido em', citedAt: 'Citação em',
  plaintiff: 'Demandante', contractCode: 'Contrato', hours: 'Intervalo (horas)', accepted: 'Aceita', decision: 'Decisão', finalDue: 'Prazo final',
  internalCalculado: 'Prazo interno calculado pelo tipo', internalDays: 'Prazo interno: dias úteis antes do limite', kind: 'Tipo', term: 'Termo de busca', document: 'Documento (CPF/CNPJ)', cnpj: 'CNPJ', companyName: 'Razão social',
  avoidable: 'Evitável', rootCause: 'Causa raiz', rootCauseArea: 'Área da causa raiz', hearing: 'Audiência', date: 'Data', scope: 'Abrangência',
};
const VALUE: Record<string, Record<string, string>> = {
  status: { todo: 'A fazer', doing: 'Em andamento', review: 'Aguardando revisão', done: 'Concluída', cancelled: 'Cancelada', confirmed: 'Confirmado', discarded: 'Descartado' },
  portfolio: { civil: 'Cível', labor: 'Trabalhista', procon: 'Procon' },
  prognosis: { probable: 'Provável', possible: 'Possível', remote: 'Remoto' },
  triage: { task_created: 'Criou tarefa (alerta lido)', discarded: 'Ignorado', linked: 'Lido', pending: 'Pendente' },
  origin: { manual: 'Cadastrada à mão', ai_suggestion: 'Sugestão da IA', migration: 'Migração' },
  role: { admin: 'Administrador', lawyer: 'Advogada', viewer: 'Leitura' },
  kind: { name: 'Nome da parte', lawyer: 'Advogado', oab: 'OAB', cnpj: 'CNPJ', digital: 'Digital', physical: 'Físico' },
  decision: { accepted: 'Aceita', edited: 'Ajustada', rejected: 'Recusada' },
};
const MONEY = new Set(['riskTotal', 'riskMaterial', 'riskMoral', 'claimValue', 'settlementLimit']);
const HIDDEN = new Set(['id', 'createdAt', 'updatedAt', 'caseId_', 'passwordHash']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const humanize = (k: string) => LABEL[k] ?? k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** Todos os ids (uuid ou id de usuário) que aparecem no diff, para o servidor resolver os nomes de uma vez. */
export function collectIds(diff: unknown, out = new Set<string>()): Set<string> {
  if (typeof diff === 'string') { if (UUID.test(diff) || /^[A-Za-z0-9]{20,}$/.test(diff)) out.add(diff); }
  else if (Array.isArray(diff)) diff.forEach((v) => collectIds(v, out));
  else if (diff && typeof diff === 'object') Object.values(diff).forEach((v) => collectIds(v, out));
  return out;
}

function fmt(key: string, v: unknown, names: NameMap): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') return MONEY.has(key) ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : String(v);
  if (typeof v === 'string') {
    if (names.has(v)) return names.get(v)!;
    if (UUID.test(v)) return '(registro removido)';
    if (VALUE[key]?.[v]) return VALUE[key][v];
    if (ISO_TS.test(v)) return new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
    if (ISO_DAY.test(v)) return v.split('-').reverse().join('/');
    if (key === 'number' && /^\d{20}$/.test(v)) return formatCaseNumber(v);
    if (MONEY.has(key) && /^-?\d+(\.\d+)?$/.test(v)) return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return v;
  }
  if (key === 'pct' && typeof v === 'object') {
    const p = v as Record<string, number>;
    return `Provável ${p.probable}% · Possível ${p.possible}% · Remoto ${p.remote}%`;
  }
  if (Array.isArray(v)) return v.map((x) => fmt(key, x, names) ?? 'vazio').join(', ');
  return Object.entries(v as Record<string, unknown>).filter(([k]) => !HIDDEN.has(k)).map(([k, x]) => `${humanize(k)}: ${fmt(k, x, names) ?? 'vazio'}`).join(' · ');
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function formatAuditDiff(diff: unknown, names: NameMap = new Map()): AuditLine[] {
  if (!isObj(diff)) return [];
  const lines: AuditLine[] = [];
  const push = (key: string, before: unknown, after: unknown) => {
    if (HIDDEN.has(key)) return;
    const b = fmt(key, before, names), a = fmt(key, after, names);
    if (b === a) return;
    lines.push({ label: humanize(key), before: b, after: a });
  };
  const hasSides = ('before' in diff || 'after' in diff) && [diff.before, diff.after].every((x) => x === undefined || x === null || isObj(x));
  if (hasSides) {
    const b = (isObj(diff.before) ? diff.before : {}) as Record<string, unknown>;
    const a = (isObj(diff.after) ? diff.after : {}) as Record<string, unknown>;
    const creating = !isObj(diff.before);
    for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) push(k, creating ? undefined : b[k], a[k]);
    for (const [k, v] of Object.entries(diff)) if (k !== 'before' && k !== 'after') push(k, undefined, v);
    return lines;
  }
  for (const [k, v] of Object.entries(diff)) {
    if (isObj(v) && ('before' in v || 'after' in v)) push(k, v.before, v.after);
    else if (k === 'discarded' && Array.isArray(v)) lines.push({ label: 'Alertas ignorados', before: null, after: `${v.length}` });
    else push(k, undefined, v);
  }
  return lines;
}
