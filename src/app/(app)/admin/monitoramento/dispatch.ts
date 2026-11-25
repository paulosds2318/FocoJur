import { after } from 'next/server';
import { JOBS, enqueue } from '@/lib/jobs';
import { markSearchPending, runTermSearch } from '@/server/term-search';

/**
 * Dispara a busca de um termo assim que ele é criado, editado ou ativado.
 * - Produção: vai para a fila (pg-boss) e o worker executa, sem prender o servidor web.
 * - Desenvolvimento (sem worker rodando): executa no próprio servidor logo depois da resposta. JOBS_INLINE=true/false força.
 * Se o worker estiver parado em produção, o job espera na fila e roda quando ele voltar (o termo mostra "Na fila").
 */
export async function dispatchTermSearch(termId: string, hours?: number) {
  await markSearchPending(termId, hours);
  const inline = process.env.JOBS_INLINE ? process.env.JOBS_INLINE === 'true' : process.env.NODE_ENV !== 'production';
  if (inline) {
    after(async () => { await runTermSearch(termId, hours).catch(() => undefined); });
    return;
  }
  await enqueue(JOBS.termSearch, { termId, hours }, { singletonKey: termId, singletonSeconds: 30 });
}

export async function dispatchMany(ids: string[], hours?: number) {
  for (const id of ids) await dispatchTermSearch(id, hours);
}
