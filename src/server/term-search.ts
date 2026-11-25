import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { monitoredTerm } from '@/db/schema/inbox';
import { djen } from '@/lib/connectors/djen';
import { runConnector } from '@/lib/connectors/runner';
import { isAllowedHours, windowStartForHours } from '@/lib/connectors/window';
import { getDjenIntervalHours } from './settings';

/**
 * Período da busca de um termo: o escolhido em "Buscar de novo" ou, sem escolha (termo criado, editado ou ativado),
 * o intervalo configurado em Monitoramento (padrão 1 hora). Só 1, 6, 12 ou 24 horas.
 */
const resolveHours = async (h?: number | null) => (isAllowedHours(h) ? h : await getDjenIntervalHours());

/** Marca o termo como "na fila" (a tela mostra o andamento). Chamado antes de despachar o job. */
export async function markSearchPending(termId: string, hours?: number) {
  await db
    .update(monitoredTerm)
    .set({
      searchStatus: 'pending', searchRequestedAt: new Date(), searchFinishedAt: null, searchFound: null, searchNew: null,
      searchHours: await resolveHours(hours), searchError: null,
    })
    .where(eq(monitoredTerm.id, termId));
}

/**
 * Executa a busca de UM termo no DJEN (job). Roda só se o termo estiver ativo, consulta o período para trás e
 * grava o resultado no próprio termo. Busca parcial: não mexe no ponto de retomada da consulta diária.
 */
export async function runTermSearch(termId: string, hours?: number, deps: { fetchFn?: typeof fetch; now?: Date } = {}) {
  const [t] = await db.select().from(monitoredTerm).where(eq(monitoredTerm.id, termId));
  if (!t || !t.active) return { status: 'skipped' as const };
  const h = await resolveHours(hours ?? t.searchHours);
  const now = deps.now ?? new Date();
  await db.update(monitoredTerm).set({ searchStatus: 'running', searchHours: h, searchError: null }).where(eq(monitoredTerm.id, termId));

  const since = windowStartForHours(h, now);
  const r = await runConnector(djen, { termFilter: (x) => x.id === termId, since, fetchFn: deps.fetchFn, now });
  if (r.status === 'ok') {
    await db.update(monitoredTerm).set({ searchStatus: 'ok', searchFinishedAt: new Date(), searchFound: r.found, searchNew: r.created }).where(eq(monitoredTerm.id, termId));
    return { status: 'ok' as const, found: r.found, created: r.created };
  }
  const error = r.status === 'error' ? r.error : r.reason;
  await db.update(monitoredTerm).set({ searchStatus: 'error', searchFinishedAt: new Date(), searchError: error.slice(0, 500) }).where(eq(monitoredTerm.id, termId));
  return { status: 'error' as const, error };
}
