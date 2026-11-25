/** Feriados nacionais e pontos facultativos usados no calendário forense (2026 e 2027). Estaduais, municipais e do tribunal entram por cadastro. */
export const NATIONAL_HOLIDAYS: [string, string][] = [
  ['2026-01-01', 'Confraternização Universal'],
  ['2026-02-16', 'Carnaval'],
  ['2026-02-17', 'Carnaval'],
  ['2026-04-03', 'Sexta-feira Santa'],
  ['2026-04-21', 'Tiradentes'],
  ['2026-05-01', 'Dia do Trabalho'],
  ['2026-06-04', 'Corpus Christi'],
  ['2026-09-07', 'Independência'],
  ['2026-10-12', 'Nossa Senhora Aparecida'],
  ['2026-11-02', 'Finados'],
  ['2026-11-20', 'Consciência Negra'],
  ['2026-12-24', 'Recesso forense'],
  ['2026-12-25', 'Natal'],
  ['2026-12-31', 'Recesso forense'],
  ['2027-01-01', 'Confraternização Universal'],
  ['2027-02-08', 'Carnaval'],
  ['2027-02-09', 'Carnaval'],
  ['2027-03-26', 'Sexta-feira Santa'],
  ['2027-04-21', 'Tiradentes'],
  ['2027-05-01', 'Dia do Trabalho'],
  ['2027-05-27', 'Corpus Christi'],
  ['2027-09-07', 'Independência'],
  ['2027-10-12', 'Nossa Senhora Aparecida'],
  ['2027-11-02', 'Finados'],
  ['2027-11-15', 'Proclamação da República'],
  ['2027-11-20', 'Consciência Negra'],
  ['2027-12-24', 'Recesso forense'],
  ['2027-12-25', 'Natal'],
  ['2027-12-31', 'Recesso forense'],
];

/**
 * Recesso forense (CPC art. 220): de 20/12 a 20/01 os prazos ficam suspensos; no cálculo os dias contam como não úteis.
 * Dias que já são feriado nacional (Natal, Ano Novo) ficam com o nome original (o seed não duplica a data).
 */
export function recessoForense(startYear: number): [string, string][] {
  const out: [string, string][] = [];
  const day = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  for (let d = 20; d <= 31; d++) out.push([day(startYear, 12, d), 'Recesso forense']);
  for (let d = 1; d <= 20; d++) out.push([day(startYear + 1, 1, d), 'Recesso forense']);
  return out;
}
export const FORENSIC_RECESS: [string, string][] = [2026, 2027, 2028].flatMap(recessoForense);

/**
 * Feriados forenses que variam por tribunal (por isso não entram como nacionais): o admin os cadastra para uma UF ou para um
 * tribunal/vara na tela de Feriados. `md` = mês-dia.
 */
export const COMMON_COURT_HOLIDAYS: { key: string; md: string; label: string }[] = [
  { key: 'dia_do_advogado', md: '08-11', label: 'Dia do Advogado' },
  { key: 'dia_da_justica', md: '12-08', label: 'Dia da Justiça' },
];
