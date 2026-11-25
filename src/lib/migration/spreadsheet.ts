import { extractContractCodes, normalizeCaseNumber } from '@/lib/case-number';

// ---------- utilidades de célula ----------
export const norm = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as { text?: string; richText?: { text: string }[]; result?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join('').trim();
    if (o.text) return String(o.text).trim();
    if (o.result !== undefined) return cellText(o.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v).trim();
}

/** Aceita número, "R$ 1.234,56", "1234.56". Texto livre devolve null (e o chamador registra a exceção). */
export function parseMoney(v: unknown): { value: number | null; invalid: boolean } {
  if (v === null || v === undefined || cellText(v) === '') return { value: null, invalid: false };
  if (typeof v === 'number') return { value: Number.isFinite(v) ? v : null, invalid: !Number.isFinite(v) };
  const t = cellText(v).replace(/R\$\s*/i, '').trim();
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(t)) return { value: Number(t.replace(/\./g, '').replace(',', '.')), invalid: false };
  if (/^-?\d+([.,]\d+)?$/.test(t)) return { value: Number(t.replace(',', '.')), invalid: false };
  return { value: null, invalid: true };
}

/** Datas do Excel (Date), "dd/mm/aaaa" ou "aaaa-mm-dd" → 'YYYY-MM-DD'. */
export function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const t = cellText(v);
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// ---------- mapeamento de abas e colunas (ajustar aos nomes reais da planilha) ----------
export type SheetKind = { portfolio: 'civil' | 'labor' | 'procon'; polarity?: 'passive' | 'active'; closedSheet?: boolean };

/** Abas ainda sem fluxo próprio (Polo Ativo, Fiscal, Parceiros, Sinistros, Consulta) entram como dados da carteira Cível. */
export function sheetKind(name: string): SheetKind | null {
  const n = norm(name);
  if (/(GRAFICOS|PAINEL|INDICADORES|CONSULTA|LEGENDA|LISTAS|AUX)/.test(n)) return null; // abas de apoio/indicadores
  if (n.includes('PROCON')) return { portfolio: 'procon', closedSheet: /ENCERR|20\d\d/.test(n) };
  if (n.includes('TRABALHISTA')) return { portfolio: 'labor', closedSheet: /ENCERR/.test(n) || (/20\d\d/.test(n) && !/2026/.test(n)) };
  if (n.includes('POLO ATIVO')) return { portfolio: 'civil', polarity: 'active' };
  if (/(CIVEL|FISCAL|PARCEIRO|SINISTRO)/.test(n)) return { portfolio: 'civil', closedSheet: /ENCERR/.test(n) || (/20\d\d/.test(n) && !/2026/.test(n)) };
  if (/ENCERR/.test(n)) return { portfolio: 'civil', closedSheet: true };
  return null;
}

export const FIELD_ALIASES: Record<string, string[]> = {
  number: ['NUMERO DO PROCESSO', 'NUMERO PROCESSO', 'PROCESSO', 'N PROCESSO', 'NUMERO'],
  system: ['SISTEMA', 'PORTAL', 'SISTEMA PORTAL'],
  state: ['UF', 'ESTADO'],
  city: ['COMARCA', 'CIDADE', 'MUNICIPIO'],
  court: ['VARA', 'ORGAO', 'VARA ORGAO'],
  courtType: ['FORO', 'ESFERA', 'FORO ESFERA'],
  status: ['STATUS', 'SITUACAO', 'STATUS DO PROCESSO'],
  active: ['ATIVO'],
  owner: ['ADVOGADA RESPONSAVEL', 'RESPONSAVEL', 'ADVOGADO RESPONSAVEL', 'ADVOGADA', 'ADV RESPONSAVEL'],
  receivedAt: ['DATA DE RECEBIMENTO', 'RECEBIMENTO', 'DATA RECEBIMENTO', 'RECEBIDO EM'],
  citedAt: ['DATA DA CITACAO', 'CITACAO', 'DATA CITACAO'],
  closedAt: ['DATA DE ENCERRAMENTO', 'ENCERRAMENTO', 'DATA ENCERRAMENTO'],
  closingReason: ['MOTIVO DE ENCERRAMENTO', 'MOTIVO ENCERRAMENTO'],
  costCenter: ['CENTRO DE CUSTO', 'LOJA', 'CC'],
  details: ['DETALHAMENTO', 'DETALHE', 'DESCRICAO', 'OBSERVACAO'],
  plaintiff: ['DEMANDANTE', 'AUTOR', 'RECLAMANTE'],
  subject: ['OBJETO'],
  claim: ['PEDIDO'],
  prognosis: ['PROGNOSTICO'],
  riskTotal: ['VALOR DE RISCO', 'VALOR RISCO', 'RISCO TOTAL'],
  riskMaterial: ['RISCO DANO MATERIAL', 'DANO MATERIAL'],
  riskMoral: ['RISCO DANO MORAL', 'DANO MORAL'],
  claimValue: ['VALOR DA CAUSA'],
  avoidable: ['EVITAVEL', 'O PROCESSO ERA EVITAVEL PELA FOCO'],
  rootCause: ['DETALHE DO ERRO E QUAL SERIA A SOLUCAO', 'DETALHE DO ERRO', 'CAUSA RAIZ'],
  plate: ['PLACA'],
  vehicleModel: ['MODELO'],
  rentalType: ['TIPO DE LOCACAO', 'TIPO LOCACAO'],
};

