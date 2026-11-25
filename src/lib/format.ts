const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function money(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === '') return '—';
  return brl.format(Number(v));
}

/** Aceita 'YYYY-MM-DD' (coluna date) ou Date. */
export function dateBr(v: string | Date | null | undefined) {
  if (!v) return '—';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split('-').reverse().join('/');
  return new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function dateTimeBr(v: string | Date | null | undefined) {
  if (!v) return '—';
  return new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
}

export const PORTFOLIO_LABEL = { civil: 'Cível', labor: 'Trabalhista', procon: 'Procon' } as const;
export const PROGNOSIS_LABEL = { probable: 'Provável', possible: 'Possível', remote: 'Remoto' } as const;
export const PROGNOSIS_CLS = { probable: 'b-red', possible: 'b-yel', remote: 'b-teal' } as const;

/** Valor do banco ('2450.00') no formato de digitação pt-BR ('2.450,00'), para preencher formulários. */
export function moneyInput(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === '') return '';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
