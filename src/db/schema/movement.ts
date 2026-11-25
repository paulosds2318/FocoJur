import { index, integer, numeric, pgTable, text, timestamp, uuid, date } from 'drizzle-orm/pg-core';
import { user } from './access';
import { cases } from './case';

const ts = (n: string) => timestamp(n, { withTimezone: true });
const stamps = {
  createdAt: ts('created_at').defaultNow().notNull(),
  updatedAt: ts('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
};

export const movement = pgTable(
  'movement',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id').references(() => cases.id), // nulo enquanto não vinculada
    source: text('source').$type<'djen' | 'domicilio' | 'datajud' | 'portal'>().notNull(),
    externalId: text('external_id'),
    occurredAt: ts('occurred_at').notNull(),
    title: text('title'),
    rawText: text('raw_text'),
    aiSummary: text('ai_summary'),
    triageStatus: text('triage_status').$type<'pending' | 'linked' | 'task_created' | 'discarded'>().notNull().default('pending'),
    discardReason: text('discard_reason'),
    matchedTermId: uuid('matched_term_id'),
    readBy: text('read_by').references(() => user.id),
    readAt: ts('read_at'),
    ...stamps,
  },
  (t) => [index('movement_case_idx').on(t.caseId), index('movement_external_idx').on(t.source, t.externalId)],
);

export const deadlineSuggestion = pgTable('deadline_suggestion', {
  id: uuid('id').defaultRandom().primaryKey(),
  movementId: uuid('movement_id').notNull().references(() => movement.id),
  actType: text('act_type').notNull(),
  days: integer('days'),
  dayCount: text('day_count').$type<'business' | 'calendar'>(),
  dueDate: date('due_date'),
  legalBasis: text('legal_basis'),
  confidence: numeric('confidence', { precision: 4, scale: 3 }),
  aiCallId: uuid('ai_call_id'),
  decision: text('decision').$type<'accepted' | 'edited' | 'rejected'>(),
  decidedBy: text('decided_by').references(() => user.id),
  decidedAt: ts('decided_at'),
  finalDueDate: date('final_due_date'),
  ...stamps,
});