export function mapHeaders(headerRow: unknown[]): Record<string, number> {
  const idx: Record<string, number> = {};
  const normalized = headerRow.map(norm);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const aliasSet = aliases.map(norm);
    const i = normalized.findIndex((h) => aliasSet.includes(h));
    if (i !== -1) idx[field] = i;
  }
  return idx;
}

// ---------- normalização contra as listas oficiais ----------
const SYSTEM_ALIASES: Record<string, string> = {
  PJE: 'PJe', EPROC: 'eProc', PROJUDI: 'Projudi', PROUJDI: 'Projudi', ESAJ: 'eSaj', 'E SAJ': 'eSaj',
  DOMICILIO: 'Domicílio Judicial', 'DOMICILIO JUDICIAL': 'Domicílio Judicial',
  'PROCESSO ELETRONICO': 'Processo Eletrônico TJRJ', 'PROCESSO ELETRONICO TJRJ': 'Processo Eletrônico TJRJ',
  'PORTAL DO ADVOGADO': 'Portal do Advogado SE',
};
export const normalizeSystem = (v: string) => SYSTEM_ALIASES[norm(v)] ?? v.trim();

const PROGNOSIS: Record<string, 'probable' | 'possible' | 'remote'> = {
  PROVAVEL: 'probable', POSSIVEL: 'possible', REMOTO: 'remote',
};
export const parsePrognosis = (v: string) => PROGNOSIS[norm(v)] ?? null;

export const parseBool = (v: string): boolean | null => {
  const n = norm(v);
  if (['SIM', 'S', 'TRUE', '1', 'YES'].includes(n)) return true;
  if (['NAO', 'N', 'FALSE', '0', 'NO'].includes(n)) return false;
  return null;
};

// ---------- linha → registro + exceções ----------
export type Severity = 'grave' | 'aviso';
export type Issue = { severity: Severity; code: string; message: string };

export type CaseRecord = {
  sheet: string; row: number; number: string; portfolio: SheetKind['portfolio']; polarity: 'passive' | 'active'; closedSheet: boolean;
  system: string | null; state: string | null; city: string | null; court: string | null; courtType: string | null;
  status: string | null; active: boolean | null; owner: string | null;
  receivedAt: string | null; citedAt: string | null; closedAt: string | null; closingReason: string | null;
  costCenter: string | null; details: string | null; plaintiff: string | null; subject: string | null; claim: string | null;
  prognosis: 'probable' | 'possible' | 'remote' | null;
  riskTotal: number | null; riskMaterial: number | null; riskMoral: number | null; claimValue: number | null;
  avoidable: boolean | null; rootCause: string | null; plate: string | null; vehicleModel: string | null; rentalType: string | null;
  contracts: string[];
  issues: Issue[];
};

