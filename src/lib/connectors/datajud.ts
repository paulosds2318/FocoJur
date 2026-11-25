import { normalizeCaseNumber } from '@/lib/case-number';
import { addDays, todayInSaoPaulo } from '@/lib/deadlines';
import { ROBOT_USER_AGENT } from '@/lib/portals';
import type { Connector, ConnectorContext, MovementInput, RawItem } from './types';

/**
 * DataJud — API pública do CNJ, consulta por número do processo (não busca por parte). Pode ter atraso,
 * por isso é combinada com DJEN e Domicílio. A chave pública vem da wiki do CNJ (DATAJUD_API_KEY) e pode mudar a qualquer momento.
 *
 * Feito para volume (milhares de processos): os números são agrupados por tribunal e consultados em lotes (`terms`),
 * com espera e nova tentativa quando o CNJ responde 429/5xx ou devolve resposta incompleta (índice sobrecarregado),
 * pausa entre requisições e um teto de requisições por execução. Falha de um lote não derruba os demais.
 */
const STATE_CODES = ['ac', 'al', 'ap', 'am', 'ba', 'ce', 'dft', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'se', 'sp', 'to'];

// lidos na hora do uso (e não na importação), para o admin/ambiente poder ajustar sem reiniciar e os testes poderem variar
export const batchSize = () => Number(process.env.DATAJUD_BATCH_SIZE ?? 50); // números por requisição
export const maxRequests = () => Number(process.env.DATAJUD_MAX_REQUESTS ?? 400); // teto por execução (inclui tentativas)
export const requestTimeoutMs = () => Number(process.env.DATAJUD_TIMEOUT_MS ?? 60_000); // por requisição (o índice do CNJ chega a levar 30 s+)
export const requestGapMs = () => Number(process.env.DATAJUD_REQUEST_GAP_MS ?? 1000); // pausa entre requisições
export const MAX_RETRIES = 4;
/** Só movimentações dos últimos N dias viram movimento: o DataJud atrasa dias para publicar, mas o histórico antigo não pode inundar a triagem. */
export const LOOKBACK_DAYS = Number(process.env.DATAJUD_LOOKBACK_DAYS ?? 7);

const SOURCE_FIELDS = ['numeroProcesso', 'classe', 'orgaoJulgador', 'dataAjuizamento', 'dataHoraUltimaAtualizacao', 'movimentos', 'assuntos', 'grau', 'sistema', 'formato'];

/** Alias do índice do tribunal a partir dos segmentos J.TR do número CNJ (ex.: 8.21 → tjrs, 5.01 → trt1). */
export function tribunalAlias(caseNumber: string): string | null {
  const d = normalizeCaseNumber(caseNumber);
  if (d.length !== 20) return null;
  const j = d[13];
  const tr = Number(d.slice(14, 16));
  if (j === '8') return STATE_CODES[tr - 1] ? `tj${STATE_CODES[tr - 1]}` : null;
  if (j === '5') return tr >= 1 && tr <= 24 ? `trt${tr}` : null;
  if (j === '4') return tr >= 1 && tr <= 6 ? `trf${tr}` : null;
  return null;
}

/** Números únicos (só dígitos) agrupados pelo índice do tribunal; número sem tribunal reconhecido é ignorado. */
export function groupByAlias(numbers: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const raw of new Set(numbers.map(normalizeCaseNumber))) {
    const alias = tribunalAlias(raw);
    if (alias) out.set(alias, [...(out.get(alias) ?? []), raw]);
  }
  return out;
}

export const chunk = <T,>(arr: T[], size: number): T[][] => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));

/** Espera antes de tentar de novo: o `Retry-After` do CNJ (em segundos, no máximo 60) ou 2, 4, 8, 16 s. */
export function retryDelayMs(attempt: number, retryAfter?: string | null): number {
  const secs = Number(retryAfter);
  if (retryAfter && Number.isFinite(secs) && secs > 0) return Math.min(secs, 60) * 1000;
  return Math.min(2000 * 2 ** attempt, 30_000);
}

type Hit = { _source?: RawItem };
type SearchJson = { timed_out?: boolean; _shards?: { total?: number; failed?: number }; hits?: { hits?: Hit[] } };
const RETRYABLE = new Set([429, 502, 503, 504]);

