/**
 * Comparação de nomes de empresa nas publicações. Os processos trazem variações do mesmo nome ("S/A", "SA", "S.A.",
 * "S A", erros de digitação, "(FILIAL)"), então comparar texto puro perde publicações; já aceitar qualquer coisa com "FOCO"
 * confunde com homônimos. Regra: grafia equivalente confirma; grafia nova fica para o admin decidir.
 */

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Forma canônica: sem acento, sem pontuação, "S/A", "S.A.", "S A" e "SA" viram "SA"; sem numeração inicial ("2.") */
export function normalizeCompanyName(s: string): string {
  return fold(s)
    .replace(/^\s*\d+\s*[.)-]\s+/, '') // "2. FOCO ..." (numeração de polo)
    .replace(/\bS\s*[./]?\s*A\b\.?/g, ' SA ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LEGAL_FORMS = new Set(['SA', 'LTDA', 'ME', 'EPP', 'EIRELI', 'CIA']);

/** Nome-base: sem a forma societária no fim ("... SA", "... LTDA"), que não decide a identidade da empresa. */
export function coreName(normalized: string): string {
  const t = normalized.split(' ');
  while (t.length > 1 && LEGAL_FORMS.has(t[t.length - 1])) t.pop();
  return t.join(' ');
}

/** Trechos comparáveis de um nome: ele inteiro, o que está fora dos parênteses e o que está dentro (ex.: "X (FOCO ALUGUEL DE CARROS S/A)"). */
export function nameCandidates(raw: string): string[] {
  const outside = raw.replace(/\([^)]*\)/g, ' ');
  const inside = [...raw.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  return [...new Set([raw, outside, ...inside].map(normalizeCompanyName).filter((n) => n.length >= 4))];
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

export type NameMatch = 'exact' | 'similar' | 'none';

/**
 * 'exact': mesmo nome-base depois de normalizar (S/A = SA = S.A.; a forma societária no fim é ignorada), inclusive citada entre parênteses.
 * 'similar': difere por até 2 letras (erro de digitação, ex.: ALUGUEIS), em nomes longos o bastante para isso não ser acaso.
 * 'none': outra grafia: pode ser variação legítima ou homônimo, e quem decide é o admin.
 */
export function matchCompanyName(candidate: string, known: string[]): NameMatch {
  const cands = nameCandidates(candidate).map(coreName);
  const ks = known.map((k) => coreName(normalizeCompanyName(k))).filter(Boolean);
  if (cands.some((c) => ks.includes(c))) return 'exact';
  if (cands.some((c) => ks.some((k) => Math.min(c.length, k.length) >= 12 && levenshtein(c, k) <= 2))) return 'similar';
  return 'none';
}

/** Cita a Foco de alguma forma (palavra FOCO), mas pode ser outra empresa. */
export const looksLikeFoco = (s: string) => /\bFOCO\b/.test(fold(s));

export type PartyVerdict =
  | { status: 'confirmed'; matched: string }
  | { status: 'variation'; name: string } // nome diferente: conferir (variação ou homônimo)
  | { status: 'rejected' } // só aparece nome já marcado pelo admin como NÃO sendo a empresa
  | { status: 'no-party' }; // nenhum destinatário parece ser a empresa (ex.: achado pelo advogado)

/** Julga os destinatários de uma publicação contra os nomes cadastrados e os nomes já rejeitados pelo admin. */
export function judgeParties(destinatarios: string[], known: string[], rejected: string[]): PartyVerdict {
  const rej = new Set(rejected.map(normalizeCompanyName));
  const foco = destinatarios.filter(looksLikeFoco);
  for (const n of foco) if (matchCompanyName(n, known) !== 'none') return { status: 'confirmed', matched: n };
  const open = foco.filter((n) => !nameCandidates(n).some((c) => rej.has(c)));
  if (open.length) return { status: 'variation', name: open[0] };
  return foco.length ? { status: 'rejected' } : { status: 'no-party' };
}
