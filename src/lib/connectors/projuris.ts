import { normalizeCaseNumber } from '@/lib/case-number';
import { judgeParties } from '@/lib/company-name';
import type { Publication } from '@/server/inbox';
import { portfolioFromNumber } from './djen';
import type { Connector, ConnectorContext, InboxItemInput, MovementInput, RawItem } from './types';

/**
 * Captura do Projuris Empresas (conta da Foco): a API pública de "contrato" ainda não foi confirmada pelo Projuris
 * (questão 1 do PRD), então este conector usa a MESMA rota interna que o site usa depois do login (descoberta
 * observando o navegador em 26/11/2026; não é documentada publicamente). Login por usuário/senha (PROJURIS_WEB_*), não
 * por Client ID/Secret (essa credencial é de outra integração, "Manual de integração", ainda sem documentação).
 * ATENÇÃO: rota interna e sujeita a mudar sem aviso do Projuris; se parar de funcionar, confira a resposta real antes de
 * insistir (não fazer retry em loop).
 *
 * Duas fontes, um conector só (`fetchSince` busca as duas, `toInbox`/`toMovement` tratam pelo `_kind` do item):
 * - **Distribuições**: processo novo → Caixa de entrada → Triagem decide e confirma.
 * - **Publicações** (decisão de 27/11/2026: Projuris vira a fonte de atualização, DJEN pausado por enquanto): só para
 *   processos que já existem no FocoJur com monitoramento ligado (`ctx.monitoredNumbers`, igual ao DataJud por número).
 *   Cada publicação nova vira alerta; na primeira execução (sem cursor de publicação ainda) tudo o que for encontrado
 *   entra como histórico lido, para não inundar os Alertas com o acervo antigo do Projuris de uma hora para outra.
 * Risco conhecido: pode duplicar uma atualização que também chegaria pelo DJEN/DataJud para o mesmo processo — por ora
 * não há deduplicação entre fontes; a advogada descarta a repetida com motivo, como qualquer alerta.
 */
const GATEWAY = process.env.PROJURIS_GATEWAY_URL ?? 'https://empresas-gateway.projuris.com.br/api';
const PAGE_SIZE = Number(process.env.PROJURIS_PAGE_SIZE ?? 50);
const MAX_PAGES_DIST = Number(process.env.PROJURIS_MAX_PAGES ?? 20); // segurança: nunca varre a conta inteira numa rodada só
// Publicações têm muito mais volume (acervo já na casa de 13 mil); a primeira captura precisa de mais páginas para achar,
// nas mais recentes, as que batem com processo já monitorado. Rodadas seguintes param cedo (acham o cursor rapidinho).
const MAX_PAGES_PUB = Number(process.env.PROJURIS_MAX_PAGES_PUBLICACAO ?? 300);
const REQUEST_GAP_MS = Number(process.env.PROJURIS_REQUEST_GAP_MS ?? 1000);

function tenantFrom(url: string | undefined) {
  try { return new URL(url ?? '').hostname.split('.')[0]; } catch { return ''; }
}

async function login(ctx: ConnectorContext) {
  const tenant = tenantFrom(process.env.PROJURIS_WEB_URL);
  if (!tenant) throw new Error('Projuris: PROJURIS_WEB_URL inválida (não consegui obter a conta/tenant).');
  const res = await ctx.fetchFn(`${GATEWAY}/authentication-service/authenticate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'x-tenantid': tenant },
    body: JSON.stringify({ username: process.env.PROJURIS_WEB_USER, password: process.env.PROJURIS_WEB_PASSWORD, tenant }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Projuris: login recusado (HTTP ${res.status})`);
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!data.access_token) throw new Error(`Projuris: login sem token (${data.error_description ?? data.error ?? 'resposta inesperada'})`);
  return { tenant, token: data.access_token };
}

