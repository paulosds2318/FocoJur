import 'dotenv/config';

/**
 * Consulta real ao DJEN pelo conector do FocoJur (identificado como FocoJurBot, com intervalo entre requisições).
 *   pnpm consulta:djen            → cadastra os termos da Foco e consulta nome, advogado e CNPJ da matriz (padrão: últimas 24 horas; use --horas 1|6|12|24)
 *   pnpm consulta:djen -- --horas 24
 * Se a API bloquear (403/429), o script PARA e mostra o motivo: não tenta contornar.
 */
async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const horas = Number(args[args.indexOf('--horas') + 1]) || 24;

  const { db, pool } = await import('../src/db');
  const { eq } = await import('drizzle-orm');
  const { monitoredTerm, inboxItem } = await import('../src/db/schema/inbox');
  const { runConnector } = await import('../src/lib/connectors/runner');
  const { djen } = await import('../src/lib/connectors/djen');

  // os termos são gerenciados pelo admin em Administração > Monitoramento (o seed só os cria na primeira vez)
  const ativos = (await db.select().from(monitoredTerm).where(eq(monitoredTerm.active, true))).length;
  if (!ativos) { console.log('Nenhum termo ativo. Cadastre em Administração > Monitoramento (ou rode pnpm db:seed num banco novo).'); await pool.end(); return; }
  console.log(`${ativos} termos ativos.`);

  const teste = () => true; // todos os termos ativos: nome da empresa, advogado e as duas OABs

  // observa o que a API devolve (status e formato), sem imprimir o conteúdo das publicações
  const observed: { termo: string; status: number; itens?: number; campos?: string[] }[] = [];
  const watching: typeof fetch = async (input, init) => {
    const res = await fetch(input, init);
    const url = new URL(String(input));
    const termo = url.searchParams.get('nomeParte') ?? url.searchParams.get('nomeAdvogado') ?? (url.searchParams.get('numeroOab') ? `OAB ${url.searchParams.get('numeroOab')}/${url.searchParams.get('ufOab')}` : url.searchParams.get('texto')) ?? '?';
    const entry: (typeof observed)[number] = { termo, status: res.status };
    if (res.ok) {
      const json = (await res.clone().json()) as { items?: Record<string, unknown>[]; count?: number };
      entry.itens = json.items?.length ?? 0;
      entry.campos = Object.keys(json.items?.[0] ?? {});
    }
    observed.push(entry);
    return res;
  };

  const { windowStartForHours } = await import('../src/lib/connectors/window');
  const since = windowStartForHours(horas, new Date());
  console.log(`Consultando o DJEN (últimas ${horas} horas) desde ${since}…`);
  const r = await runConnector(djen, { fetchFn: watching, termFilter: teste, since, enrich: false });
  console.log('Resultado do conector:', JSON.stringify(r));
  console.table(observed.map((o) => ({ termo: o.termo, http: o.status, itens: o.itens ?? '-' })));
  if (observed[0]?.campos) console.log('Campos que a API devolve:', observed.find((o) => o.campos?.length)?.campos?.join(', '));

  const novos = await db.select().from(inboxItem).where(eq(inboxItem.source, 'djen_term'));
  const pubs = novos.reduce((n, i) => n + (((i.payload ?? {}) as { publications?: unknown[] }).publications?.length ?? 1), 0);
  const conferir = novos.filter((i) => ((i.parsed ?? {}) as { obtainedBy?: string }).obtainedBy?.startsWith('Conferir parte')).length;
  console.log(`Caixa de entrada do FocoJur: ${novos.length} processos (${pubs} publicações agrupadas), ${conferir} marcados "conferir parte".`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
