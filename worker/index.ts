import 'dotenv/config';

/**
 * Processo de rotinas agendadas (pg-boss). Rode com `pnpm worker`.
 * Na AWS roda como um serviço/container próprio, separado do Next.js.
 */
async function main() {
  const { startBoss, JOBS } = await import('../src/lib/jobs');
  const { sendDailyDeadlineDigest } = await import('../src/server/digest');
  const { syncPtax } = await import('../src/lib/fx/ptax');
  const { checkBudgetAlerts, syncModelCatalog } = await import('../src/server/ai-admin');
  const { CONNECTORS, runConnector } = await import('../src/lib/connectors/runner');

  const boss = await startBoss();
  const tz = { tz: 'America/Sao_Paulo' };
  const register = async (name: string, cron: string, run: () => Promise<unknown>) => {
    await boss.createQueue(name);
    await boss.schedule(name, cron, {}, tz);
    await boss.work(name, async () => {
      const out = await run();
      console.log(`[${name}]`, out ?? 'ok');
    });
  };

  // RF-25: alerta de prazos todo dia útil às 7h; o próprio job ignora feriados
  await register(JOBS.dailyDigest, '0 7 * * 1-5', async () => `${await sendDailyDeadlineDigest()} e-mail(s)`);
  // PRD 8.4: PTAX de venda do dia, dias úteis às 13h30 (sem cotação no dia, vale a última disponível)
  await register(JOBS.ptax, '30 13 * * 1-5', async () => `PTAX ${await syncPtax()}`);
  // RF-80: catálogo de modelos do OpenRouter, diário às 6h
  await register(JOBS.modelCatalog, '0 6 * * *', async () => `${await syncModelCatalog()} modelos`);
  // RF-91: alertas de 80% e 100% do limite mensal de IA
  await register(JOBS.budgetCheck, '*/15 * * * *', async () => checkBudgetAlerts());

  // PRD 9.1: frequências dos conectores (o runner registra cada execução e avisa após 3 falhas)
  const conn = (k: keyof typeof CONNECTORS) => async () => JSON.stringify(await runConnector(CONNECTORS[k]));
  // DJEN: intervalo escolhido pelo admin (1, 6, 12 ou 24 h; padrão 24 h = 6h da manhã). O worker confere a configuração a cada
  // minuto e reagenda sem precisar reiniciar.
  const { cronForInterval } = await import('../src/lib/connectors/schedule');
  const { getDjenIntervalHours } = await import('../src/server/settings');
  const djenQueue = `${JOBS.connectorPrefix}djen`;
  let djenHours = await getDjenIntervalHours();
  await register(djenQueue, cronForInterval(djenHours), conn('djen'));
  setInterval(async () => {
    try {
      const h = await getDjenIntervalHours();
      if (h === djenHours) return;
      await boss.schedule(djenQueue, cronForInterval(h), {}, tz);
      console.log(`[djen] intervalo da consulta automática alterado: ${djenHours} h -> ${h} h`);
      djenHours = h;
    } catch (e) {
      console.error('[djen] não consegui reagendar', e);
    }
  }, 60_000);
  await register(`${JOBS.connectorPrefix}datajud`, '30 6 * * *', conn('datajud')); // diário, 6h30
  await register(`${JOBS.connectorPrefix}domicilio`, '0 */2 * * 1-5', conn('domicilio')); // a cada 2 h em dias úteis
  await register(`${JOBS.connectorPrefix}projuris`, '15 */2 * * 1-5', conn('projuris'));

  // Busca imediata de termo novo/editado/ativado pelo admin (um por vez, para não sobrecarregar a API pública do DJEN)
  const { runTermSearch } = await import('../src/server/term-search');
  await boss.createQueue(JOBS.termSearch, { retryLimit: 2, retryDelay: 60 });
  await boss.work<{ termId: string; hours?: number }>(JOBS.termSearch, async ([job]) => {
    const r = await runTermSearch(job.data.termId, job.data.hours);
    console.log('[term-search]', job.data.termId, JSON.stringify(r));
    if (r.status === 'error') throw new Error(r.error); // pg-boss tenta de novo (até 2 vezes)
  });

  // Importação da base atual (planilha) iniciada pelo admin na tela de Importação
  const { runImport } = await import('../src/server/base-import');
  await boss.createQueue(JOBS.baseImport, { retryLimit: 0 });
  await boss.work<{ id: string; actorId?: string }>(JOBS.baseImport, async ([job]) => {
    const r = await runImport(job.data.id, job.data.actorId ?? null);
    console.log('[base-import]', job.data.id, JSON.stringify(r));
  });

  // Robô de portais (PRD 9.4): consome `portal_fetch` enfileirados; sem adaptador liberado, nada é enfileirado
  const { PORTAL_QUEUE, runPortalFetch } = await import('./portal');
  const { db } = await import('../src/db');
  const { portalFetch } = await import('../src/db/schema/inbox');
  const { eq } = await import('drizzle-orm');
  await boss.createQueue(PORTAL_QUEUE, { retryLimit: 3, retryDelay: 600 });
  await boss.work<{ fetchId: string }>(PORTAL_QUEUE, async ([job]) => {
    const [f] = await db.select().from(portalFetch).where(eq(portalFetch.id, job.data.fetchId));
    if (f) console.log('[portal]', f.caseNumber, JSON.stringify(await runPortalFetch(f.id, f.caseNumber)));
  });

  console.log('Worker no ar. Rotinas: alerta de prazos (7h), PTAX (13h30), catálogo de modelos (6h), limite de IA (15 min), conectores DJEN/DataJud/Domicílio/Projuris.');
  process.on('SIGTERM', async () => { await boss.stop(); process.exit(0); });
}

main().catch((e) => { console.error(e); process.exit(1); });
