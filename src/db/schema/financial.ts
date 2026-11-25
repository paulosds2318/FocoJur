import { date, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { cases } from './case';

export type FinancialKind =
  | 'judgment' | 'settlement' | 'court_fees' | 'deposit' | 'attorney_fees' | 'correspondent' | 'external_firm';

export const financialEntry = pgTable(
  'financial_entry',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id').notNull().references(() => cases.id),
    kind: text('kind').$type<FinancialKind>().notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    paidAt: date('paid_at'),
    sensTicket: text('sens_ticket'),
    notes: text('notes'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [index('financial_case_idx').on(t.caseId)],
);
