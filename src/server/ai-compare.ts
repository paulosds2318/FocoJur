import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { cases } from '@/db/schema/case';
import { deadlineSuggestion, movement } from '@/db/schema/movement';
import { chatJson, type Usage } from '@/lib/ai/client';
import { maskSensitive } from '@/lib/ai/mask';
import { prompts, schemas, type TaskOutput } from '@/lib/ai/tasks';
import { computeDueDate } from './movements';

export type Sample = { text: string; startDate: string; expectedDue: string; ctx: { state?: string | null; city?: string | null; court?: string | null } };
export type ModelScore = { model: string; n: number; correct: number; errors: number; accuracy: number | null; avgCostUsd: number | null; avgLatencyMs: number | null };
export type Suggest = (model: string, text: string) => Promise<{ output: TaskOutput<'deadline_suggestion'>; usage: Usage; latencyMs: number }>;

/** Casos que as advogadas já revisaram: a decisão final delas é o gabarito. */
export async function reviewedSamples(limit: number): Promise<Sample[]> {
  const rows = await db
    .select({
      raw: movement.rawText, title: movement.title, occurredAt: movement.occurredAt, expected: deadlineSuggestion.finalDueDate,
      state: cases.state, city: cases.city, court: cases.court,
    })
    .from(deadlineSuggestion)
    .innerJoin(movement, eq(movement.id, deadlineSuggestion.movementId))
    .leftJoin(cases, eq(cases.id, movement.caseId))
    .where(and(inArray(deadlineSuggestion.decision, ['accepted', 'edited']), isNotNull(deadlineSuggestion.finalDueDate), isNotNull(movement.rawText)))
    .orderBy(desc(deadlineSuggestion.decidedAt))
    .limit(limit);
  return rows.map((r) => ({
    text: `${r.title ?? ''}\n${r.raw}`.slice(0, 12_000), startDate: r.occurredAt.toISOString().slice(0, 10), expectedDue: r.expected!,
    ctx: { state: r.state, city: r.city, court: r.court },
  }));
}

/** Data final que o FocoJur calcularia a partir do que a IA respondeu (a data da IA nunca vale). */
export async function dueFromOutput(o: TaskOutput<'deadline_suggestion'>, startDate: string, ctx: Sample['ctx']) {
  if (!o.hasDeadline) return null;
  const start = o.startDate && /^\d{4}-\d{2}-\d{2}$/.test(o.startDate) ? o.startDate : startDate;
  if (o.days && o.dayCount) return computeDueDate(start, o.days, o.dayCount, ctx);
  return o.hearing?.date ?? o.dueDate ?? null;
}

/** Roda um modelo em todas as amostras e mede acerto (data final igual à decidida), custo e tempo. */
export async function scoreModel(model: string, samples: Sample[], suggest: Suggest): Promise<ModelScore> {
  let correct = 0, errors = 0, cost = 0, costN = 0, lat = 0, latN = 0;
  for (const s of samples) {
    try {
      const r = await suggest(model, s.text);
      if (r.usage.costUsd !== null) { cost += r.usage.costUsd; costN++; }
      lat += r.latencyMs; latN++;
      if ((await dueFromOutput(r.output, s.startDate, s.ctx)) === s.expectedDue) correct++;
    } catch {
      errors++;
    }
  }
  return {
    model, n: samples.length, correct, errors, accuracy: samples.length ? correct / samples.length : null,
    avgCostUsd: costN ? cost / costN : null, avgLatencyMs: latN ? lat / latN : null,
  };
}

/**
 * RF-84: compara dois modelos na tarefa de prazo. Não grava `ai_call` nem altera nenhum dado de negócio:
 * é só medição (o custo aparece no resultado, não no painel de custos).
 */
export async function compareModels(modelA: string, modelB: string, sampleSize: 20 | 50, fetchFn?: typeof fetch) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false as const, error: 'OPENROUTER_API_KEY não definida.' };
  if (!modelA || !modelB || modelA === modelB) return { ok: false as const, error: 'Escolha dois modelos diferentes.' };
  const samples = await reviewedSamples(sampleSize);
  if (samples.length === 0) return { ok: false as const, error: 'Ainda não há sugestões de prazo revisadas pelas advogadas para servir de gabarito.' };

  const suggest: Suggest = async (model, text) => {
    const r = await chatJson({
      apiKey, model, system: prompts.deadline_suggestion, user: maskSensitive(text), schema: schemas.deadline_suggestion,
      timeoutMs: Number(process.env.AI_DEFAULT_TIMEOUT_MS ?? 30_000), fetchFn,
    });
    return { output: r.output, usage: r.usage, latencyMs: r.latencyMs };
  };
  const [a, b] = await Promise.all([scoreModel(modelA, samples, suggest), scoreModel(modelB, samples, suggest)]);
  return { ok: true as const, samples: samples.length, a, b };
}
