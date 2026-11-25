import { normalizeCaseNumber } from '@/lib/case-number';
import { textMentionsDocument } from '@/lib/cnpj';
import { judgeParties } from '@/lib/company-name';
import { addDays as addDaysIso, todayInSaoPaulo } from '@/lib/deadlines';
import { automaticWindowStart } from './window';
import { htmlToText, ROBOT_USER_AGENT } from '@/lib/portals';
import type { Connector, ConnectorContext, InboxItemInput, MovementInput, RawItem } from './types';

/**
 * DJEN — Diário de Justiça Eletrônico Nacional (CNJ). Monitoramento por termos (CNPJ, nome, OAB).
 * ATENÇÃO (PRD 9.1: "validar API"): o formato abaixo segue a API pública de comunicações do CNJ e deve ser
 * conferido contra a resposta real antes de ligar em produção. O mapeamento é tolerante a variações de nome de campo.
 */
const REQUEST_GAP_MS = Number(process.env.DJEN_REQUEST_GAP_MS ?? 1500); // educado com a API pública: no máximo ~1 requisição a cada 1,5 s
const BASE = process.env.DJEN_API_URL ?? 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';

const pick = (o: RawItem, ...keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
};
const digits = (s: string) => s.replace(/\D/g, '');
/** Compara nomes sem acento, caixa ou pontuação. */
/** Justiça do Trabalho (J = 5 no número CNJ) → trabalhista; as demais entram como cível (a advogada confirma ao revisar). */
export function portfolioFromNumber(number: string): 'labor' | 'civil' {
  return normalizeCaseNumber(number)[13] === '5' ? 'labor' : 'civil';
}

/** Quantos processos monitorados são consultados por rodada (1 requisição cada, ~1,5 s) e quantos dias para trás cada consulta olha. */
export const NUMBER_QUERIES_PER_RUN = Number(process.env.DJEN_NUMBER_QUERIES_PER_RUN ?? 120);
export const NUMBER_LOOKBACK_DAYS = 3;

/** Fatia dos números monitorados consultada nesta rodada: gira de hora em hora, sem guardar estado (a janela de 3 dias cobre o ciclo). */
export function numberSlice(numbers: string[], now: Date, size = NUMBER_QUERIES_PER_RUN) {
  if (numbers.length <= size) return numbers;
  const slices = Math.ceil(numbers.length / size);
  const idx = Math.floor(now.getTime() / 3_600_000) % slices;
  return numbers.slice(idx * size, idx * size + size);
}

export const foldName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

/** Termo → parâmetros da consulta. OAB vai como número+UF quando informado ("123456/PE"). */
export function termQuery(t: { term: string; kind: 'cnpj' | 'name' | 'oab' | 'lawyer' }): Record<string, string> {
  if (t.kind === 'lawyer') return { nomeAdvogado: t.term };
  if (t.kind === 'oab') {
    const [num, uf] = t.term.split(/[\/\s-]+/);
    return uf ? { numeroOab: digits(num), ufOab: uf.toUpperCase() } : { numeroOab: digits(t.term) };
  }
  if (t.kind === 'cnpj') return { texto: digits(t.term) };
  return { nomeParte: t.term };
}

