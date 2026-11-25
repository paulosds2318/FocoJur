import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { getSession } from '@/lib/auth/session';
import { PERIOD_MODES_CUSTOS, parsePeriod } from '@/lib/period';

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// RF-94: custo por chamada, com usuária e processo, em CSV.
export async function GET(req: Request) {
  const session = await getSession();
  const u = session?.user as (NonNullable<typeof session>['user'] & { mustChangePassword?: boolean }) | undefined;
  if (!u || u.role !== 'admin' || u.mustChangePassword) return new Response('Não autorizado', { status: 403 });
  // mesmo parser da tela: o CSV cobre exatamente o período que está sendo mostrado
  const q = new URL(req.url).searchParams;
  const period = parsePeriod(
    { periodo: q.get('periodo') ?? undefined, mes: q.get('mes') ?? undefined, ano: q.get('ano') ?? undefined, de: q.get('de') ?? undefined, ate: q.get('ate') ?? undefined },
    { allowed: PERIOD_MODES_CUSTOS, fallback: 'month' },
  );
  const rows = (await db.execute(sql`
    select to_char(a.at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as quando, a.task, a.model, a.status,
      u.name as usuaria, c.number as processo, a.prompt_tokens, a.completion_tokens, a.cost_usd, a.fx_rate, a.cost_brl, a.latency_ms, a.accepted
    from ai_call a left join "user" u on u.id = a.user_id left join "case" c on c.id = a.case_id
    where (a.at at time zone 'America/Sao_Paulo')::date between ${period.from}::date and ${period.to}::date order by a.at desc`)).rows as Record<string, unknown>[];
  const cols = ['quando', 'task', 'model', 'status', 'usuaria', 'processo', 'prompt_tokens', 'completion_tokens', 'cost_usd', 'fx_rate', 'cost_brl', 'latency_ms', 'accepted'];
  const csv = '﻿' + [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="custos-ia-${period.from}_${period.to}.csv"` } });
}
