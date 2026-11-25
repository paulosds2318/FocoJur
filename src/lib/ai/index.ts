import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { aiBudget, aiCall, aiTaskConfig, type AiTask } from '@/db/schema/ai';
import { currentFxRate } from '@/lib/fx/ptax';
import { AiCallError, chatJson, type Usage } from './client';
import { maskSensitive } from './mask';
import { prompts, schemas, type TaskOutput } from './tasks';

type Ctx = { userId?: string | null; caseId?: string | null; fetchFn?: typeof fetch };

export type TaskResult<T extends AiTask> =
  | { ok: true; output: TaskOutput<T>; aiCallId: string; model: string; fallback: boolean }
  | { ok: false; error: string };

async function record(task: AiTask, model: string, status: 'ok' | 'error' | 'fallback', ctx: Ctx, extra: {
  usage?: Usage; generationId?: string | null; provider?: string | null; latencyMs?: number; error?: string;
}) {
  const fx = await currentFxRate();
  const cost = extra.usage?.costUsd ?? null;
  const [row] = await db
    .insert(aiCall)
    .values({
      task, model, status, userId: ctx.userId ?? null, caseId: ctx.caseId ?? null, provider: extra.provider ?? null,
      generationId: extra.generationId ?? null, promptTokens: extra.usage?.promptTokens ?? null,
      completionTokens: extra.usage?.completionTokens ?? null, cachedTokens: extra.usage?.cachedTokens ?? null,
      reasoningTokens: extra.usage?.reasoningTokens ?? null, costUsd: cost === null ? null : cost.toFixed(6),
      fxRate: fx === null ? null : fx.toFixed(4), costBrl: cost !== null && fx !== null ? (cost * fx).toFixed(6) : null,
      latencyMs: extra.latencyMs ?? null, error: extra.error ?? null,
    })
    .returning({ id: aiCall.id });
  return row.id;
}

/** Decisão em aberto (PRD 12, questão 5): por padrão só alerta ao atingir o limite; defina AI_SUSPEND_AT_LIMIT=true para suspender. */
export async function budgetStatus(month = new Date().toISOString().slice(0, 7)) {
  const [b] = await db.select().from(aiBudget).where(eq(aiBudget.month, month));
  const [{ spent }] = await db
    .select({ spent: sql<string>`coalesce(sum(${aiCall.costBrl}), 0)` })
    .from(aiCall)
    .where(sql`to_char(${aiCall.at} at time zone 'America/Sao_Paulo', 'YYYY-MM') = ${month}`);
  const limit = b ? Number(b.limitBrl) : null;
  return { month, limit, spent: Number(spent), pct: limit ? (Number(spent) / limit) * 100 : null };
}

/**
 * Executa uma tarefa de IA: máscara de dados sensíveis, modelo principal, reserva em caso de erro/timeout/JSON inválido,
 * e registro de cada chamada (tokens, custo em US$ e R$ com a cotação do dia, tempo, status).
 */
export async function runAiTask<T extends AiTask>(task: T, input: string, ctx: Ctx = {}): Promise<TaskResult<T>> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, error: 'IA não configurada (OPENROUTER_API_KEY ausente).' };
  const [cfg] = await db.select().from(aiTaskConfig).where(eq(aiTaskConfig.task, task));
  if (!cfg?.primaryModel) return { ok: false, error: 'Nenhum modelo definido para esta tarefa (Administração, Modelos de IA).' };

  if (process.env.AI_SUSPEND_AT_LIMIT === 'true') {
    const b = await budgetStatus();
    if (b.pct !== null && b.pct >= 100) return { ok: false, error: 'Limite mensal de IA atingido: a IA está suspensa até um admin liberar.' };
  }

  const masked = maskSensitive(input);
  const timeoutMs = Number(process.env.AI_DEFAULT_TIMEOUT_MS ?? 30_000);
  const models = [cfg.primaryModel, ...(cfg.fallbackModel ? [cfg.fallbackModel] : [])];
  let lastError = 'falha desconhecida';

  for (const [i, model] of models.entries()) {
    try {
      const r = await chatJson({
        apiKey, model, system: prompts[task], user: masked, schema: schemas[task] as never, timeoutMs, fetchFn: ctx.fetchFn,
        appName: process.env.OPENROUTER_APP_NAME,
      });
      const aiCallId = await record(task, model, i === 0 ? 'ok' : 'fallback', ctx, r);
      return { ok: true, output: r.output as TaskOutput<T>, aiCallId, model, fallback: i > 0 };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      const ex = e instanceof AiCallError ? e : undefined;
      await record(task, model, 'error', ctx, { usage: ex?.usage, latencyMs: ex?.latencyMs, error: lastError.slice(0, 500) });
    }
  }
  return { ok: false, error: `Falha na IA: ${lastError}` };
}

/** Registra a decisão da advogada sobre uma sugestão (alimenta a taxa de aceite por modelo). */
export async function markAccepted(aiCallId: string, accepted: boolean) {
  await db.update(aiCall).set({ accepted }).where(eq(aiCall.id, aiCallId));
}
