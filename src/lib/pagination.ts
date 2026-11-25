/** Página pedida na URL (?p=3), limitada ao intervalo válido. */
export function parsePage(raw: string | string[] | undefined, total = Infinity, size = 25): number {
  const n = Math.floor(Number(Array.isArray(raw) ? raw[0] : raw));
  const max = Number.isFinite(total) ? Math.max(1, Math.ceil(total / size)) : Infinity;
  return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : 1;
}

export const totalPages = (total: number, size: number) => Math.max(1, Math.ceil(total / size));

/** Números de página a mostrar: primeira, última e as vizinhas da atual, com `null` onde há salto ("…"). */
export function pageWindow(current: number, pages: number, around = 2): (number | null)[] {
  const keep = new Set([1, pages]);
  for (let i = current - around; i <= current + around; i++) if (i >= 1 && i <= pages) keep.add(i);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

export const rangeOf = (page: number, size: number, total: number) => ({
  from: total === 0 ? 0 : (page - 1) * size + 1,
  to: Math.min(page * size, total),
});
