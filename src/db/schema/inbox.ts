import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './access';
import { cases } from './case';

const ts = (n: string) => timestamp(n, { withTimezone: true });
const stamps = {
  createdAt: ts('created_at').defaultNow().notNull(),
  updatedAt: ts('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
};

export const importBatch = pgTable('import_batch', {
  id: uuid('id').defaultRandom().primaryKey(),
  fileKey: text('file_key'),
  source: text('source').notNull().default('projuris_export'),
  uploadedBy: text('uploaded_by').references(() => user.id),
  rowsTotal: integer('rows_total').default(0),
  rowsNew: integer('rows_new').default(0),
  rowsDuplicate: integer('rows_duplicate').default(0),
  rowsError: integer('rows_error').default(0),
  report: jsonb('report'),
  ...stamps,
});

/** Importação da base atual (planilha Contencioso) pela tela de administração: mapeamento, prévia e execução em segundo plano. */
export const baseImport = pgTable('base_import', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: text('status').$type<'draft' | 'running' | 'done' | 'error'>().notNull().default('draft'),
  fileName: text('file_name').notNull(),
  fileKey: text('file_key').notNull(), // arquivo guardado no storage (local ou S3)
  uploadedBy: text('uploaded_by').references(() => user.id),
  config: jsonb('config'), // abas, carteira, situação e colunas escolhidas (de-para)
  progressDone: integer('progress_done').default(0),
  progressTotal: integer('progress_total').default(0),
  summary: jsonb('summary'), // criados, já existiam, bloqueados, histórico anexado
  report: jsonb('report'), // exceções por linha, valores fora das listas, advogadas sem usuário
  error: text('error'),
  finishedAt: ts('finished_at'),
  ...stamps,
});

export const inboxItem = pgTable(
  'inbox_item',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    source: text('source').$type<'projuris_api' | 'import' | 'djen_term' | 'domicilio' | 'manual'>().notNull(),
    importBatchId: uuid('import_batch_id').references(() => importBatch.id),
    externalId: text('external_id'),
    capturedAt: ts('captured_at').defaultNow().notNull(),
    payload: jsonb('payload'),
    caseNumber: text('case_number'),
    parsed: jsonb('parsed'),
    status: text('status').$type<'new' | 'in_review' | 'possible_duplicate' | 'confirmed' | 'discarded'>().notNull().default('new'),
    duplicateOf: uuid('duplicate_of').references(() => cases.id),
    reviewedBy: text('reviewed_by').references(() => user.id),
    caseId: uuid('case_id').references(() => cases.id),
    ...stamps,
  },
  (t) => [index('inbox_number_idx').on(t.caseNumber), index('inbox_status_idx').on(t.status)],
);

export const connectorRun = pgTable('connector_run', {
  id: uuid('id').defaultRandom().primaryKey(),
  connector: text('connector').notNull(),
  startedAt: ts('started_at').defaultNow().notNull(),
  finishedAt: ts('finished_at'),
  status: text('status').notNull().default('running'),
  cursor: text('cursor'), // ponto de retomada do conector (ex.: última data consultada)
  itemsFound: integer('items_found').default(0),
  itemsNew: integer('items_new').default(0),
  error: text('error'),
});

export const monitoredTerm = pgTable('monitored_term', {
  id: uuid('id').defaultRandom().primaryKey(),
  term: text('term').notNull(),
  kind: text('kind').$type<'cnpj' | 'name' | 'oab' | 'lawyer'>().notNull(),
  document: text('document'), // CNPJ/CPF para conferir homônimo
  active: boolean('active').notNull().default(true),
  // busca em segundo plano disparada ao criar/editar/ativar o termo (acompanhada na tela de monitoramento)
  searchStatus: text('search_status').$type<'pending' | 'running' | 'ok' | 'error'>(),
  searchRequestedAt: ts('search_requested_at'),
  searchFinishedAt: ts('search_finished_at'),
  searchFound: integer('search_found'),
  searchNew: integer('search_new'),
  searchHours: integer('search_hours'), // janela da busca, em horas (1, 6, 12 ou 24)
  searchError: text('search_error'),
  ...stamps,
});

export const portalFetch = pgTable(
  'portal_fetch',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseNumber: text('case_number').notNull(),
    portal: text('portal').notNull(),
    trigger: text('trigger').$type<'inbox' | 'manual' | 'scheduled'>().notNull(),
    status: text('status')
      .$type<'queued' | 'running' | 'ok' | 'partial' | 'blocked_captcha' | 'not_public' | 'layout_changed' | 'error'>()
      .notNull()
      .default('queued'),
    startedAt: ts('started_at'),
    finishedAt: ts('finished_at'),
    htmlKey: text('html_key'),
    screenshotKey: text('screenshot_key'),
    extracted: jsonb('extracted'),
    aiCallId: uuid('ai_call_id'),
    fieldsFilled: integer('fields_filled'),
    navigation: text('navigation').$type<'script' | 'ai_fallback'>().default('script'),
    error: text('error'),
    ...stamps,
  },
  (t) => [index('portal_fetch_number_idx').on(t.caseNumber)],
);

/** Lojas e CNPJs do grupo (matriz e filiais), mantidos pelo admin na tela de monitoramento. */
export const groupEntity = pgTable('group_entity', {
  id: uuid('id').defaultRandom().primaryKey(),
  cnpj: text('cnpj').notNull().unique(), // só dígitos
  label: text('label').notNull(), // ex.: "Fortaleza-CE (FOR10)"
  companyName: text('company_name').notNull(), // razão social
  active: boolean('active').notNull().default(true),
  ...stamps,
});

/** Decisão do admin sobre uma grafia de nome vista nas publicações: é a empresa (variação) ou é homônimo. */
export const nameDecision = pgTable('name_decision', {
  id: uuid('id').defaultRandom().primaryKey(),
  nameKey: text('name_key').notNull().unique(), // nome normalizado (sem acento, S/A = SA)
  displayName: text('display_name').notNull(),
  decision: text('decision').$type<'approved' | 'rejected'>().notNull(),
  decidedBy: text('decided_by').references(() => user.id),
  ...stamps,
});

/** Configurações do sistema editáveis pelo admin (ex.: de quantas em quantas horas a consulta automática roda). */
export const appSetting = pgTable('app_setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedBy: text('updated_by').references(() => user.id),
  updatedAt: ts('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
});

/** Histórico da fórmula do valor de risco: uma linha por mudança, com a data a partir da qual vale. Consultas de períodos anteriores usam a versão vigente na época. */
export const riskFormulaVersion = pgTable(
  'risk_formula_version',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    formula: text('formula').notNull(), // JSON da fórmula (RiskFormula)
    effectiveFrom: date('effective_from').notNull(),
    createdBy: text('created_by').references(() => user.id),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (t) => [index('risk_formula_version_from_idx').on(t.effectiveFrom)],
);
