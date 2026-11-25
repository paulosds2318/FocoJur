import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { user } from '@/db/schema';
import { aiBudget, aiCall, aiModelCatalog, aiTaskConfig, aiTaskConfigHistory, AI_TASKS, fxRate, type AiTask } from '@/db/schema/ai';
import { audit } from '@/lib/audit';
import { todayInSaoPaulo } from '@/lib/deadlines';
import { sendMail } from '@/lib/mail';
import { daysBetween, type Period } from '@/lib/period';
import { budgetStatus } from '@/lib/ai';

export const TASK_LABEL: Record<AiTask, { name: string; desc: string }> = {
  movement_summary: { name: 'Resumo de movimentação', desc: 'Resume publicações e intimações em 2 a 3 linhas' },
  deadline_suggestion: { name: 'Sugestão de prazo', desc: 'Tipo de ato, prazo, fundamento legal e confiança' },
  intake_classification: { name: 'Classificação na entrada', desc: 'Objeto, pedido e prognóstico a partir da inicial' },
  contract_extraction: { name: 'Extração de contrato', desc: 'Código do contrato no texto, validado no sistema de locação' },
  portal_extraction: { name: 'Extração de dados do portal', desc: 'Robô de enriquecimento: lê a página do processo no tribunal' },
};

/** RF-80: sincroniza o catálogo (preço por token em US$). A política de dados é imposta em cada chamada (data_collection=deny, zdr). */
export async function syncModelCatalog(fetchFn: typeof fetch = fetch) {
  const res = await fetchFn('https://openrouter.ai/api/v1/models', {
    headers: process.env.OPENROUTER_API_KEY ? { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } : {},
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`OpenRouter /models respondeu ${res.status}`);
  const json = (await res.json()) as { data: { id: string; name: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }[] };
  const rows = json.data.map((m) => ({
    modelId: m.id, name: m.name, contextLength: m.context_length ?? null,
    promptPriceUsd: m.pricing?.prompt ?? null, completionPriceUsd: m.pricing?.completion ?? null, dataPolicyOk: true, syncedAt: new Date(),
  }));
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(aiModelCatalog).values(rows.slice(i, i + 200)).onConflictDoUpdate({
      target: aiModelCatalog.modelId,
      set: {
        name: sql`excluded.name`, contextLength: sql`excluded.context_length`, promptPriceUsd: sql`excluded.prompt_price_usd`,
        completionPriceUsd: sql`excluded.completion_price_usd`, syncedAt: sql`excluded.synced_at`,
      },
    });
  }
  return rows.length;
}

export async function saveTaskConfig(actorId: string, task: AiTask, primary: string, fallback: string) {
  if (!AI_TASKS.includes(task)) return { ok: false as const, error: 'Tarefa inválida.' };
  const next = { primaryModel: primary.trim() || null, fallbackModel: fallback.trim() || null };
  if (!next.primaryModel) return { ok: false as const, error: 'Escolha o modelo principal.' };
  if (next.primaryModel === next.fallbackModel) return { ok: false as const, error: 'O modelo reserva deve ser diferente do principal.' };
  const [old] = await db.select().from(aiTaskConfig).where(eq(aiTaskConfig.task, task));
  await db
    .insert(aiTaskConfig)
    .values({ task, ...next, updatedBy: actorId })
    .onConflictDoUpdate({ target: aiTaskConfig.task, set: { ...next, updatedBy: actorId, updatedAt: new Date() } });
  for (const [field, key] of [['primary_model', 'primaryModel'], ['fallback_model', 'fallbackModel']] as const) {
    if ((old?.[key] ?? null) !== next[key]) {
      await db.insert(aiTaskConfigHistory).values({ task, field, oldValue: old?.[key] ?? null, newValue: next[key], changedBy: actorId });
    }
  }
  await audit({ actorId, entity: 'ai_task_config', entityId: task, action: 'update', diff: { before: old ?? null, after: next } });
  return { ok: true as const };
}

export async function taskOverview() {
  const configs = await db.select().from(aiTaskConfig);
  const stats = await db.execute<{ task: string; accept: string | null; avg_cost: string | null }>(sql`
    select task,
      avg(case when accepted is true then 1.0 when accepted is false then 0.0 end) as accept,
      avg(cost_brl) filter (where status <> 'error') as avg_cost
    from ai_call where at > now() - interval '30 days' group by task`);
  const catalog = await db.select().from(aiModelCatalog).orderBy(asc(aiModelCatalog.name));
  const history = await db
    .select({ task: aiTaskConfigHistory.task, field: aiTaskConfigHistory.field, oldValue: aiTaskConfigHistory.oldValue, newValue: aiTaskConfigHistory.newValue, at: aiTaskConfigHistory.changedAt, by: user.name })
    .from(aiTaskConfigHistory).leftJoin(user, eq(user.id, aiTaskConfigHistory.changedBy)).orderBy(desc(aiTaskConfigHistory.changedAt)).limit(10);
  return { configs, stats: stats.rows, catalog, history };
}

