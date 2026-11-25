import 'dotenv/config';

/**
 * Leva para Processos o que está esperando na Triagem vindo do DJEN (tudo que o DJEN traz já é processo em andamento): cria o processo
 * (cadastro mínimo, a completar, monitoramento ligado) e as publicações ficam no histórico dele, já lidas (sem alerta).
 *   pnpm triagem:converter-djen
 * Idempotente: o item convertido fica confirmado.
 */
async function main() {
  const { db, pool } = await import('../src/db');
  const { inboxItem } = await import('../src/db/schema/inbox');
  const { and, eq, inArray } = await import('drizzle-orm');
  const { hasPartDoubt, registerOngoingCase } = await import('../src/server/auto-register');
  const items = await db.select().from(inboxItem).where(and(eq(inboxItem.source, 'djen_term'), inArray(inboxItem.status, ['new', 'possible_duplicate'])));
  let casesCreated = 0, done = 0, skipped = 0;
  for (const it of items) {
    const [cur] = await db.select({ status: inboxItem.status }).from(inboxItem).where(eq(inboxItem.id, it.id));
    if (!cur || cur.status === 'confirmed') continue; // já convertido junto com outro item do mesmo número
    const input = { source: 'djen_term' as const, caseNumber: it.caseNumber ?? '', externalId: it.externalId ?? '', parsed: it.parsed as never, payload: it.payload };
    if (hasPartDoubt(input)) { skipped++; continue; } // dúvida de parte fica na Triagem para decisão humana
    const r = await registerOngoingCase(input);
    done++;
    if (r.createdCase) casesCreated++;
  }
  console.log(`Itens do DJEN na Triagem: ${items.length}. Convertidos: ${done} (processos criados: ${casesCreated}). Mantidos na Triagem por dúvida de parte: ${skipped}.`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