export const djen: Connector & {
  /** Qual termo gerou o item (para `matched_term_id` e a conferência de homônimo). */
  termOf(item: RawItem): string | null;
} = {
  name: 'djen',
  isConfigured: () => ({ ok: true }),
  termOf: (item) => (typeof item._termId === 'string' ? item._termId : null),

  async fetchSince(cursor, ctx) {
    // janela normal = o intervalo configurado (padrão 1 h); busca explícita do admin usa o período escolhido
    const start = ctx.explicitSince ?? automaticWindowStart({ lastRunAt: ctx.lastRunAt, now: ctx.now, intervalHours: ctx.intervalHours ?? 1 });
    const end = todayInSaoPaulo(ctx.now);
    const items: RawItem[] = [];
    for (const term of ctx.terms) {
      for (let page = 1; page <= 10; page++) {
        const qs = new URLSearchParams({
          ...termQuery(term), dataDisponibilizacaoInicio: start, dataDisponibilizacaoFim: end, pagina: String(page), itensPorPagina: '100',
        });
        const res = await ctx.fetchFn(`${BASE}?${qs}`, { signal: AbortSignal.timeout(30_000), headers: { Accept: 'application/json', 'User-Agent': ROBOT_USER_AGENT } });
        if (ctx.fetchFn === fetch) await new Promise((r) => setTimeout(r, REQUEST_GAP_MS));
        if (!res.ok) throw new Error(`DJEN ${res.status} para o termo "${term.term}"`);
        const json = (await res.json()) as { items?: RawItem[] };
        const batch = json.items ?? [];
        for (const it of batch) items.push({ ...it, _termId: term.id, _termKind: term.kind, _termDoc: term.document, _term: term.term });
        if (batch.length < 100) break;
      }
    }

    // Processos cadastrados com monitoramento ligado são consultados pelo NÚMERO: quando o advogado da Foco não está habilitado, a
    // publicação sai sem o nome da Foco e a busca por termos não a acharia. Janela de alguns dias; a deduplicação por id evita repetição.
    const errors: string[] = [];
    const numStart = ctx.explicitSince ?? addDaysIso(end, -NUMBER_LOOKBACK_DAYS);
    for (const number of numberSlice(ctx.monitoredNumbers ?? [], ctx.now)) {
      try {
        const qs = new URLSearchParams({ numeroProcesso: digits(number), dataDisponibilizacaoInicio: numStart, dataDisponibilizacaoFim: end, pagina: '1', itensPorPagina: '100' });
        const res = await ctx.fetchFn(`${BASE}?${qs}`, { signal: AbortSignal.timeout(30_000), headers: { Accept: 'application/json', 'User-Agent': ROBOT_USER_AGENT } });
        if (ctx.fetchFn === fetch) await new Promise((r) => setTimeout(r, REQUEST_GAP_MS));
        if (!res.ok) { errors.push(`DJEN ${res.status} para o processo ${number}`); if (res.status === 429) break; continue; }
        const json = (await res.json()) as { items?: RawItem[] };
        for (const it of json.items ?? []) items.push({ ...it, _termId: null, _termKind: 'number', _termDoc: null, _term: number });
      } catch (e) {
        errors.push(`DJEN: falha ao consultar o processo ${number} (${e instanceof Error ? e.message : String(e)})`);
      }
    }
    return { items, nextCursor: end, errors: errors.slice(0, 20) };
  },

  /**
   * Publicação de processo ainda não cadastrado → caixa de entrada (RF-103), com conferência de homônimo (RF-104).
   * A parte é confirmada pelos destinatários da própria publicação (nome igual ao termo) ou, na falta, pelo documento no texto.
   */
  toInbox(item, ctx): InboxItemInput | null {
    const number = String(pick(item, 'numero_processo', 'numeroProcesso', 'numeroprocessocommascara') ?? '');
    const id = String(pick(item, 'id', 'hash') ?? '');
    if (!normalizeCaseNumber(number) || !id) return null;
    if (item._termKind === 'number') return null; // consulta por número só serve para processo já cadastrado (movimentação)
    const text = htmlToText(String(pick(item, 'texto', 'conteudo') ?? '')); // o diário entrega HTML
    const term = String(item._term ?? '');
    const partes = ((item.destinatarios as { nome?: string }[] | undefined) ?? []).map((d) => String(d.nome ?? ''));
    // nomes conhecidos da empresa: todos os termos de nome cadastrados (as variações aprovadas viram termos) + o termo desta busca
    const known = [...(ctx?.terms ?? []).filter((t) => t.kind === 'name').map((t) => t.term), ...(item._termKind === 'name' ? [term] : [])];
    const verdict = judgeParties(partes, known, ctx?.rejectedNames ?? []);
    if (verdict.status === 'rejected') return null; // só aparece grafia que o admin já marcou como homônimo
    const docOk = typeof item._termDoc === 'string' && !!item._termDoc && textMentionsDocument(text, item._termDoc);
    const needsCheck = verdict.status === 'variation' || (item._termKind === 'name' && verdict.status === 'no-party' && !docOk);
    const motivo = verdict.status === 'variation'
      ? `Conferir parte: nome diferente do cadastrado ("${verdict.name}"). Pode ser variação do nome da Foco ou homônimo; decida em Administração, Monitoramento`
      : 'Conferir parte: o nome bateu, mas o documento não aparece no texto (possível homônimo)';
    const pub = {
      id, data: String(pick(item, 'data_disponibilizacao', 'dataDisponibilizacao') ?? ''), tipo: String(pick(item, 'tipoComunicacao', 'tipo') ?? 'Publicação'),
      orgao: String(pick(item, 'nomeOrgao', 'orgao') ?? ''), texto: text, link: String(pick(item, 'link') ?? ''),
    };
    return {
      source: 'djen_term', caseNumber: number, externalId: `djen:${id}`, payload: { ...item, publications: [pub] },
      parsed: {
        court: pub.orgao || undefined, state: String(pick(item, 'siglaTribunal') ?? '').replace(/^TJ/i, '').slice(0, 2) || undefined,
        portfolio: portfolioFromNumber(number), details: text.slice(0, 2000),
        nameVariation: verdict.status === 'variation' ? verdict.name : undefined,
        obtainedBy: needsCheck ? motivo : `Publicação do DJEN pelo termo "${term}"`,
      },
    };
  },

  toMovement(item): MovementInput | null {
    const number = String(pick(item, 'numero_processo', 'numeroProcesso', 'numeroprocessocommascara') ?? '');
    const id = String(pick(item, 'id', 'hash') ?? '');
    if (!normalizeCaseNumber(number) || !id) return null;
    const when = String(pick(item, 'data_disponibilizacao', 'dataDisponibilizacao') ?? '');
    return {
      source: 'djen', externalId: `djen:${id}`, caseNumber: number, occurredAt: when ? new Date(when) : new Date(),
      title: String(pick(item, 'tipoComunicacao', 'tipo') ?? 'Publicação'), rawText: htmlToText(String(pick(item, 'texto', 'conteudo') ?? '')),
      matchedTermId: typeof item._termId === 'string' ? item._termId : null,
    };
  },
};

export type { ConnectorContext };
