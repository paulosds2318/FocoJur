import 'dotenv/config';
import { appendFileSync, mkdirSync } from 'node:fs';

/**
 * Consulta ao DataJud pensada para rodar sozinha no Agendador de Tarefas do Windows, a partir das 6h30 (horário em que o CNJ passa a
 * responder), sem depender do worker.
 *   pnpm datajud:agendado              → CONSULTA DE VERDADE: o conector do sistema busca as movimentações dos processos cadastrados com
 *                                        monitoramento ligado; o que for novo vira alerta (mesma rotina do job diário do worker)
 *   pnpm datajud:agendado -- --amostra → só prova se o CNJ responde (20 processos reais, leitura, nada é gravado além do log)
 *   pnpm datajud:agendado -- --dry     → só confere a configuração, sem chamar o CNJ
 * A tarefa repete a cada 30 minutos por 2 horas: se o CNJ limitar (429) ou o computador ligar mais tarde, a próxima tentativa roda; quando uma
 * execução termina sem avisos, as seguintes do dia são puladas. O conector nunca insiste dentro da mesma execução.
 * Tudo vai para logs/datajud.log.
 */
const log = (m: string) => {
  const line = `[${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}] ${m}`;
  console.log(line);
  mkdirSync('logs', { recursive: true });
  appendFileSync('logs/datajud.log', `${line}\n`);
};

async function main() {
  const amostra = process.argv.includes('--amostra');
  const dry = process.argv.includes('--dry');
  const { db, pool } = await import('../src/db');
  const { and, eq, isNull, sql } = await import('drizzle-orm');
  const { cases } = await import('../src/db/schema/case');
  const { CONNECTORS, runConnector } = await import('../src/lib/connectors/runner');
  const { datajud, expandMovements, movementCutoff } = await import('../src/lib/connectors/datajud');

  try {
    const cfg = datajud.isConfigured();
    if (!cfg.ok) return log(`DataJud não configurado: ${cfg.reason}`);

    const monitored = await db.select({ n: cases.number }).from(cases).where(and(eq(cases.monitoring, true), isNull(cases.closedAt), isNull(cases.deletedAt)));

    if (amostra) {
      // amostra de processos REAIS (os da Triagem vieram do DJEN), só leitura
      if (dry) return log(`Simulação (amostra): chave configurada, ${monitored.length} processos monitorados. Nada foi enviado ao CNJ.`);
      const sample = (await db.execute<{ n: string }>(sql`select distinct case_number as n from inbox_item where source = 'djen_term' and substr(case_number, 14, 3) = '821' limit 20`)).rows.map((r) => r.n);
      log(`Consultando uma AMOSTRA de ${sample.length} processos reais do TJRS (só leitura)…`);
      const t0 = Date.now();
      const r = await datajud.fetchSince(null, {
        terms: [], rejectedNames: [], monitoredNumbers: sample, fetchFn: fetch, now: new Date(),
        sleep: async (ms) => { log(`  CNJ pediu para esperar; nova tentativa em ${ms / 1000}s`); await new Promise((res) => setTimeout(res, ms)); },
      });
      const movs = r.items.flatMap((i) => expandMovements(i, movementCutoff(new Date()))).length;
      log(`Amostra concluída em ${((Date.now() - t0) / 1000).toFixed(0)}s: ${r.items.length} de ${sample.length} processos encontrados, ${movs} movimentações dos últimos 7 dias, ${r.errors?.length ?? 0} erro(s).`);
      return log(r.items.length > 0 ? 'RESULTADO: o DataJud respondeu com dados reais.' : 'RESULTADO: o CNJ ainda não entregou dados.');
    }

    // execução de verdade: pula se uma execução SEM avisos já terminou hoje (nas últimas 12 h), por exemplo a do worker
    const [{ boas }] = (await db.execute<{ boas: number }>(sql`select count(*)::int as boas from connector_run where connector = 'datajud' and status = 'ok' and started_at > now() - interval '12 hours'`)).rows;
    if (boas > 0) return log('O DataJud já foi consultado com sucesso nas últimas 12 horas (pelo worker ou por uma tentativa anterior); não repito.');
    if (dry) return log(`Simulação: chave configurada, ${monitored.length} processos monitorados, nenhuma consulta bem-sucedida nas últimas 12 h. Nada foi enviado ao CNJ.`);

    log(`Consultando o DataJud: ${monitored.length} processos monitorados (o que for novo vira alerta)…`);
    const t0 = Date.now();
    const r = await runConnector(CONNECTORS.datajud);
    log(`Resultado em ${((Date.now() - t0) / 1000).toFixed(0)}s: ${JSON.stringify(r)}`);
    if (r.status === 'ok' && !(r as { warnings?: string[] }).warnings?.length) log('Consulta completa. As próximas tentativas de hoje serão puladas.');
    else log('Consulta incompleta ou com aviso do CNJ (limite de consultas, por exemplo). A próxima tentativa roda em 30 minutos.');
  } finally {
    await pool.end();
  }
}

main().catch((e) => { log(`FALHA: ${e instanceof Error ? e.message : e}`); process.exit(1); });
