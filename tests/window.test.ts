import { describe, expect, it } from 'vitest';
import { cronForInterval, parseInterval, runTimesLabel } from '@/lib/connectors/schedule';
import { ALLOWED_HOURS, automaticWindowStart, isAllowedHours, windowStartForHours } from '@/lib/connectors/window';

// 17/11/2026, 09h em Brasília
const now = new Date('2026-11-17T12:00:00Z');
const at = (iso: string) => new Date(iso);

describe('janela da consulta automática acompanha o intervalo configurado', () => {
  it('cobre o intervalo: 1 h às 09h = só hoje; 24 h às 09h = de ontem a hoje', () => {
    expect(automaticWindowStart({ now, intervalHours: 1 })).toBe('2026-11-17');
    expect(automaticWindowStart({ now, intervalHours: 6 })).toBe('2026-11-17');
    expect(automaticWindowStart({ now, intervalHours: 12 })).toBe('2026-11-16');
    expect(automaticWindowStart({ now, intervalHours: 24 })).toBe('2026-11-16');
    // 00h30 de Brasília: a janela de 1 h ainda é de ontem
    expect(automaticWindowStart({ now: at('2026-11-17T03:30:00Z'), intervalHours: 1 })).toBe('2026-11-16');
  });

  it('execução normal (a última foi há 1 h) não alarga a janela', () => {
    expect(automaticWindowStart({ now, intervalHours: 1, lastRunAt: at('2026-11-17T11:00:30Z') })).toBe('2026-11-17');
  });

  it('se a rotina ficou parada, volta até a última execução boa (não perde a madrugada), com limite', () => {
    // parou às 22h de 16/11 (Brasília) e voltou às 09h de 17/11: precisa olhar de ontem, mesmo com intervalo de 1 h
    expect(automaticWindowStart({ now, intervalHours: 1, lastRunAt: at('2026-11-17T01:00:00Z') })).toBe('2026-11-16');
    expect(automaticWindowStart({ now, intervalHours: 1, lastRunAt: at('2026-11-14T15:00:00Z') })).toBe('2026-11-14'); // 3 dias parada
    expect(automaticWindowStart({ now, intervalHours: 1, lastRunAt: at('2026-10-01T12:00:00Z') })).toBe('2026-11-10'); // 47 dias: limite de 7
    expect(automaticWindowStart({ now, intervalHours: 1, lastRunAt: at('2026-10-01T12:00:00Z'), maxCatchupDays: 3 })).toBe('2026-11-14');
  });
});

describe('busca escolhida pelo admin, em horas', () => {
  it('usa a data do instante "agora menos N horas" no fuso de Brasília', () => {
    expect(windowStartForHours(1, now)).toBe('2026-11-17');
    expect(windowStartForHours(6, now)).toBe('2026-11-17');
    expect(windowStartForHours(12, now)).toBe('2026-11-16');
    expect(windowStartForHours(24, now)).toBe('2026-11-16');
    expect(windowStartForHours(1, at('2026-11-17T03:30:00Z'))).toBe('2026-11-16');
    expect(windowStartForHours(24, at('2026-11-17T00:30:00Z'))).toBe('2026-11-15'); // 00h30 UTC não escorrega um dia
  });

  it('só oferece 1, 6, 12 e 24 horas (nada de dias)', () => {
    expect([...ALLOWED_HOURS]).toEqual([1, 6, 12, 24]);
    expect(isAllowedHours(6)).toBe(true);
    expect(isAllowedHours(48)).toBe(false);
    expect(isAllowedHours(720)).toBe(false);
  });
});

describe('agendamento do intervalo', () => {
  it('cada intervalo vira uma expressão cron sem buraco no dia; o padrão é a cada 1 hora', () => {
    expect(cronForInterval(24)).toBe('0 6 * * *');
    expect(cronForInterval(12)).toBe('0 6,18 * * *');
    expect(cronForInterval(6)).toBe('0 0,6,12,18 * * *');
    expect(cronForInterval(1)).toBe('0 * * * *');
    expect(cronForInterval(999)).toBe('0 6 * * *');
    expect(parseInterval(undefined)).toBe(1); // padrão: a cada 1 hora
    expect(parseInterval('12')).toBe(12);
    expect(parseInterval('720')).toBe(1); // 30 dias não é intervalo válido: volta ao padrão
    expect(runTimesLabel(12)).toBe('às 06h e às 18h');
    expect(runTimesLabel(1)).toBe('toda hora cheia');
  });
});