export function rowToRecord(
  sheet: string, rowNumber: number, kind: SheetKind, idx: Record<string, number>, cells: unknown[], currentYear = new Date().getFullYear(),
): CaseRecord | null {
  const get = (f: string) => (idx[f] === undefined ? '' : cellText(cells[idx[f]]));
  const raw = (f: string) => (idx[f] === undefined ? undefined : cells[idx[f]]);
  const numberRaw = get('number');
  if (!numberRaw) return null; // linha vazia

  const issues: Issue[] = [];
  const money = (f: string, label: string) => {
    const r = parseMoney(raw(f));
    if (r.invalid) issues.push({ severity: 'aviso', code: 'valor_invalido', message: `${label} não numérico: "${get(f)}" (campo ficou vazio)` });
    return r.value;
  };
  const date = (f: string, label: string) => {
    const d = parseDate(raw(f));
    if (get(f) && !d) issues.push({ severity: 'aviso', code: 'data_invalida', message: `${label} inválida: "${get(f)}"` });
    return d;
  };

  const receivedAt = date('receivedAt', 'Data de recebimento');
  const citedAt = date('citedAt', 'Data da citação');
  const closedAt = date('closedAt', 'Data de encerramento');
  for (const [d, label] of [[receivedAt, 'recebimento'], [citedAt, 'citação'], [closedAt, 'encerramento']] as const) {
    if (d && Number(d.slice(0, 4)) > currentYear) issues.push({ severity: 'aviso', code: 'ano_futuro', message: `Ano futuro na data de ${label}: ${d}` });
  }

  const status = get('status') || null;
  const active = idx.active === undefined ? null : parseBool(get('active'));
  const statusClosed = status ? /ENCERR|ARQUIV|EXTINT/.test(norm(status)) : false;
  if (active === true && (statusClosed || closedAt)) {
    issues.push({ severity: 'aviso', code: 'ativo_x_encerrado', message: 'ATIVO = SIM, mas o status/data indica encerrado (regra da coluna ATIVO a definir com o Jurídico)' });
  }
  if (kind.closedSheet && active === true) {
    issues.push({ severity: 'aviso', code: 'ativo_em_aba_encerrada', message: 'ATIVO = SIM em aba de encerrados' });
  }

  const prognosisRaw = get('prognosis');
  const prognosis = parsePrognosis(prognosisRaw);
  if (prognosisRaw && !prognosis) issues.push({ severity: 'aviso', code: 'prognostico_desconhecido', message: `Prognóstico não reconhecido: "${prognosisRaw}"` });

  const riskTotal = money('riskTotal', 'Valor de risco');
  const riskMaterial = money('riskMaterial', 'Risco dano material');
  const riskMoral = money('riskMoral', 'Risco dano moral');
  const claimValue = money('claimValue', 'Valor da causa');
  if ((riskMaterial ?? 0) + (riskMoral ?? 0) > (riskTotal ?? 0) + 0.01 && riskTotal !== null) {
    issues.push({ severity: 'aviso', code: 'risco_inconsistente', message: 'Material + moral maior que o risco total' });
  }

  const details = get('details') || null;
  const contracts = extractContractCodes(`${details ?? ''} ${get('rootCause')}`.toUpperCase());

  return {
    sheet, row: rowNumber, number: normalizeCaseNumber(numberRaw) || numberRaw, portfolio: kind.portfolio, polarity: kind.polarity ?? 'passive', closedSheet: !!kind.closedSheet,
    system: get('system') ? normalizeSystem(get('system')) : null, state: get('state').toUpperCase().slice(0, 2) || null,
    city: get('city') || null, court: get('court') || null, courtType: get('courtType') || null, status, active,
    owner: get('owner') || null, receivedAt, citedAt, closedAt, closingReason: get('closingReason') || null,
    costCenter: get('costCenter').toUpperCase() || null, details, plaintiff: get('plaintiff') || null,
    subject: get('subject') || null, claim: get('claim') || null, prognosis, riskTotal, riskMaterial, riskMoral, claimValue,
    avoidable: idx.avoidable === undefined ? null : parseBool(get('avoidable')), rootCause: get('rootCause') || null,
    plate: get('plate').toUpperCase() || null, vehicleModel: get('vehicleModel') || null, rentalType: get('rentalType') || null,
    contracts, issues,
  };
}

/** Detecta número duplicado entre abas (o primeiro vence; os demais viram exceção grave). Modifica `issues` in place. */
export function markDuplicates(records: CaseRecord[]) {
  const seen = new Map<string, CaseRecord>();
  for (const r of records) {
    const key = `${r.portfolio}:${r.number}`;
    const first = seen.get(key);
    if (first) {
      r.issues.push({ severity: 'grave', code: 'numero_duplicado', message: `Número já aparece em ${first.sheet} (linha ${first.row}); esta linha não será importada` });
    } else seen.set(key, r);
  }
  return records;
}

/** Quem importa: sem exceção grave. */
export const isImportable = (r: CaseRecord) => !r.issues.some((i) => i.severity === 'grave');
