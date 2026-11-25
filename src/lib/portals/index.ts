import { normalizeCaseNumber } from '@/lib/case-number';

/** Resultado da navegação do adaptador. Captcha NUNCA é contornado: vira `captcha` e segue para preenchimento manual. */
export type OpenResult = 'ok' | 'not_found' | 'not_public' | 'captcha';

/** Subconjunto da `Page` do Playwright que o pipeline usa (facilita testar sem navegador). */
export interface PortalPage {
  content(): Promise<string>;
  screenshot(): Promise<Buffer>;
}

export interface PortalAdapter {
  portal: string; // 'eproc-tjrs', 'pje-tjpe'...
  matches(caseNumber: string): boolean; // pelo segmento/tribunal do número CNJ
  open(page: PortalPage, caseNumber: string): Promise<OpenResult>;
  pageText(page: PortalPage): Promise<string>; // texto limpo para a IA
}

/**
 * Adaptadores liberados. Fica VAZIO de propósito: cada adaptador (eProc, PJe de 1 tribunal) só entra aqui depois que o
 * Jurídico avaliar os termos de uso do portal (questão 9 do PRD) e o roteiro for homologado nos 50 processos do piloto.
 * Para ligar: registrar o adaptador e listar o portal em PORTAL_ADAPTERS_ENABLED (ex.: "eproc-tjrs,pje-tjpe").
 */
const registry: PortalAdapter[] = [];
export const registerAdapter = (a: PortalAdapter) => { registry.push(a); };

export function enabledPortals(env = process.env.PORTAL_ADAPTERS_ENABLED ?? '') {
  return new Set(env.split(',').map((s) => s.trim()).filter(Boolean));
}

export function adapterFor(caseNumber: string, enabled = enabledPortals(), adapters: PortalAdapter[] = registry): PortalAdapter | null {
  const n = normalizeCaseNumber(caseNumber);
  return adapters.find((a) => enabled.has(a.portal) && a.matches(n)) ?? null;
}

const NAMED: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ', Ntilde: 'Ñ',
  ordm: 'º', ordf: 'ª', deg: '°', sect: '§', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', ndash: '–', mdash: '—', hellip: '…', bull: '•',
};
for (const [v, a] of [['a', 'aáàâãä'], ['e', 'eéèêë'], ['i', 'iíìîï'], ['o', 'oóòôõö'], ['u', 'uúùûü']] as const) {
  const names = ['', 'acute', 'grave', 'circ', 'tilde', 'uml'];
  [...a].slice(1).forEach((ch, i) => {
    const name = names[[...a].indexOf(ch)];
    if (!name || (name === 'tilde' && v !== 'a' && v !== 'o')) return;
    NAMED[`${v}${name}`] = ch;
    NAMED[`${v.toUpperCase()}${name}`] = ch.toUpperCase();
    void i;
  });
}
export function decodeEntity(m: string): string {
  const body = m.slice(1, -1);
  if (body[0] === '#') {
    const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
  }
  return NAMED[body] ?? m;
}

/** HTML → texto limpo para a IA (remove scripts, estilos e marcação; preserva quebras de bloco). */
export function decodeEntities(t: string) { return t.replace(/&[a-zA-Z]+;|&#x?[0-9a-fA-F]+;/g, decodeEntity); }
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section|br)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z]+;|&#x?[0-9a-fA-F]+;/g, decodeEntity)
        .replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export const ROBOT_USER_AGENT = 'FocoJurBot/1.0 (consulta publica; contato: juridico da Foco)';
export const MIN_INTERVAL_MS = 5_000; // no máximo 1 requisição a cada 5 s por portal

/** Horário comercial (seg a sex, 8h às 18h, America/Sao_Paulo). Fora dele, a busca espera. */
export function isBusinessHours(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(now);
  const wd = parts.find((p) => p.type === 'weekday')!.value;
  const h = Number(parts.find((p) => p.type === 'hour')!.value) % 24;
  return !['Sat', 'Sun'].includes(wd) && h >= 8 && h < 18;
}

/** Espera o intervalo mínimo desde a última requisição daquele portal (memória do processo do worker). */
const lastHit = new Map<string, number>();
export async function throttle(portal: string, now: () => number = Date.now, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {
  const wait = (lastHit.get(portal) ?? 0) + MIN_INTERVAL_MS - now();
  if (wait > 0) await sleep(wait);
  lastHit.set(portal, now());
}
