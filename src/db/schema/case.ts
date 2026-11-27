import { sql } from 'drizzle-orm';
import {
  boolean, date, index, numeric, pgTable, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
import { user } from './access';
import { lookup } from './lookups';

const ts = (n: string) => timestamp(n, { withTimezone: true });
const stamps = {
  createdAt: ts('created_at').defaultNow().notNull(),
  updatedAt: ts('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
};
const money = (n: string) => numeric(n, { precision: 14, scale: 2 });

export type Portfolio = 'civil' | 'labor' | 'procon';
export type CaseSource = 'manual' | 'migration' | 'domicilio' | 'projuris_api' | 'import' | 'djen_term' | 'datajud';

export const cases = pgTable(
  'case',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    number: text('number').notNull(), // só dígitos (CNJ) ou nº do Procon; máscara na exibição
    portfolio: text('portfolio').$type<Portfolio>().notNull(),
    polarity: text('polarity').$type<'passive' | 'active'>().notNull().default('passive'),
    systemId: uuid('system_id').references(() => lookup.id),
    courtTypeId: uuid('court_type_id').references(() => lookup.id),
    state: text('state'),
    city: text('city'),
    court: text('court'),
    statusId: uuid('status_id').references(() => lookup.id),
    contingencyStatusId: uuid('contingency_status_id').references(() => lookup.id),
    ownerId: text('owner_id').references(() => user.id),
    externalFirm: text('external_firm'),
    receivedAt: date('received_at'),
    citedAt: date('cited_at'),
    factDate: date('fact_date'),
    closedAt: date('closed_at'),
    closingReasonId: uuid('closing_reason_id').references(() => lookup.id),
    costCenter: text('cost_center'), // loja
    details: text('details'),
    source: text('source').$type<CaseSource>().notNull().default('manual'),
    monitoring: boolean('monitoring').notNull().default(true),
    lastMovementAt: ts('last_movement_at'),
    deletedAt: ts('deleted_at'), // exclusão lógica (RF-72)
    ...stamps,
  },
  (t) => [
    // um mesmo número (processo de verdade) nunca pode virar duas linhas, nem por carteiras diferentes; parcial
    // (só entre os não excluídos) para o número poder ser reaproveitado depois de uma exclusão lógica (regra 7)
    uniqueIndex('case_number_uq').on(t.number).where(sql`${t.deletedAt} is null`),
    index('case_number_idx').on(t.number),
    index('case_status_idx').on(t.statusId),
    index('case_owner_idx').on(t.ownerId),
  ],
);

export const caseCivil = pgTable('case_civil', {
  caseId: uuid('case_id').primaryKey().references(() => cases.id),
  claimId: uuid('claim_id').references(() => lookup.id),
  subjectId: uuid('subject_id').references(() => lookup.id),
  subjectSecondaryId: uuid('subject_secondary_id').references(() => lookup.id),
  reservationOriginId: uuid('reservation_origin_id').references(() => lookup.id),
  contractSigned: boolean('contract_signed'),
  rentalTypeId: uuid('rental_type_id').references(() => lookup.id),
  avoidable: boolean('avoidable'), // nulo = não analisado
  rootCause: text('root_cause'),
  rootCauseArea: text('root_cause_area'),
  negative404Reason: text('negative_404_reason'),
  ...stamps,
});

export const caseLabor = pgTable('case_labor', {
  caseId: uuid('case_id').primaryKey().references(() => cases.id),
  jobRoleId: uuid('job_role_id').references(() => lookup.id),
  dismissalTypeId: uuid('dismissal_type_id').references(() => lookup.id),
  admissionMonth: text('admission_month'),
  dismissalMonth: text('dismissal_month'),
  claims: text('claims'),
  region: text('region'),
  ...stamps,
});

export const caseProcon = pgTable('case_procon', {
  caseId: uuid('case_id').primaryKey().references(() => cases.id),
  kind: text('kind').$type<'digital' | 'physical'>(),
  agency: text('agency'),
  trackingNumber: text('tracking_number'),
  ...stamps,
});

export const caseParty = pgTable(
  'case_party',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id').notNull().references(() => cases.id),
    role: text('role').$type<'plaintiff' | 'defendant' | 'other_defendant'>().notNull(),
    name: text('name').notNull(),
    document: text('document'),
    lawyerName: text('lawyer_name'),
    ...stamps,
  },
  (t) => [index('case_party_case_idx').on(t.caseId)],
);

/** Uma linha por revisão de prognóstico; a vigente é a mais recente. */
export const caseRisk = pgTable(
  'case_risk',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id').notNull().references(() => cases.id),
    prognosis: text('prognosis').$type<'probable' | 'possible' | 'remote'>(),
    riskTotal: money('risk_total'),
    riskMaterial: money('risk_material'),
    riskMoral: money('risk_moral'),
    claimValue: money('claim_value'),
    settlementLimit: money('settlement_limit'),
    reviewedBy: text('reviewed_by').references(() => user.id),
    reviewedAt: ts('reviewed_at').defaultNow().notNull(),
    ...stamps,
  },
  (t) => [index('case_risk_case_idx').on(t.caseId, t.reviewedAt)],
);

export const rentalLink = pgTable(
  'rental_link',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id').notNull().references(() => cases.id),
    contractCode: text('contract_code').notNull(),
    store: text('store'),
    plate: text('plate'),
    vehicleModel: text('vehicle_model'),
    rentalType: text('rental_type'),
    appDriver: boolean('app_driver'),
    source: text('source').$type<'manual' | 'ai' | 'rental_system'>().notNull().default('manual'),
    validatedAt: ts('validated_at'),
    ...stamps,
  },
  (t) => [index('rental_link_case_idx').on(t.caseId), index('rental_link_contract_idx').on(t.contractCode), index('rental_link_plate_idx').on(t.plate)],
);

