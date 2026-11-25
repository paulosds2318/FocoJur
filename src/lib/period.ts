import { todayInSaoPaulo } from '@/lib/deadlines';

/**
 * Filtro de período compartilhado por Painéis e Custos de IA (e pelo CSV de custos).
 * Vem da URL (compartilhável), é validado aqui e nunca lança: entrada inválida cai no padrão com uma mensagem curta.
 * Todas as datas são AAAA-MM-DD no fuso America/Sao_Paulo; `from` e `to` são inclusivos.
 */
export type PeriodMode = 'all' | 'today' | '7d' | 'month' | 'ym' | 'custom';

export type Period = {
  mode: PeriodMode;
  from: string | null; // nulo só no modo 'all' (sem filtro)
  to: string | null;
  label: string; // texto para a tela e para o nome do CSV
  month: number; // mês selecionado (modo 'ym'; nos demais, o mês atual — usado nos seletores)
  year: number;
  notice: string | null; // aviso quando a entrada era inválida e caiu no padrão
  pick: 'ym' | 'custom' | null; // qual formulário a tela deve mostrar (a pessoa escolheu 'Mês e ano' ou 'Período personalizado')
};

export type PeriodInput = { periodo?: string; mes?: string; ano?: string; de?: string; ate?: string };

export const PERIOD_MODES_CUSTOS = ['today', '7d', 'month', 'ym', 'custom'] as const satisfies readonly PeriodMode[];
export const PERIOD_MODES_PAINEIS = ['all', 'ym', 'custom'] as const satisfies readonly PeriodMode[];

export const MIN_YEAR = 2020;
export const MAX_SPAN_YEARS = 5;
export const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const pad = (n: number) => String(n).padStart(2, '0');
const brDate = (iso: string) => iso.split('-').reverse().join('/');

/** AAAA-MM-DD existente no calendário (rejeita 2026-02-30). */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const addDaysIso = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const addYearsIso = (s: string, years: number) => `${Number(s.slice(0, 4)) + years}${s.slice(4)}`;

const strict = (v: string | undefined) => (v ?? '').trim();

function build(mode: PeriodMode, today: string, extra: Partial<Pick<Period, 'month' | 'year' | 'from' | 'to'>> = {}): Omit<Period, 'notice' | 'pick'> {
  const cy = Number(today.slice(0, 4));
  const cm = Number(today.slice(5, 7));
  const base = { month: extra.month ?? cm, year: extra.year ?? cy };
  switch (mode) {
    case 'all': return { mode, from: null, to: null, label: 'Sem filtro de período', ...base };
    case 'today': return { mode, from: today, to: today, label: `Hoje (${brDate(today)})`, ...base };
    case '7d': return { mode, from: addDaysIso(today, -6), to: today, label: `Últimos 7 dias (${brDate(addDaysIso(today, -6))} a ${brDate(today)})`, ...base };
    case 'month': {
      const from = `${cy}-${pad(cm)}-01`;
      return { mode, from, to: today, label: `${MONTH_NAMES[cm - 1]} de ${cy} (mês atual, até hoje)`, ...base };
    }
    case 'ym': {
      const m = extra.month ?? cm, y = extra.year ?? cy;
      return { mode, from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}`, label: `${MONTH_NAMES[m - 1]} de ${y}`, month: m, year: y };
    }
    case 'custom':
      return { mode, from: extra.from!, to: extra.to!, label: `${brDate(extra.from!)} a ${brDate(extra.to!)}`, ...base };
  }
}

/**
 * @param allowed modos aceitos nesta tela (o primeiro que não casar cai em `fallback`)
 * @param fallback modo padrão da tela
 */
export function parsePeriod(
  input: PeriodInput,
  opts: { allowed: readonly PeriodMode[]; fallback: PeriodMode; today?: string },
): Period {
  const today = opts.today ?? todayInSaoPaulo();
  const cy = Number(today.slice(0, 4));
  const fallback = (notice: string | null, pick: Period['pick'] = null): Period => ({ ...build(opts.fallback, today), notice, pick });

  const raw = strict(input.periodo);
  if (!raw) return fallback(null);
  const mode = (opts.allowed as readonly string[]).includes(raw) ? (raw as PeriodMode) : null;
  if (!mode) return fallback('Período desconhecido; mostrando o padrão.');

  if (mode === 'ym') {
    const mes = strict(input.mes), ano = strict(input.ano);
    const month = mes === '' ? Number(today.slice(5, 7)) : /^\d{1,2}$/.test(mes) ? Number(mes) : NaN;
    const year = ano === '' ? cy : /^\d{4}$/.test(ano) ? Number(ano) : NaN;
    if (!(month >= 1 && month <= 12) || !(year >= MIN_YEAR && year <= cy + 1)) {
      return fallback(`Mês ou ano inválido (mês de 1 a 12, ano de ${MIN_YEAR} a ${cy + 1}); mostrando o padrão.`, 'ym');
    }
    return { ...build('ym', today, { month, year }), notice: null, pick: 'ym' };
  }

  if (mode === 'custom') {
    const de = strict(input.de), ate = strict(input.ate);
    if (!de && !ate) return fallback(null, 'custom'); // escolheu o modo e ainda não informou as datas: mostra o formulário
    if (!isIsoDate(de) || !isIsoDate(ate)) return fallback('Informe as duas datas do período (AAAA-MM-DD); mostrando o padrão.', 'custom');
    if (ate < de) return fallback('A data final não pode ser anterior à inicial; mostrando o padrão.', 'custom');
    if (ate > addYearsIso(de, MAX_SPAN_YEARS)) return fallback(`O período pode ter no máximo ${MAX_SPAN_YEARS} anos; mostrando o padrão.`, 'custom');
    if (de < `${MIN_YEAR}-01-01`) return fallback(`A data inicial não pode ser anterior a ${MIN_YEAR}; mostrando o padrão.`, 'custom');
    return { ...build('custom', today, { from: de, to: ate }), notice: null, pick: 'custom' };
  }

  return { ...build(mode, today), notice: null, pick: null };
}

/** Parâmetros de URL que reproduzem exatamente este período (para links, CSV e formulários). */
export function periodParams(p: Period): Record<string, string> {
  if (p.mode === 'ym') return { periodo: 'ym', mes: String(p.month), ano: String(p.year) };
  if (p.mode === 'custom') return { periodo: 'custom', de: p.from!, ate: p.to! };
  return { periodo: p.mode };
}

/** Meses (AAAA-MM) cobertos por [from, to], do mais antigo ao mais novo. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
