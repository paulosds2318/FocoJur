import type { CaseFilters } from '@/server/cases';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Lê os filtros da URL (lista de processos e exportação usam as mesmas regras). */
export function parseCaseFilters(sp: SP): CaseFilters {
  return {
    q: one(sp.q),
    portfolio: one(sp.portfolio),
    status: (one(sp.status) || 'open') as CaseFilters['status'],
    prognosis: one(sp.prognosis),
    subjectId: one(sp.subjectId),
    state: one(sp.state).toUpperCase(),
    ownerId: one(sp.ownerId),
    monitoring: (one(sp.monitoring) || undefined) as CaseFilters['monitoring'],
    page: Number(one(sp.page)) || 1,
  };
}

export function searchParamsToRecord(sp: URLSearchParams): SP {
  return Object.fromEntries(sp.entries());
}
