/**
 * Opções das listas oficiais montadas para o prompt da IA: rótulo + descrição (quando o Jurídico escreveu uma).
 * A descrição é texto de lista (quando usar o item, prazo e contagem do ato), sem dado pessoal.
 * Trunca cada descrição e o total para controlar tokens; os rótulos nunca são cortados.
 */
export type PromptOption = { code?: string | null; label: string; description?: string | null };

export const DESC_PROMPT_MAX = 300;
export const OPTIONS_PROMPT_MAX = 6000;

export function optionLines(rows: PromptOption[], opts: { maxDesc?: number; maxTotal?: number } = {}): string {
  const maxDesc = opts.maxDesc ?? DESC_PROMPT_MAX;
  let budget = opts.maxTotal ?? OPTIONS_PROMPT_MAX;
  return rows.map((r) => {
    const head = r.code ? `${r.code} = ${r.label}` : r.label;
    const d = (r.description ?? '').replace(/\s+/g, ' ').trim();
    if (!d || budget <= 0) return `- ${head}`;
    const text = d.length > maxDesc ? `${d.slice(0, maxDesc - 1)}…` : d;
    budget -= text.length;
    return `- ${head}: ${text}`;
  }).join('\n');
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Ato devolvido pela IA → rótulo da lista (sem diferenciar caixa/acentos). Fora da lista, volta o texto livre como veio. */
export function canonicalOption(value: string | null | undefined, rows: { label: string }[]): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  return rows.find((r) => fold(r.label) === fold(v))?.label ?? v;
}
