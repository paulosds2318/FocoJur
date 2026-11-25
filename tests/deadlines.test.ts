import { describe, expect, it } from 'vitest';
import { addBusinessDays, addCalendarDays, businessDaysBetween, urgency } from '@/lib/deadlines';

const H = new Set(['2026-11-20', '2026-12-25']);

describe('prazos em dias úteis', () => {
  it('pula fins de semana e feriados', () => {
    // 13/11/2026 é sexta; 15 dias úteis com o feriado de 20/11 → 07/12/2026 (segunda)
    expect(addBusinessDays('2026-11-13', 1, H)).toBe('2026-11-16');
    expect(addBusinessDays('2026-11-13', 5, H)).toBe('2026-11-23'); // 16,17,18,19,(20 feriado),23
    expect(addBusinessDays('2026-11-13', 15, H)).toBe('2026-12-07');
  });
  it('dias corridos prorrogam para o próximo dia útil', () => {
    expect(addCalendarDays('2026-11-13', 1, H)).toBe('2026-11-16'); // sábado → segunda
    expect(addCalendarDays('2026-11-13', 7, H)).toBe('2026-11-23'); // 20/11 feriado... 20 é sexta; +7 = 20/11 → 23/11
  });
  it('conta dias úteis entre datas', () => {
    expect(businessDaysBetween('2026-11-13', '2026-11-16', H)).toBe(1);
    expect(businessDaysBetween('2026-11-16', '2026-11-13', H)).toBe(-1);
    expect(businessDaysBetween('2026-11-13', '2026-11-13', H)).toBe(0);
  });
});

describe('urgência (RF-22)', () => {
  it('classifica atrasado, hoje, até 2 dias úteis e neutro', () => {
    expect(urgency('2026-11-12', '2026-11-13', H)).toBe('late');
    expect(urgency('2026-11-13', '2026-11-13', H)).toBe('today');
    expect(urgency('2026-11-17', '2026-11-13', H)).toBe('soon'); // 2 dias úteis
    expect(urgency('2026-11-18', '2026-11-13', H)).toBe('normal');
    expect(urgency(null, '2026-11-13', H)).toBe('normal');
  });
});