type DistribuicaoRaw = {
  id: number; numeroProcesso?: string; ignorada?: boolean; valorCausa?: number; classeNatureza?: string; partes?: string; dataDistribuicao?: string;
  tribunal?: { nome?: string | null } | null; uf?: { uf?: string | null } | null; comarca?: { nome?: string | null } | null; natureza?: { nome?: string | null } | null;
};
type Distribuicao = RawItem & DistribuicaoRaw & { _kind: 'distribuicao' };

type PublicacaoRaw = {
  id: number; numeroProcesso?: string; codigo?: string; dataPublicacao?: string; descricao?: string;
  diario?: string | null; vara?: string | null; forum?: string | null; comarca?: string | null; estado?: string | null;
};
type Publicacao = RawItem & PublicacaoRaw & { _kind: 'publicacao'; _alreadyRead: boolean; _destino: 'case' | 'pending' };

type Cursor = { dist: number | null; pub: number | null };
function parseCursor(cursor: string | null): Cursor {
  if (!cursor) return { dist: null, pub: null };
  if (/^\d+$/.test(cursor)) return { dist: Number(cursor), pub: null }; // formato antigo (só o id da distribuição)
  try {
    const j = JSON.parse(cursor) as Partial<Cursor>;
    return { dist: j.dist ?? null, pub: j.pub ?? null };
  } catch {
    return { dist: null, pub: null };
  }
}

type Parte = { nome: string; relacao: string };

/** Lê as linhas "Nome: X; Relação: Y; ..." do texto livre `partes` que a API devolve. */
function parsePartes(partes: string | undefined | null): Parte[] {
  if (!partes) return [];
  const out: Parte[] = [];
  for (const linha of partes.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = linha.match(/^Nome:\s*([^;]+);\s*Rela[cç][aã]o:\s*([^;]+);/i);
    if (m) out.push({ nome: m[1].trim(), relacao: m[2].trim() });
  }
  return out;
}

/** A API do Projuris devolve o texto da publicação com "{##}" como separador de campo/linha, em vez de quebra de linha. */
function formatDescricao(descricao: string | undefined | null): string {
  if (!descricao) return '(sem texto)';
  return descricao.replace(/\{##\}/g, '\n').trim() || '(sem texto)';
}

/** Extrai a parte contrária (quem não é a Foco nem "neutro"). Melhor esforço: a advogada confirma/ajusta na Triagem. */
export function opposingParty(partes: string | undefined | null): string | null {
  for (const { nome, relacao } of parsePartes(partes)) {
    if (/FOCO/i.test(nome) || /^NEUTRO$/i.test(relacao)) continue;
    return nome;
  }
  return null;
}

async function fetchDistribuicoes(headers: HeadersInit, ctx: ConnectorContext, lastId: number | null) {
  const items: Distribuicao[] = [];
  let maxId = lastId ?? 0;
  const errors: string[] = [];
  for (let page = 0; page < MAX_PAGES_DIST; page++) {
    if (page > 0 && ctx.fetchFn === fetch) await new Promise((r) => setTimeout(r, REQUEST_GAP_MS));
    const qs = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE), sort: 'id,desc' });
    const res = await ctx.fetchFn(`${GATEWAY}/distribuicao/pageable?${qs}`, { headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) { errors.push(`Projuris: distribuições HTTP ${res.status} (página ${page})`); break; }
    const json = (await res.json()) as { content?: DistribuicaoRaw[] };
    const batch = json.content ?? [];
    if (!batch.length) break;
    let stop = false;
    for (const it of batch) {
      if (lastId !== null && it.id <= lastId) { stop = true; break; }
      items.push({ ...it, _kind: 'distribuicao' } as Distribuicao);
      if (it.id > maxId) maxId = it.id;
    }
    if (stop || batch.length < PAGE_SIZE) break;
  }
  return { items: items.reverse(), maxId, errors };
}