/** Uma consulta em lote. Devolve o que veio e, se algo ficou incompleto, o motivo (para registrar sem perder o que deu certo). */
async function searchBatch(ctx: ConnectorContext, alias: string, numbers: string[], budget: { used: number }) {
  const sleep = ctx.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const url = `https://api-publica.datajud.cnj.jus.br/api_publica_${alias}/_search`;
  const body = JSON.stringify({ size: numbers.length, _source: SOURCE_FIELDS, query: { terms: { numeroProcesso: numbers } } });
  let lastHits: Hit[] = [];
  let reason = '';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (budget.used >= maxRequests()) return { hits: lastHits, error: `${alias}: teto de ${maxRequests()} requisições da execução atingido` };
    budget.used++;
    let res: Response;
    try {
      res = await ctx.fetchFn(url, {
        method: 'POST', signal: AbortSignal.timeout(requestTimeoutMs()), body,
        headers: { Authorization: `APIKey ${process.env.DATAJUD_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': ROBOT_USER_AGENT },
      });
    } catch (e) {
      // tempo esgotado ou falha de rede: é falha temporária como as outras (nunca derruba a execução inteira)
      const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      reason = `${alias}: ${timeout ? `sem resposta em ${Math.round(requestTimeoutMs() / 1000)} s` : 'falha de rede'}`;
      if (attempt < MAX_RETRIES) { await sleep(retryDelayMs(attempt)); continue; }
      return { hits: lastHits, error: `${reason} após ${MAX_RETRIES + 1} tentativas` };
    }
    if (res.status === 401 || res.status === 403) return { hits: [], error: `${alias}: chave recusada (${res.status}); confira a chave vigente na wiki do CNJ`, fatal: true as const };
    if (RETRYABLE.has(res.status)) {
      reason = `${alias}: DataJud ${res.status}`;
      if (attempt < MAX_RETRIES) { await sleep(retryDelayMs(attempt, res.headers.get('retry-after'))); continue; }
      return { hits: lastHits, error: `${reason} após ${MAX_RETRIES + 1} tentativas` };
    }
    if (!res.ok) return { hits: [], error: `${alias}: DataJud ${res.status}` };

    const json = (await res.json()) as SearchJson;
    lastHits = json.hits?.hits ?? [];
    const failed = json._shards?.failed ?? 0;
    if (failed > 0 || json.timed_out) {
      // índice sobrecarregado: parte dos dados não foi consultada, então "não encontrado" não vale; tenta de novo
      reason = `${alias}: resposta incompleta (${failed} de ${json._shards?.total ?? '?'} partes falharam)`;
      if (attempt < MAX_RETRIES) { await sleep(retryDelayMs(attempt)); continue; }
      return { hits: lastHits, error: `${reason} após ${MAX_RETRIES + 1} tentativas` };
    }
    return { hits: lastHits };
  }
  return { hits: lastHits, error: reason || `${alias}: falha desconhecida` };
}

export const datajud: Connector = {
  name: 'datajud',
  isConfigured: () => (process.env.DATAJUD_API_KEY ? { ok: true } : { ok: false, reason: 'DATAJUD_API_KEY não definida (chave pública do CNJ, na wiki do DataJud).' }),

  async fetchSince(_cursor, ctx) {
    const items: RawItem[] = [];
    const errors: string[] = [];
    const budget = { used: 0 };
    const groups = groupByAlias(ctx.monitoredNumbers);
    const total = [...groups.values()].reduce((n, g) => n + g.length, 0);
    let asked = 0;
    let first = true;
    const done = () => ({ items, nextCursor: ctx.now.toISOString(), errors });

    for (const [alias, numbers] of groups) {
      for (const batch of chunk(numbers, batchSize())) {
        if (budget.used >= maxRequests()) {
          // nunca parar em silêncio: diz quantos processos ficaram sem consulta nesta execução
          errors.push(`teto de ${maxRequests()} requisições atingido: ${total - asked} de ${total} processos não foram consultados`);
          return done();
        }
        if (!first && ctx.fetchFn === fetch) await new Promise((r) => setTimeout(r, requestGapMs())); // educado com a API pública
        first = false;
        asked += batch.length;
        const r = await searchBatch(ctx, alias, batch, budget);
        for (const h of r.hits) {
          const src = h._source;
          if (src) items.push({ ...src, _number: normalizeCaseNumber(String(src.numeroProcesso ?? '')), _alias: alias });
        }
        if (r.error) errors.push(r.error);
        if ('fatal' in r && r.fatal) return done(); // chave recusada: não adianta insistir
      }
    }
    return done();
  },

  /** Um processo do DataJud vira N movimentações (deduplicadas por código+data). */
  toMovement(): MovementInput | null {
    return null; // use expandMovements
  },
};

type RawMovement = { codigo?: number; nome?: string; dataHora?: string; complementosTabelados?: { nome?: string; descricao?: string }[] };

/** Data mínima (AAAA-MM-DD, Brasília) das movimentações que entram: hoje menos `LOOKBACK_DAYS`. */
export const movementCutoff = (now: Date, days = LOOKBACK_DAYS) => addDays(todayInSaoPaulo(now), -days);

/** Expande um registro do DataJud nas suas movimentações recentes (a partir de `cutoff`, se informado). */
export function expandMovements(item: RawItem, cutoff?: string): MovementInput[] {
  const number = String(item._number ?? item.numeroProcesso ?? '');
  const list = (item.movimentos as RawMovement[] | undefined) ?? [];
  return list
    .filter((m) => m.dataHora && m.nome && (!cutoff || m.dataHora.slice(0, 10) >= cutoff))
    .map((m) => ({
      source: 'datajud' as const, externalId: `datajud:${normalizeCaseNumber(number)}:${m.codigo ?? 0}:${m.dataHora}`, caseNumber: number,
      occurredAt: new Date(m.dataHora!), title: m.nome!,
      rawText: [m.nome, ...(m.complementosTabelados ?? []).map((c) => c.descricao ?? c.nome)].filter(Boolean).join(' — '),
    }));
}

// ---------- consulta de UM processo (botão "Buscar dados públicos" da Triagem) ----------
export type CaseCover = { court?: string; classe?: string; subject?: string; distributedAt?: string; system?: string; grau?: string };
export type CoverResult =
  | { ok: true; cover: CaseCover }
  | { ok: false; kind: 'no_key' | 'no_court' | 'forbidden' | 'rate_limited' | 'not_found' | 'timeout' | 'error'; message: string };

const nameOf = (v: unknown) => (v && typeof v === 'object' && typeof (v as { nome?: unknown }).nome === 'string' ? ((v as { nome: string }).nome).trim() : undefined) || undefined;

/** Dados de capa a partir do registro do DataJud (só o que veio; nada é inventado). */
export function coverFromSource(src: RawItem): CaseCover {
  const subjects = Array.isArray(src.assuntos) ? (src.assuntos as unknown[]).map(nameOf).filter((x): x is string => !!x) : [];
  const date = typeof src.dataAjuizamento === 'string' ? src.dataAjuizamento.slice(0, 10) : '';
  const cover: CaseCover = {
    court: nameOf(src.orgaoJulgador), classe: nameOf(src.classe), subject: subjects[0],
    distributedAt: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined, system: nameOf(src.sistema),
    grau: typeof src.grau === 'string' ? src.grau : undefined,
  };
  return Object.fromEntries(Object.entries(cover).filter(([, v]) => v)) as CaseCover;
}

/**
 * Consulta UM número, de forma curta (cabe numa ação de tela): no máximo 2 requisições, só repete em falha temporária
 * (5xx, rede, resposta incompleta) e NUNCA após 429 (o CNJ limitou: registra e para). Tempo total limitado (~25 s).
 */
export async function lookupCaseCover(caseNumber: string, opts: { fetchFn?: typeof fetch; sleep?: (ms: number) => Promise<void>; requestTimeoutMs?: number } = {}): Promise<CoverResult> {
  if (!process.env.DATAJUD_API_KEY) return { ok: false, kind: 'no_key', message: 'A chave do DataJud (DATAJUD_API_KEY) não está configurada neste ambiente.' };
  const n = normalizeCaseNumber(caseNumber);
  const alias = tribunalAlias(n);
  if (!alias) return { ok: false, kind: 'no_court', message: 'Não foi possível identificar o tribunal pelo número deste processo; preencha manualmente.' };
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const timeoutMs = opts.requestTimeoutMs ?? 11_000;
  const url = `https://api-publica.datajud.cnj.jus.br/api_publica_${alias}/_search`;
  const body = JSON.stringify({ size: 1, _source: SOURCE_FIELDS.filter((f) => f !== 'movimentos'), query: { terms: { numeroProcesso: [n] } } });
  let last: CoverResult = { ok: false, kind: 'error', message: 'O DataJud não respondeu como esperado.' };

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: 'POST', signal: AbortSignal.timeout(timeoutMs), body,
        headers: { Authorization: `APIKey ${process.env.DATAJUD_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': ROBOT_USER_AGENT },
      });
    } catch (e) {
      const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      last = { ok: false, kind: 'timeout', message: timeout ? 'O DataJud demorou demais para responder. Tente de novo em alguns minutos.' : 'Falha de rede ao consultar o DataJud. Tente de novo em alguns minutos.' };
      if (attempt === 0) { await sleep(1500); continue; }
      return last;
    }
    if (res.status === 401 || res.status === 403) return { ok: false, kind: 'forbidden', message: `O DataJud recusou a chave (${res.status}). Confira a chave vigente na wiki do CNJ.` };
    if (res.status === 429) return { ok: false, kind: 'rate_limited', message: 'O CNJ limitou as consultas agora (erro 429). Tente mais tarde; não vou insistir.' };
    if (res.status >= 500) {
      last = { ok: false, kind: 'error', message: `O DataJud está instável (erro ${res.status}). Tente de novo em alguns minutos.` };
      if (attempt === 0) { await sleep(1500); continue; }
      return last;
    }
    if (!res.ok) return { ok: false, kind: 'error', message: `O DataJud respondeu com erro ${res.status}.` };
    const json = (await res.json()) as SearchJson;
    if ((json._shards?.failed ?? 0) > 0 || json.timed_out) {
      last = { ok: false, kind: 'error', message: 'O índice do DataJud respondeu incompleto agora, então não dá para afirmar que o processo não existe. Tente mais tarde.' };
      if (attempt === 0) { await sleep(1500); continue; }
      return last;
    }
    const src = json.hits?.hits?.[0]?._source;
    if (!src) return { ok: false, kind: 'not_found', message: 'O DataJud não tem dados deste processo (nem todo tribunal envia todos os processos, e os que correm em segredo de justiça não aparecem). Preencha manualmente.' };
    const cover = coverFromSource(src);
    if (!Object.keys(cover).length) return { ok: false, kind: 'not_found', message: 'O DataJud encontrou o processo, mas sem dados de capa. Preencha manualmente.' };
    return { ok: true, cover };
  }
  return last;
}
