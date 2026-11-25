import { date, index, pgTable, primaryKey, text, time, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './access';
import { cases } from './case';
import { lookup } from './lookups';
import { movement } from './movement';

const ts = (n: string) => timestamp(n, { withTimezone: true });
const stamps = {
  createdAt: ts('created_at').defaultNow().notNull(),
  updatedAt: ts('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
};

export type TaskStatus = 'todo' | 'doing' | 'review' | 'done' | 'cancelled';

export const task = pgTable(
  'task',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id').references(() => cases.id), // nulo = tarefa geral
    movementId: uuid('movement_id').references(() => movement.id),
    typeId: uuid('type_id').references(() => lookup.id),
    bucketId: uuid('bucket_id').references(() => lookup.id), // coluna do quadro (lista oficial task_bucket); nulo = "Sem bucket"
    title: text('title').notNull(),
    dueDate: date('due_date'), // prazo limite (fatal)
    internalDueDate: date('internal_due_date'), // prazo interno do escritório (<= prazo limite)
    dueTime: time('due_time'),
    ownerId: text('owner_id').references(() => user.id),
    reviewerId: text('reviewer_id').references(() => user.id),
    status: text('status').$type<TaskStatus>().notNull().default('todo'),
    origin: text('origin').$type<'manual' | 'ai_suggestion' | 'migration'>().notNull().default('manual'),
    completedAt: ts('completed_at'),
    ...stamps,
  },
  (t) => [index('task_due_idx').on(t.dueDate), index('task_internal_due_idx').on(t.internalDueDate), index('task_owner_idx').on(t.ownerId), index('task_bucket_idx').on(t.bucketId), index('task_case_idx').on(t.caseId)],
);

/** Responsáveis da tarefa (uma ou várias pessoas, como no Planner). `task.owner_id` guarda o primeiro, por compatibilidade com filtros e avisos. */
export const taskAssignee = pgTable(
  'task_assignee',
  {
    taskId: uuid('task_id').notNull().references(() => task.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] }), index('task_assignee_user_idx').on(t.userId)],
);

export const holiday = pgTable('holiday', {
  id: uuid('id').defaultRandom().primaryKey(),
  date: date('date').notNull(),
  scope: text('scope').$type<'national' | 'state' | 'city' | 'court'>().notNull(),
  state: text('state'),
  city: text('city'),
  court: text('court'), // nome da vara/órgão (escopo 'court')
  description: text('description').notNull(),
  ...stamps,
});
