import { boolean, date, index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './access';
import { cases } from './case';

const ts = (n: string) => timestamp(n, { withTimezone: true });

export const AI_TASKS = [
  'movement_summary', 'deadline_suggestion', 'intake_classification', 'contract_extraction', 'portal_extraction',
] as const;
export type AiTask = (typeof AI_TASKS)[number];

export const aiTaskConfig = pgTable('ai_task_config', {
  task: text('task').$type<AiTask>().primaryKey(),
  primaryModel: text('primary_model'),
  fallbackModel: text('fallback_model'),
  updatedBy: text('updated_by').references(() => user.id),
  updatedAt: ts('updated_at').defaultNow().notNull(),
});

export const aiTaskConfigHistory = pgTable('ai_task_config_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  task: text('task').$type<AiTask>().notNull(),
  field: text('field').notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  changedBy: text('changed_by').references(() => user.id),
  changedAt: ts('changed_at').defaultNow().notNull(),
});

export const aiModelCatalog = pgTable('ai_model_catalog', {
  modelId: text('model_id').primaryKey(),
  name: text('name').notNull(),
  promptPriceUsd: numeric('prompt_price_usd', { precision: 20, scale: 12 }),
  completionPriceUsd: numeric('completion_price_usd', { precision: 20, scale: 12 }),
  contextLength: integer('context_length'),
  dataPolicyOk: boolean('data_policy_ok').notNull().default(false),
  syncedAt: ts('synced_at').defaultNow().notNull(),
});

export const aiCall = pgTable(
  'ai_call',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    task: text('task').$type<AiTask>().notNull(),
    model: text('model').notNull(),
    provider: text('provider'),
    userId: text('user_id').references(() => user.id),
    caseId: uuid('case_id').references(() => cases.id),
    generationId: text('generation_id'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    cachedTokens: integer('cached_tokens'),
    reasoningTokens: integer('reasoning_tokens'),
    costUsd: numeric('cost_usd', { precision: 14, scale: 6 }),
    fxRate: numeric('fx_rate', { precision: 10, scale: 4 }),
    costBrl: numeric('cost_brl', { precision: 14, scale: 6 }),
    latencyMs: integer('latency_ms'),
    status: text('status').$type<'ok' | 'error' | 'fallback'>().notNull(),
    error: text('error'),
    accepted: boolean('accepted'), // nulo = sem decisão
    at: ts('at').defaultNow().notNull(),
  },
  (t) => [index('ai_call_at_idx').on(t.at)],
);

export const fxRate = pgTable('fx_rate', {
  id: uuid('id').defaultRandom().primaryKey(),
  date: date('date').notNull(),
  source: text('source').$type<'ptax' | 'manual'>().notNull(),
  rate: numeric('rate', { precision: 10, scale: 4 }).notNull(),
  setBy: text('set_by').references(() => user.id),
});

export const aiBudget = pgTable('ai_budget', {
  month: text('month').primaryKey(), // YYYY-MM
  limitBrl: numeric('limit_brl', { precision: 14, scale: 2 }).notNull(),
  alert80SentAt: ts('alert_80_sent_at'),
  alert100SentAt: ts('alert_100_sent_at'),
});
