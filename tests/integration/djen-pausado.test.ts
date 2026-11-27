import 'dotenv/config';
import { eq, like } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/** DJEN_ENABLED=false (decisão de 27/11/2026): a busca manual de um termo não chama o DJEN, nem erra — só registra "nada encontrado". */
const ENV = { ...process.env };
let termId: string;
const termo = 'TESTEPAUSADJEN LTDA';

async function limpa() {
  const { db } = await import('@/db');
  const { monitoredTerm } = await import('@/db/schema/inbox');
  await db.delete(monitoredTerm).where(eq(monitoredTerm.term, termo));
}

beforeAll(async () => {
  await limpa();
  const { db } = await import('@/db');
  const { monitoredTerm } = await import('@/db/schema/inbox');
  const [t] = await db.insert(monitoredTerm).values({ term: termo, kind: 'name', active: true }).returning({ id: monitoredTerm.id });
  termId = t.id;
});
afterAll(limpa);
afterEach(() => { process.env = { ...ENV }; });

describe('DJEN pausado (DJEN_ENABLED=false)', () => {
  it('runTermSearch não chama o conector; marca "ok" com 0 encontrados, sem erro', async () => {
    process.env.DJEN_ENABLED = 'false';
    const { runTermSearch } = await import('@/server/term-search');
    const r = await runTermSearch(termId, 1, { fetchFn: (() => { throw new Error('não devia chamar o DJEN'); }) as unknown as typeof fetch });
    expect(r).toMatchObject({ status: 'ok', found: 0, created: 0 });
    const { db } = await import('@/db');
    const { monitoredTerm } = await import('@/db/schema/inbox');
    const [t] = await db.select().from(monitoredTerm).where(eq(monitoredTerm.id, termId));
    expect(t).toMatchObject({ searchStatus: 'ok', searchFound: 0, searchNew: 0, searchError: null });
  });

  it('DJEN_ENABLED ausente ou "true" segue chamando o DJEN normalmente', async () => {
    delete process.env.DJEN_ENABLED;
    let chamou = false;
    const { runTermSearch } = await import('@/server/term-search');
    const fetchFn = (async () => { chamou = true; return new Response(JSON.stringify({ items: [] }), { status: 200 }); }) as unknown as typeof fetch;
    await runTermSearch(termId, 1, { fetchFn });
    expect(chamou).toBe(true);
  });
});