async function fetchPublicacoes(headers: HeadersInit, ctx: ConnectorContext, lastId: number | null) {
  const monitored = new Set((ctx.monitoredNumbers ?? []).map(normalizeCaseNumber));
  // também olha os que ainda esperam a Triagem (Caixa de entrada): uma atualização chegando nesse meio tempo não se perde
  const pending = new Set((ctx.pendingNumbers ?? []).map(normalizeCaseNumber));
  const firstRun = lastId === null;
  const items: Publicacao[] = [];
  let maxId = lastId ?? 0;
  const errors: string[] = [];
  if (monitored.size === 0 && pending.size === 0) return { items, maxId, errors }; // nada para procurar
  for (let page = 0; page < MAX_PAGES_PUB; page++) {
    if (page > 0 && ctx.fetchFn === fetch) await new Promise((r) => setTimeout(r, REQUEST_GAP_MS));
    const qs = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE), sort: 'id,desc' });
    const res = await ctx.fetchFn(`${GATEWAY}/publicacao/pageable?${qs}`, { headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) { errors.push(`Projuris: publicações HTTP ${res.status} (página ${page})`); break; }
    const json = (await res.json()) as { content?: PublicacaoRaw[] };
    const batch = json.content ?? [];
    if (!batch.length) break;
    let stop = false;
    for (const it of batch) {
      if (lastId !== null && it.id <= lastId) { stop = true; break; }
      if (it.id > maxId) maxId = it.id;
      const numero = normalizeCaseNumber(it.numeroProcesso ?? '');
      if (monitored.has(numero)) items.push({ ...it, _kind: 'publicacao', _alreadyRead: firstRun, _destino: 'case' } as Publicacao);
      else if (pending.has(numero)) items.push({ ...it, _kind: 'publicacao', _alreadyRead: firstRun, _destino: 'pending' } as Publicacao);
    }
    if (stop || batch.length < PAGE_SIZE) break;
  }
  return { items: items.reverse(), maxId, errors };
}

