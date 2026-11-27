import 'dotenv/config';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * 27/11/2026: a mesma publicação/processo nunca deve sobrar como uma segunda linha na Triagem.
 * Dois bugs reais encontrados num dia de captura real (DJEN + Projuris juntos):
 * 1) a mesma publicação do DJEN batendo em dois termos monitorados virava um item solto na Triagem, mesmo o
 *    processo já tendo um alerta vinculado (ingestMovement reportava "não vinculado" na segunda vez por engano).
 * 2) o DJEN e o Projuris, cada um com seu próprio item "novo" esperando a Triagem para o MESMO número, ficavam em
 *    duas linhas separadas em vez de uma só.
 */
const TAG = 'TESTE-SEMDUP';
const NUM = '99850000000000000001';

async function limpa() {
  const { db } = await import('@/db');
  const { cases } = await import('@/db/schema/case');
  const { movement } = await import('@/db/schema/movement');
  const { inboxItem } = await import('@/db/schema/inbox');
  await db.delete(movement).where(like(movement.externalId, `${TAG}%`));
  await db.delete(inboxItem).where(like(inboxItem.externalId, `${TAG}%`));
  await db.delete(cases).where(eq(cases.number, NUM));
}
beforeAll(limpa);
afterAll(limpa);

describe('ingestMovement: a mesma publicação batendo em dois termos não sobra na Triagem', () => {
  it('segunda vez que o mesmo external_id aparece: linked segue true se já tinha achado o processo', async () => {
    const { db } = await import('@/db');
    const { cases } = await import('@/db/schema/case');
    await db.insert(cases).values({ number: NUM, portfolio: 'civil', monitoring: true });
    const { ingestMovement } = await import('@/server/movements');
    const base = { source: 'djen' as const, externalId: `${TAG}-1`, caseNumber: NUM, occurredAt: new Date(), rawText: 'Intimação' };

    const r1 = await ingestMovement(base); // 1ª vez (achada pelo termo "nome")
    expect(r1).toMatchObject({ created: true, linked: true });
    const r2 = await ingestMovement(base); // 2ª vez, MESMO external_id (achada de novo pelo termo "advogado")
    expect(r2).toMatchObject({ created: false, linked: true }); // antes vinha linked:false por engano

    const { movement } = await import('@/db/schema/movement');
    expect(await db.select().from(movement).where(eq(movement.externalId, `${TAG}-1`))).toHaveLength(1); // nunca duplica a movimentação
  });
});

describe('addInboxItem: DJEN e Projuris para o mesmo processo entram na MESMA linha da Triagem', () => {
  it('Projuris chegando depois do DJEN (ou vice-versa) agrupa no item que já existe, não cria outro', async () => {
    const { addInboxItem } = await import('@/server/inbox');
    const { db } = await import('@/db');
    const { inboxItem } = await import('@/db/schema/inbox');

    const djen = await addInboxItem({
      source: 'djen_term', caseNumber: NUM, externalId: `${TAG}-djen-item`,
      payload: { publications: [{ id: `${TAG}-pub-djen`, data: '2026-11-27', tipo: 'Publicação', orgao: 'DJEN', texto: 'Do DJEN', link: '' }] },
    });
    expect(djen.ok).toBe(true);

    const projuris = await addInboxItem({
      source: 'projuris_api', caseNumber: NUM, externalId: `${TAG}-proj-item`,
      payload: { publications: [{ id: `${TAG}-pub-projuris`, data: '2026-11-27', tipo: 'Publicação', orgao: 'Projuris', texto: 'Do Projuris', link: '' }] },
    });
    expect(projuris.ok).toBe(true);
    if (projuris.ok) expect(projuris).toMatchObject({ grouped: true, id: djen.ok ? djen.id : undefined }); // entrou no MESMO item do DJEN

    const rows = await db.select().from(inboxItem).where(eq(inboxItem.caseNumber, NUM));
    expect(rows).toHaveLength(1); // uma linha só na Triagem
    const pubs = (rows[0].payload as { publications: { id: string }[] }).publications;
    expect(pubs.map((p) => p.id).sort()).toEqual([`${TAG}-pub-djen`, `${TAG}-pub-projuris`].sort());
  });
});
