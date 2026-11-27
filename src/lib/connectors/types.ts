import type { Parsed } from '@/server/inbox';
import type { MovementSource } from '@/server/movements';

export type RawItem = Record<string, unknown>;

export type InboxItemInput = {
  caseNumber: string; externalId: string; parsed?: Parsed; payload?: unknown; source: 'projuris_api' | 'djen_term' | 'domicilio';
};

export type MovementInput = {
  source: MovementSource; externalId: string; caseNumber: string; occurredAt: Date; title?: string | null; rawText: string; matchedTermId?: string | null;
  /** backfill da primeira captura: entra como histórico lido, sem virar alerta (ex.: publicação antiga do Projuris, já conhecida) */
  alreadyRead?: { by: string | null };
};

/** Todo conector implementa a mesma interface e roda como job do pg-boss (PRD 9.1). */
export interface Connector {
  name: 'projuris' | 'domicilio' | 'djen' | 'datajud';
  /** Sem credencial ou configuração, o conector avisa em vez de falhar silenciosamente. */
  isConfigured(): { ok: true } | { ok: false; reason: string };
  /** `ctx.terms` e `ctx.cases` são entregues pelo runner (termos ativos / processos com monitoramento ligado). */
  fetchSince(cursor: string | null, ctx: ConnectorContext): Promise<{ items: RawItem[]; nextCursor: string | null; errors?: string[] }>;
  toInbox?(item: RawItem, ctx: ConnectorContext): InboxItemInput | null; // processos novos
  toMovement?(item: RawItem, ctx: ConnectorContext): MovementInput | null; // movimentações de processos existentes
}

export type ConnectorContext = {
  terms: { id: string; term: string; kind: 'cnpj' | 'name' | 'oab' | 'lawyer'; document: string | null }[];
  rejectedNames: string[]; // grafias que o admin marcou como NÃO sendo a empresa (homônimos)
  monitoredNumbers: string[]; // números (só dígitos) com monitoring = true
  pendingNumbers: string[]; // números (só dígitos) ainda esperando a Triagem (Caixa de entrada), sem processo confirmado
  fetchFn: typeof fetch;
  sleep?: (ms: number) => Promise<void>; // espera entre tentativas (testes passam uma versão instantânea)
  now: Date;
  lastRunAt?: Date | null; // fim da última execução completa bem-sucedida
  intervalHours?: number; // intervalo configurado pelo admin (1, 6, 12 ou 24)
  explicitSince?: string; // início pedido pelo admin (busca de um termo ou período escolhido); vazio = janela diária normal
};
