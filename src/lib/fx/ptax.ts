import { and, desc, eq, lte } from 'drizzle-orm';
import { db } from '@/db';
import { fxRate } from '@/db/schema/ai';
import { addDays, todayInSaoPaulo } from '@/lib/deadlines';

const BASE = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia';

/** PTAX de venda do dia (API pública do Banco Central). Retorna null em fim de semana/feriado ou erro. */
export async function fetchPtax(date: string, fetchFn: typeof fetch = fetch): Promise<number | null> {
  const [y, m, d] = date.split('-');
  const url = `${BASE}(dataCotacao=@dataCotacao)?@dataCotacao='${m}-${d}-${y}'&$top=1&$format=json&$select=cotacaoVenda`;
  const res = await fetchFn(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  const json = (await res.json()) as { value?: { cotacaoVenda: number }[] };
  return json.value?.[0]?.cotacaoVenda ?? null;
}

/** Job diário (dias úteis, 13h30): grava a PTAX do dia; sem cotação no dia, não grava (vale a última disponível). */
export async function syncPtax(date = todayInSaoPaulo(), fetchFn: typeof fetch = fetch) {
  const rate = await fetchPtax(date, fetchFn);
  if (rate === null) return null;
  const [dup] = await db.select({ id: fxRate.id }).from(fxRate).where(and(eq(fxRate.date, date), eq(fxRate.source, 'ptax'))).limit(1);
  if (!dup) await db.insert(fxRate).values({ date, source: 'ptax', rate: rate.toFixed(4) });
  return rate;
}

/**
 * Cotação usada numa chamada: a manual mais recente em vigor (vale a partir da data definida, até ser removida),
 * senão a PTAX do dia ou a última disponível. Cada chamada grava a cotação usada, então mudar depois não altera o histórico.
 */
export async function currentFxRate(date = todayInSaoPaulo()): Promise<number | null> {
  const latest = async (source: 'manual' | 'ptax') =>
    (await db.select().from(fxRate).where(and(eq(fxRate.source, source), lte(fxRate.date, date))).orderBy(desc(fxRate.date), desc(fxRate.id)).limit(1))[0];
  const manual = await latest('manual');
  if (manual && Number(manual.rate) > 0) return Number(manual.rate);
  const ptax = await latest('ptax');
  return ptax ? Number(ptax.rate) : null;
}

export { addDays };
