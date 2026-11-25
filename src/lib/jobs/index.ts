import { PgBoss } from 'pg-boss';

export const JOBS = {
  dailyDigest: 'daily-deadline-digest',
  ptax: 'fx-ptax-sync',
  modelCatalog: 'ai-model-catalog-sync',
  budgetCheck: 'ai-budget-check',
  connectorPrefix: 'connector-', // um job por conector (domicilio, djen, datajud, projuris)
  termSearch: 'djen-term-search', // busca imediata de um termo recém-criado/ativado
  baseImport: 'base-import', // importação da base atual (planilha) pela tela de administração
} as const;

/** pg-boss usa o próprio Postgres como fila: não exige infraestrutura extra local nem na AWS. */
export async function startBoss() {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: 'pgboss' });
  boss.on('error', (e) => console.error('[pg-boss]', e));
  await boss.start();
  return boss;
}

/** Instância única do pg-boss no processo do Next (evita abrir uma conexão nova a cada clique do admin). */
const g = globalThis as unknown as { __focojurBoss?: Promise<PgBoss> };
export const getBoss = () => (g.__focojurBoss ??= startBoss());

export async function enqueue(queue: string, data: object, opts: { singletonKey?: string; singletonSeconds?: number } = {}) {
  const boss = await getBoss();
  await boss.createQueue(queue, { retryLimit: 2, retryDelay: 60 });
  return boss.send(queue, data, opts);
}
