import { todayInSaoPaulo } from '@/lib/deadlines';

/**
 * Limite de recuperação quando a consulta diária ficou parada (worker fora do ar, falha da API): olha para trás só até
 * este número de dias, para a rotina continuar "diária" e nunca virar uma varredura de semanas.
 */
export const MAX_CATCHUP_DAYS = Number(process.env.DJEN_MAX_CATCHUP_DAYS ?? 7);

/**
 * Início da janela da consulta automática. Cobre o intervalo configurado (1, 6, 12 ou 24 h) e, se a rotina ficou parada
 * (worker fora do ar, falha da API), volta até a última execução bem-sucedida, limitado a `maxCatchupDays`. O DJEN informa
 * só a data, então o resultado é a DATA (Brasília) desse instante; o que já foi importado não duplica (cada publicação tem id).
 */
export function automaticWindowStart(o: { lastRunAt?: Date | null; now: Date; intervalHours: number; maxCatchupDays?: number }): string {
  const base = o.now.getTime() - o.intervalHours * 3_600_000;
  let from = o.lastRunAt && o.lastRunAt.getTime() < base ? o.lastRunAt.getTime() : base;
  const floor = o.now.getTime() - (o.maxCatchupDays ?? MAX_CATCHUP_DAYS) * 86_400_000;
  if (from < floor) from = floor;
  return todayInSaoPaulo(new Date(from));
}

/** Opções de intervalo oferecidas ao admin, em horas. */
export const ALLOWED_HOURS = [1, 6, 12, 24] as const;
export type Hours = (typeof ALLOWED_HOURS)[number];
export const isAllowedHours = (h: unknown): h is Hours => (ALLOWED_HOURS as readonly unknown[]).includes(h);

/**
 * Janela explícita pedida pelo admin: "últimas N horas". O DJEN informa só a DATA da publicação (sem horário), então a
 * consulta usa a data do instante "agora menos N horas" (fuso de Brasília): 1 h às 09h = só hoje; 12 h às 09h = de ontem a
 * hoje. Quem já foi importado não duplica (cada publicação tem id), então janela maior que o necessário só custa requisições.
 */
export const windowStartForHours = (hours: number, now: Date) => todayInSaoPaulo(new Date(now.getTime() - hours * 3_600_000));
