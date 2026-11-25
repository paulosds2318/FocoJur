import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { todayInSaoPaulo } from '@/lib/deadlines';
import { monthsBetween, type Period } from '@/lib/period';

type Portfolio = 'civil' | 'labor' | 'procon' | '';

const rows = async <T>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];

/** Última revisão de risco por processo (a vigente). */
const LATEST_RISK = sql`(select distinct on (case_id) case_id, prognosis, risk_total from case_risk order by case_id, reviewed_at desc)`;

/** Data de entrada do processo: recebimento ou, na falta, a criação (no fuso de São Paulo). */
const entryDate = (alias: string) => sql`coalesce(${sql.raw(alias)}.received_at, (${sql.raw(alias)}.created_at at time zone 'America/Sao_Paulo')::date)`;

/** Meses do gráfico: sem filtro, os últimos 12; em "mês e ano", os 12 meses até o escolhido; em período personalizado, os meses do período. */
export function chartMonths(period: Period, today = todayInSaoPaulo()): string[] {
  const upTo12 = (end: string) => {
    const all = monthsBetween(`${Number(end.slice(0, 4)) - 2}-01-01`, `${end}-01`);
    return all.slice(all.indexOf(end) - 11, all.indexOf(end) + 1);
  };
  if (period.mode === 'custom' && period.from && period.to) return monthsBetween(period.from, period.to);
  if (period.mode === 'ym') return upTo12(`${period.year}-${String(period.month).padStart(2, '0')}`);
  return upTo12(today.slice(0, 7));
}

/**
 * Painéis. Semântica do período (modos "mês e ano" e "personalizado"; sem filtro, o retrato de hoje):
 * - processos em andamento, valor de risco, evitáveis, carteira parada, ativos por objeto, contingência, lojas e Procon:
 *   consideram os processos RECEBIDOS no período (data de recebimento; na falta, a de criação);
 * - encerrados no período: processos com data de encerramento dentro do período, qualquer que seja a entrada;
 * - gráfico mensal: entradas e encerramentos por mês (recortados pelo período personalizado).
 */
export async function dashboardData(portfolio: Portfolio, period?: Period) {
  const from = period?.from ?? null;
  const to = period?.to ?? null;
  const ranged = !!(from && to);
  const pf = portfolio ? sql`and c.portfolio = ${portfolio}` : sql``;
  const inEntry = (alias: string) => (ranged ? sql`and ${entryDate(alias)} between ${from}::date and ${to}::date` : sql``);
  const base = sql`from "case" c where c.deleted_at is null ${pf} ${inEntry('c')}`;
  const civilOnly = portfolio && portfolio !== 'civil' ? sql`and false` : sql``;

  const [kpi] = await rows<{
    open: number; risk_total: string | null; entries_period: number; closed_period: number; stale: number;
    avoid_yes: number; avoid_known: number;
  }>(sql`
    select
      count(*) filter (where c.closed_at is null)::int as open,
      (select coalesce(sum(r.risk_total), 0) from ${LATEST_RISK} r join "case" c2 on c2.id = r.case_id
         where c2.deleted_at is null and c2.closed_at is null and r.prognosis in ('probable','possible')
         ${portfolio ? sql`and c2.portfolio = ${portfolio}` : sql``} ${inEntry('c2')}) as risk_total,
      ${ranged
        ? sql`count(*)::int`
        : sql`count(*) filter (where date_trunc('month', ${entryDate('c')}::timestamptz) = date_trunc('month', now()))::int`} as entries_period,
      (select count(*) from "case" cx where cx.deleted_at is null ${portfolio ? sql`and cx.portfolio = ${portfolio}` : sql``}
         and cx.closed_at is not null
         ${ranged ? sql`and cx.closed_at between ${from}::date and ${to}::date` : sql`and date_trunc('month', cx.closed_at::timestamptz) = date_trunc('month', now())`})::int as closed_period,
      count(*) filter (where c.closed_at is null and coalesce(c.last_movement_at, c.created_at) < now() - interval '90 days')::int as stale,
      (select count(*) from case_civil cc join "case" c3 on c3.id = cc.case_id where c3.deleted_at is null and cc.avoidable is true ${civilOnly} ${inEntry('c3')})::int as avoid_yes,
      (select count(*) from case_civil cc join "case" c3 on c3.id = cc.case_id where c3.deleted_at is null and cc.avoidable is not null ${civilOnly} ${inEntry('c3')})::int as avoid_known
    ${base}`);

  // gráfico mensal; no período personalizado os meses das pontas são recortados pelas datas escolhidas
  const months = chartMonths(period ?? ({ mode: 'all' } as Period));
  const cap = period?.mode === 'custom' && ranged;
  const first = `${months[0]}-01`;
  const last = `${months[months.length - 1]}-01`;
  const series = await rows<{ m: string; entries: number; closed: number }>(sql`
    with m as (select generate_series(${first}::date, ${last}::date, interval '1 month')::date as m)
    select to_char(m.m, 'YYYY-MM') as m,
      (select count(*) from "case" c where c.deleted_at is null ${pf}
         and date_trunc('month', ${entryDate('c')})::date = m.m
         ${cap ? sql`and ${entryDate('c')} between ${from}::date and ${to}::date` : sql``})::int as entries,
      (select count(*) from "case" c where c.deleted_at is null ${pf} and c.closed_at is not null
         and date_trunc('month', c.closed_at)::date = m.m
         ${cap ? sql`and c.closed_at between ${from}::date and ${to}::date` : sql``})::int as closed
    from m order by m.m`);

  const bySubject = await rows<{ label: string; n: number; avoidable: number }>(sql`
    select l.label, count(*)::int as n, count(*) filter (where cc.avoidable is true)::int as avoidable
    from case_civil cc join "case" c on c.id = cc.case_id join lookup l on l.id = cc.subject_id
    where c.deleted_at is null and c.closed_at is null ${civilOnly} ${inEntry('c')}
    group by l.label order by n desc limit 8`);

  const contingency = await rows<{ prognosis: string; n: number; total: string }>(sql`
    select r.prognosis, count(*)::int as n, coalesce(sum(r.risk_total), 0) as total
    from ${LATEST_RISK} r join "case" c on c.id = r.case_id
    where c.deleted_at is null and c.closed_at is null and r.prognosis is not null ${pf} ${inEntry('c')}
    group by r.prognosis`);

  const stores = await rows<{ store: string; n: number; paid: string; subject: string | null }>(sql`
    select c.cost_center as store, count(*)::int as n,
      coalesce((select sum(f.amount) from financial_entry f join "case" c2 on c2.id = f.case_id
                where f.deleted_at is null and f.paid_at is not null and c2.cost_center = c.cost_center ${inEntry('c2')}), 0) as paid,
      (select l.label from case_civil cc2 join "case" c3 on c3.id = cc2.case_id join lookup l on l.id = cc2.subject_id
         where c3.cost_center = c.cost_center and cc2.avoidable is true ${inEntry('c3')} group by l.label order by count(*) desc limit 1) as subject
    from case_civil cc join "case" c on c.id = cc.case_id
    where c.deleted_at is null and cc.avoidable is true and c.cost_center is not null ${inEntry('c')}
    group by c.cost_center order by n desc limit 8`);

  const procon = await rows<{ label: string; n: number }>(sql`
    select coalesce(nullif(p.agency, ''), 'Sem órgão informado') as label, count(*)::int as n
    from case_procon p join "case" c on c.id = p.case_id
    where c.deleted_at is null and c.closed_at is null ${inEntry('c')}
    group by 1 order by n desc limit 8`);

  return { kpi, months: series, bySubject, contingency, stores, procon };
}