export const projuris: Connector = {
  name: 'projuris',

  isConfigured: () =>
    process.env.PROJURIS_WEB_URL && process.env.PROJURIS_WEB_USER && process.env.PROJURIS_WEB_PASSWORD
      ? { ok: true }
      : { ok: false, reason: 'Credencial da Foco no Projuris ainda não fornecida (PROJURIS_WEB_URL/PROJURIS_WEB_USER/PROJURIS_WEB_PASSWORD).' },

  // cursor = JSON { dist, pub }, o maior id já processado de cada lista (ambas vêm ordenadas por id, que cresce com o tempo).
  async fetchSince(cursor, ctx) {
    const { tenant, token } = await login(ctx);
    const headers = { accept: 'application/json', 'x-tenantid': tenant, authorization: `Bearer ${token}` };
    const { dist, pub } = parseCursor(cursor);
    const d = await fetchDistribuicoes(headers, ctx, dist);
    const p = await fetchPublicacoes(headers, ctx, pub);
    const nextCursor = JSON.stringify({ dist: d.maxId > (dist ?? 0) ? d.maxId : dist, pub: p.maxId > (pub ?? 0) ? p.maxId : pub });
    return { items: [...d.items, ...p.items], nextCursor, errors: [...d.errors, ...p.errors].length ? [...d.errors, ...p.errors] : undefined };
  },

  toInbox(item, ctx) {
    const kind = (item as RawItem)._kind;
    if (kind === 'publicacao') {
      // publicação de processo que ainda espera a Triagem: nunca cria item novo, só entra na lista de publicações do
      // que já está lá (addInboxItem agrupa pelo número); se a distribuição ainda não foi gravada (corrida rara), cria
      // um item mínimo, melhor do que perder a atualização.
      const p = item as Publicacao;
      if (p._destino !== 'pending') return null;
      const number = normalizeCaseNumber(p.numeroProcesso ?? '');
      if (number.length < 5) return null;
      const pub: Publication = {
        id: `projuris:pub:${p.id}`, data: p.dataPublicacao ?? '', tipo: 'Publicação',
        orgao: [p.diario, p.forum].filter(Boolean).join(' — ') || 'Projuris', texto: formatDescricao(p.descricao), link: '',
      };
      return {
        source: 'projuris_api', caseNumber: number, externalId: `projuris:pub-item:${p.id}`,
        payload: { publications: [pub] },
        parsed: { obtainedBy: `Publicação capturada do Projuris (nº ${p.id}), aguardando o processo ser confirmado na Triagem` },
      } satisfies InboxItemInput;
    }
    if (kind !== 'distribuicao') return null;
    const d = item as Distribuicao;
    const number = normalizeCaseNumber(d.numeroProcesso ?? '');
    if (number.length < 5) return null;
    // "ignorada" do Projuris: significado não confirmado com o suporte deles (testes reais trouxeram tudo marcado assim);
    // por segurança não descarta aqui — a decisão de manter ou não fica na Triagem, como os outros itens da caixa.
    const details = [d.classeNatureza, d.natureza?.nome].filter(Boolean).join(' · ') || undefined;
    // confere se a Foco aparece mesmo entre as partes (mesma lógica do DJEN, RF-104): nome igual/variação = ok,
    // homônimo já marcado pelo admin = descarta, nome que não bate em nada = manda com aviso para a Triagem decidir.
    const nomes = parsePartes(d.partes).map((p) => p.nome);
    const known = (ctx?.terms ?? []).filter((t) => t.kind === 'name').map((t) => t.term);
    const verdict = judgeParties(nomes, known, ctx?.rejectedNames ?? []);
    if (verdict.status === 'rejected') return null;
    const motivo = verdict.status === 'variation'
      ? `Conferir parte: nome diferente do cadastrado ("${verdict.name}"). Pode ser variação do nome da Foco ou homônimo`
      : verdict.status === 'no-party'
        ? 'Conferir parte: nenhuma parte desta distribuição bate com o nome cadastrado da Foco (pode ser outra empresa ou pessoa)'
        : null;
    return {
      source: 'projuris_api',
      caseNumber: number,
      externalId: `projuris:dist:${d.id}`,
      parsed: {
        portfolio: portfolioFromNumber(number),
        court: d.tribunal?.nome ?? undefined,
        state: d.uf?.uf ?? undefined,
        city: d.comarca?.nome ?? undefined,
        plaintiff: opposingParty(d.partes) ?? undefined,
        claimValue: typeof d.valorCausa === 'number' ? d.valorCausa : undefined,
        details,
        distributedAt: d.dataDistribuicao ?? undefined,
        nameVariation: verdict.status === 'variation' ? verdict.name : undefined,
        obtainedBy: motivo ?? `Distribuição capturada do Projuris (nº ${d.id})`,
      },
      payload: { distribuicaoId: d.id },
    } satisfies InboxItemInput;
  },

  toMovement(item) {
    if ((item as RawItem)._kind !== 'publicacao') return null; // distribuição nunca vira movimentação direto, passa pela Triagem
    const p = item as Publicacao;
    if (p._destino !== 'case') return null; // sem processo confirmado ainda: vai para a Triagem via toInbox, não vira alerta
    const number = normalizeCaseNumber(p.numeroProcesso ?? '');
    if (number.length < 5) return null;
    const titulo = [p.diario, p.forum].filter(Boolean).join(' — ') || 'Publicação';
    return {
      source: 'projuris', externalId: `projuris:pub:${p.id}`, caseNumber: number,
      occurredAt: p.dataPublicacao ? new Date(p.dataPublicacao) : new Date(),
      title: titulo.slice(0, 500), rawText: formatDescricao(p.descricao),
      ...(p._alreadyRead ? { alreadyRead: { by: null } } : {}),
    } satisfies MovementInput;
  },
};
