import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const LOOKUP_TYPES = [
  'system', 'court_type', 'status', 'contingency_status', 'subject', 'claim', 'closing_reason',
  'hearing_type', 'receiver', 'rental_type', 'reservation_origin', 'task_type', 'dismissal_type', 'job_role', 'task_bucket',
] as const;
export type LookupType = (typeof LOOKUP_TYPES)[number];

export const LOOKUP_LABELS: Record<LookupType, string> = {
  system: 'Sistema / portal',
  court_type: 'Foro / esfera',
  status: 'Status do processo',
  contingency_status: 'Status para contingência',
  subject: 'Objeto',
  claim: 'Pedido',
  closing_reason: 'Motivo de encerramento',
  hearing_type: 'Tipo de audiência',
  receiver: 'Recebedor',
  rental_type: 'Tipo de locação',
  reservation_origin: 'Origem da reserva',
  task_type: 'Tipo de tarefa',
  dismissal_type: 'Tipo de demissão',
  job_role: 'Função',
  task_bucket: 'Colunas do quadro de tarefas (bucket)',
};

const ts = (n: string) => timestamp(n, { withTimezone: true });

export const lookup = pgTable(
  'lookup',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: text('type').$type<LookupType>().notNull(),
    code: text('code').notNull(),
    label: text('label').notNull(),
    active: boolean('active').notNull().default(true),
    sort: integer('sort').notNull().default(0),
    portfolio: text('portfolio'), // nulo = todas as carteiras
    internalDays: integer('internal_days'), // só tipo de tarefa: prazo interno = prazo limite menos N dias úteis (nulo = sem regra)
    description: text('description'), // quando usar o item (lida pela IA na Triagem); tipos de tarefa: prazo legal e forma de contagem
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [index('lookup_type_idx').on(t.type, t.code)],
);
