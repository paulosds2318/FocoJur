import { isAllowedHours, type Hours } from './window';

/** Padrão: a cada 1 hora. O admin escolhe 1, 6, 12 ou 24 em Monitoramento, e a escolha vale para tudo (consulta automática, busca de termo, "Buscar de novo" e "Rodar agora"). */
export const DEFAULT_INTERVAL_HOURS: Hours = 1;

/**
 * Expressão cron (America/Sao_Paulo) de uma consulta automática "a cada N horas". 24 h mantém o horário de sempre (6h da manhã,
 * quando as publicações do dia anterior já estão fechadas); os demais cabem em 24 h sem deixar buraco.
 */
export function cronForInterval(hours: number): string {
  switch (hours) {
    case 1: return '0 * * * *';
    case 6: return '0 0,6,12,18 * * *';
    case 12: return '0 6,18 * * *';
    default: return '0 6 * * *';
  }
}

export const parseInterval = (raw: string | null | undefined): Hours => {
  const n = Number(raw);
  return isAllowedHours(n) ? n : DEFAULT_INTERVAL_HOURS;
};

/** Horários de execução em linguagem simples, para a tela. */
export function runTimesLabel(hours: number): string {
  return hours === 1 ? 'toda hora cheia' : hours === 6 ? 'às 00h, 06h, 12h e 18h' : hours === 12 ? 'às 06h e às 18h' : 'todo dia às 06h';
}