// ---------- custos ----------
export async function costOverview(period: Period) {
  const today = todayInSaoPaulo();
  const from = period.from ?? today.slice(0, 8) + '01';
  const to = period.to ?? today;
  const local = sql`(at at time zone 'America/Sao_Paulo')::date`;
  const inRange = sql`${local} between ${from}::date and ${to}::date`;
  const [t] = (await db.execute<{ period_brl: string; period_usd: string; period_n: number; period_tokens: string; today_brl: string; today_n: number; month_brl: string }>(sql`
    select
      coalesce(sum(cost_brl) filter (where ${inRange}), 0) as period_brl,
      coalesce(sum(cost_usd) filter (where ${inRange}), 0) as period_usd,
      count(*) filter (where ${inRange})::int as period_n,
      coalesce(sum(coalesce(prompt_tokens,0) + coalesce(completion_tokens,0)) filter (where ${inRange}), 0) as period_tokens,
      coalesce(sum(cost_brl) filter (where ${local} = current_date), 0) as today_brl,
      count(*) filter (where ${local} = current_date)::int as today_n,
      coalesce(sum(cost_brl) filter (where ${local} >= date_trunc('month', current_date)), 0) as month_brl
    from ai_call`)).rows;
  const day = new Date(`${today}T00:00:00Z`).getUTCDate();
  const daysInMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const projectionBrl = (Number(t.month_brl) / Math.max(1, day)) * daysInMonth;

  // até ~2 meses: um ponto por dia; períodos longos: um ponto por mês (o gráfico continua legível)
  const granularity: 'day' | 'month' = daysBetween(from, to) <= 62 ? 'day' : 'month';
  const perDay = (granularity === 'day'
    ? await db.execute<{ k: string; label: string; brl: string; usd: string }>(sql`
        select to_char(${local}, 'YYYY-MM-DD') as k, to_char(${local}, 'DD') as label, sum(cost_brl) as brl, sum(cost_usd) as usd from ai_call
        where ${inRange} group by ${local} order by ${local}`)
    : await db.execute<{ k: string; label: string; brl: string; usd: string }>(sql`
        select to_char(date_trunc('month', ${local}), 'YYYY-MM') as k, to_char(date_trunc('month', ${local}), 'MM/YY') as label, sum(cost_brl) as brl, sum(cost_usd) as usd from ai_call
        where ${inRange} group by date_trunc('month', ${local}) order by date_trunc('month', ${local})`)).rows;

  const byTask = (await db.execute<Record<string, string | number | null>>(sql`
    select task, model, count(*)::int as calls,
      coalesce(sum(prompt_tokens),0) as tin, coalesce(sum(completion_tokens),0) as tout,
      coalesce(sum(cost_brl),0) as brl, coalesce(sum(cost_usd),0) as usd,
      avg(latency_ms) as latency, avg(case when status = 'error' then 1.0 else 0.0 end) as err,
      avg(case when accepted is true then 1.0 when accepted is false then 0.0 end) as accept
    from ai_call where ${inRange} group by task, model order by brl desc`)).rows;

  const [ptax] = await db.select().from(fxRate).where(eq(fxRate.source, 'ptax')).orderBy(desc(fxRate.date)).limit(1);
  const [manual] = await db.select().from(fxRate).where(eq(fxRate.source, 'manual')).orderBy(desc(fxRate.date), desc(fxRate.id)).limit(1);
  return { t, projectionBrl, perDay, granularity, byTask, ptax, manual, budget: await budgetStatus() };
}

export async function setBudget(actorId: string, limitBrl: number) {
  if (!Number.isFinite(limitBrl) || limitBrl <= 0) return { ok: false as const, error: 'Informe um limite maior que zero.' };
  const month = new Date().toISOString().slice(0, 7);
  await db.insert(aiBudget).values({ month, limitBrl: limitBrl.toFixed(2) }).onConflictDoUpdate({ target: aiBudget.month, set: { limitBrl: limitBrl.toFixed(2), alert80SentAt: null, alert100SentAt: null } });
  await audit({ actorId, entity: 'ai_budget', entityId: month, action: 'update', diff: { after: { limitBrl } } });
  return { ok: true as const };
}

/** Cotação manual do admin (RF-93): vale a partir de hoje, até ser removida (cotação 0 remove). */
export async function setManualFx(actorId: string, rate: number) {
  if (!Number.isFinite(rate) || rate < 0) return { ok: false as const, error: 'Cotação inválida.' };
  await db.insert(fxRate).values({ date: todayInSaoPaulo(), source: 'manual', rate: rate.toFixed(4), setBy: actorId });
  await audit({ actorId, entity: 'fx_rate', action: 'update', diff: { after: { manual: rate } } });
  return { ok: true as const };
}

/** RF-91: avisa os admins uma vez por limiar (80% e 100%) por mês. */
export async function checkBudgetAlerts() {
  const b = await budgetStatus();
  if (b.pct === null || b.limit === null) return;
  const [row] = await db.select().from(aiBudget).where(eq(aiBudget.month, b.month));
  const which = b.pct >= 100 && !row.alert100SentAt ? 100 : b.pct >= 80 && !row.alert80SentAt ? 80 : null;
  if (!which) return;
  const admins = await db.select({ email: user.email }).from(user).where(and(eq(user.role, 'admin'), sql`coalesce(${user.active}, true)`));
  if (admins.length) {
    await sendMail(admins.map((a) => a.email), `FocoJur: IA em ${which}% do limite mensal`,
      `<p>O custo de IA do mês chegou a <strong>R$ ${b.spent.toFixed(2)}</strong> de R$ ${b.limit.toFixed(2)} (${b.pct.toFixed(0)}%).</p>`);
  }
  await db.update(aiBudget).set(which === 100 ? { alert100SentAt: new Date(), alert80SentAt: row.alert80SentAt ?? new Date() } : { alert80SentAt: new Date() }).where(eq(aiBudget.month, b.month));
}

/** Saldo de créditos: exige chave de gerenciamento do OpenRouter; com chave comum devolve null. */
export async function fetchCredits(fetchFn: typeof fetch = fetch): Promise<{ total: number; usage: number } | null> {
  const key = process.env.OPENROUTER_MANAGEMENT_KEY ?? process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  try {
    const res = await fetchFn('https://openrouter.ai/api/v1/credits', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { total_credits: number; total_usage: number } };
    return j.data ? { total: j.data.total_credits, usage: j.data.total_usage } : null;
  } catch {
    return null;
  }
}
