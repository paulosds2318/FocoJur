/** Datas como 'YYYY-MM-DD' (coluna `date`), sempre calculadas em UTC para não variar com o fuso do servidor. */
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const toStr = (d: Date) => d.toISOString().slice(0, 10);

export function isWeekend(s: string) {
  const w = toDate(s).getUTCDay();
  return w === 0 || w === 6;
}

export function isBusinessDay(s: string, holidays: ReadonlySet<string>) {
  return !isWeekend(s) && !holidays.has(s);
}

export function addDays(s: string, n: number) {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toStr(d);
}

/**
 * Prazo em dias úteis (regra 2): exclui sábados, domingos e feriados; a contagem começa no
 * primeiro dia útil seguinte à data de início (que não conta).
 */
export function addBusinessDays(start: string, days: number, holidays: ReadonlySet<string>) {
  let cur = start;
  let left = days;
  while (left > 0) {
    cur = addDays(cur, 1);
    if (isBusinessDay(cur, holidays)) left--;
  }
  return cur;
}

/** Volta N dias úteis a partir de `from` (o inverso de addBusinessDays): usado no prazo interno = limite - N dias úteis. */
export function subBusinessDays(from: string, days: number, holidays: ReadonlySet<string>) {
  let cur = from;
  let left = days;
  while (left > 0) {
    cur = addDays(cur, -1);
    if (isBusinessDay(cur, holidays)) left--;
  }
  return cur;
}

/** Prazo em dias corridos; se vencer em dia não útil, prorroga para o próximo dia útil. */
export function addCalendarDays(start: string, days: number, holidays: ReadonlySet<string>) {
  let cur = addDays(start, days);
  while (!isBusinessDay(cur, holidays)) cur = addDays(cur, 1);
  return cur;
}

/** Dias úteis entre duas datas (exclusivo do início, inclusivo do fim); negativo se `to` < `from`. */
export function businessDaysBetween(from: string, to: string, holidays: ReadonlySet<string>) {
  if (to === from) return 0;
  const sign = to > from ? 1 : -1;
  const [a, b] = sign === 1 ? [from, to] : [to, from];
  let cur = a;
  let n = 0;
  while (cur < b) {
    cur = addDays(cur, 1);
    if (isBusinessDay(cur, holidays)) n++;
  }
  return n * sign;
}

export type Urgency = 'late' | 'today' | 'soon' | 'normal';

/** RF-22: atrasado e hoje = danger; até 2 dias úteis = warn; demais = neutro. */
export function urgency(due: string | null, today: string, holidays: ReadonlySet<string>): Urgency {
  if (!due) return 'normal';
  if (due < today) return 'late';
  if (due === today) return 'today';
  return businessDaysBetween(today, due, holidays) <= 2 ? 'soon' : 'normal';
}

export function todayInSaoPaulo(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now); // YYYY-MM-DD
}
