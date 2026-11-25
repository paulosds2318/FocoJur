import 'dotenv/config';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Gestão de termos, lojas e variações de nome pela tela do admin (sem mexer no código).
 * Usa o Postgres local e remove tudo que cria. CNPJ de teste com dígitos válidos: 11.222.333/0001-81.
 */
const CNPJ_NOVO = '11.222.333/0001-81';
let adminId: string;

async function limpa() {
  const { db } = await import('@/db');
  const { groupEntity, inboxItem, monitoredTerm, nameDecision } = await import('@/db/schema/inbox');
  await db.delete(groupEntity).where(like(groupEntity.label, 'TESTE-MON%'));
  await db.delete(monitoredTerm).where(like(monitoredTerm.term, 'EMPRESA TESTE MON%'));
  await db.delete(monitoredTerm).where(like(monitoredTerm.term, 'FOCO ALUGUEL TESTEMON%'));
  await db.delete(monitoredTerm).where(eq(monitoredTerm.term, '99999/ZZ'));
  await db.delete(nameDecision).where(like(nameDecision.displayName, 'FOCO ALUGUEL TESTEMON%'));
  await db.delete(inboxItem).where(like(inboxItem.caseNumber, '9996%'));
  // a aprovação de uma variação cria o processo do item (cadastro mínimo); remove o que o teste gerou
  const { cases, caseCivil, caseParty } = await import('@/db/schema/case');
  const { auditLog } = await import('@/db/schema');
  const criados = await db.select({ id: cases.id }).from(cases).where(like(cases.number, '9996%'));
  for (const c of criados) {
    await db.delete(auditLog).where(eq(auditLog.entityId, c.id));
    await db.delete(caseParty).where(eq(caseParty.caseId, c.id));
    await db.delete(caseCivil).where(eq(caseCivil.caseId, c.id));
  }
  await db.delete(cases).where(like(cases.number, '9996%'));
}

beforeAll(async () => {
  const { db } = await import('@/db');
  const { user } = await import('@/db/schema');
  const [a] = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);
  adminId = a.id;
  await limpa();
});
afterAll(async () => {
  await limpa();
  const { pool } = await import('@/db');
  await pool.end();
});

describe('validação dos termos (regras aprendidas no teste real do DJEN)', () => {
  it('nome exige CNPJ válido; advogado exige nome completo; OAB exige número/UF', async () => {
    const { validateTerm } = await import('@/server/monitoring');
    expect(validateTerm('name', 'Foco Aluguel', '').ok).toBe(false); // sem CNPJ de conferência
    expect(validateTerm('name', 'Foco Aluguel', '11.222.333/0001-82')).toMatchObject({ ok: false }); // dígito errado
    expect(validateTerm('name', 'Foco Aluguel', CNPJ_NOVO)).toMatchObject({ ok: true, term: 'FOCO ALUGUEL', document: CNPJ_NOVO });
    expect(validateTerm('lawyer', 'Sergio Cahu', null)).toMatchObject({ ok: false }); // incompleto não retorna nada
    expect(validateTerm('lawyer', 'Sergio Mendes Cahu Filho', null)).toMatchObject({ ok: true, term: 'SERGIO MENDES CAHU FILHO' });
    expect(validateTerm('oab', '34790 pe', null)).toMatchObject({ ok: true, term: '34790/PE' });
    expect(validateTerm('oab', '34790', null)).toMatchObject({ ok: false });
    expect(validateTerm('cnpj', '12.345.678/0001-00', null)).toMatchObject({ ok: false });
  });
});

describe('termos', () => {
  it('adiciona, edita, evita duplicado e exclui', async () => {
    const { addTerm, updateTerm, setTermActive, deleteTerm, listTerms } = await import('@/server/monitoring');
    const a = await addTerm(adminId, { kind: 'oab', term: '99999 zz' });
    expect(a).toMatchObject({ ok: true });
    expect(await addTerm(adminId, { kind: 'oab', term: '99999/ZZ' })).toMatchObject({ ok: false, error: 'Esse termo já está cadastrado.' });
    const id = (a as { id: string }).id;
    expect(await updateTerm(adminId, id, { term: 'errado' })).toMatchObject({ ok: false });
    await setTermActive(adminId, id, false);
    expect((await listTerms()).find((t) => t.id === id)?.active).toBe(false);
    await deleteTerm(adminId, id);
    expect((await listTerms()).some((t) => t.id === id)).toBe(false);
  });
});

describe('lojas e empresas do grupo', () => {
  it('loja de empresa que já é monitorada só cadastra o CNPJ; empresa nova cria a busca por nome', async () => {
    const { addEntity, listEntities, listTerms } = await import('@/server/monitoring');
    const { db } = await import('@/db');
    const { groupEntity } = await import('@/db/schema/inbox');

    // loja nova de uma empresa existente (mesma raiz 07.730.797), reaproveitando a razão social
    const base = (await listEntities()).find((e) => e.cnpj.startsWith('07730797'));
    expect(base).toBeTruthy();

    // CNPJ inválido e nome vazio são recusados
    expect(await addEntity(adminId, { cnpj: '11.222.333/0001-82', label: 'TESTE-MON x' })).toMatchObject({ ok: false });
    expect(await addEntity(adminId, { cnpj: CNPJ_NOVO, label: '   ' })).toMatchObject({ ok: false });

    // empresa nova (raiz diferente) sem razão social: pede
    expect(await addEntity(adminId, { cnpj: CNPJ_NOVO, label: 'TESTE-MON matriz' })).toMatchObject({ ok: false, error: expect.stringContaining('razão social') });

    const termsBefore = (await listTerms()).filter((t) => t.kind === 'name').length;
    const nova = await addEntity(adminId, { cnpj: CNPJ_NOVO, label: 'TESTE-MON matriz', companyName: 'EMPRESA TESTE MON LTDA' });
    expect(nova).toMatchObject({ ok: true, createdTerm: true });
    const names = (await listTerms()).filter((t) => t.kind === 'name');
    expect(names.length).toBe(termsBefore + 1);
    expect(names.find((t) => t.term === 'EMPRESA TESTE MON LTDA')?.document).toBe(CNPJ_NOVO);

    // outra loja da mesma empresa nova: não cria outro termo e herda a razão social
    expect(await addEntity(adminId, { cnpj: '11.222.333/0002-62', label: 'TESTE-MON filial' })).toMatchObject({ ok: true, createdTerm: false });
    expect(await addEntity(adminId, { cnpj: CNPJ_NOVO, label: 'TESTE-MON de novo' })).toMatchObject({ ok: false, error: 'Esse CNPJ já está cadastrado.' });
    const filial = (await db.select().from(groupEntity)).find((e) => e.label === 'TESTE-MON filial');
    expect(filial?.companyName).toBe('EMPRESA TESTE MON LTDA');
  });
});

describe('variações do nome da empresa', () => {
  it('aprovar vira termo e destrava os itens; rejeitar descarta os itens e some das próximas buscas', async () => {
    const { db } = await import('@/db');
    const { inboxItem, monitoredTerm, nameDecision } = await import('@/db/schema/inbox');
    const { decideVariation, foundVariations } = await import('@/server/name-variations');
    const mk = async (num: string, nome: string) => {
      const [r] = await db.insert(inboxItem).values({
        source: 'djen_term', caseNumber: num, status: 'new',
        payload: { destinatarios: [{ nome, polo: 'P' }], publications: [] },
        parsed: { nameVariation: nome, obtainedBy: 'Conferir parte: nome diferente' },
      }).returning({ id: inboxItem.id });
      return r.id;
    };
    const aprovada = 'FOCO ALUGUEL TESTEMON LOCADORA LTDA';
    const rejeitada = 'FOCO ALUGUEL TESTEMON VEICULOS LTDA';
    const i1 = await mk('99960000000000000001', aprovada);
    const i2 = await mk('99960000000000000002', rejeitada);

    const vistas = (await foundVariations()).map((v) => v.name);
    expect(vistas).toEqual(expect.arrayContaining([aprovada, rejeitada]));

    expect(await decideVariation(adminId, aprovada, 'approved')).toMatchObject({ ok: true });
    const t = (await db.select().from(monitoredTerm)).find((x) => x.term === aprovada);
    expect(t?.kind).toBe('name');
    expect(t?.document).toBeTruthy(); // herdou o CNPJ de conferência
    const [a] = await db.select().from(inboxItem).where(eq(inboxItem.id, i1));
    expect(a.status).toBe('confirmed'); // sem mais dúvida, o item do DJEN já virou processo em andamento
    expect((a.parsed as { nameVariation?: string }).nameVariation).toBeUndefined();
    const { cases } = await import('@/db/schema/case');
    expect(await db.select().from(cases).where(eq(cases.number, '99960000000000000001'))).toHaveLength(1);

    expect(await decideVariation(adminId, rejeitada, 'rejected')).toMatchObject({ ok: true });
    const [b] = await db.select().from(inboxItem).where(eq(inboxItem.id, i2));
    expect(b.status).toBe('discarded');
    expect((await db.select().from(nameDecision)).find((d) => d.displayName === rejeitada)?.decision).toBe('rejected');

    const depois = (await foundVariations()).map((v) => v.name);
    expect(depois).not.toContain(aprovada);
    expect(depois).not.toContain(rejeitada);
    await db.delete(monitoredTerm).where(eq(monitoredTerm.term, aprovada));
  });

  it('o conector ignora publicação cuja única grafia da Foco foi rejeitada e confirma as variações equivalentes', async () => {
    const { djen } = await import('@/lib/connectors/djen');
    const ctx = { terms: [{ id: 'x', term: 'FOCO ALUGUEL DE CARROS', kind: 'name' as const, document: CNPJ_NOVO }], rejectedNames: ['FOCO ALUGUEL DE VEICULOS LTDA'], monitoredNumbers: [], fetchFn: fetch, now: new Date() };
    const pub = (nome: string) => ({ id: '1', numero_processo: '5011870-02.2026.8.21.0001', texto: 'x', _termKind: 'name', _term: 'FOCO ALUGUEL DE CARROS', destinatarios: [{ nome }] });
    expect(djen.toInbox!(pub('FOCO ALUGUEL DE VEICULOS LTDA'), ctx)).toBeNull(); // homônimo já rejeitado
    expect(djen.toInbox!(pub('FOCO ALUGUEL DE CARROS S.A.'), ctx)?.parsed?.obtainedBy).not.toMatch(/Conferir parte/); // grafia equivalente
    const nova = djen.toInbox!(pub('LOCADORA FOCO'), ctx)!; // grafia nova: pede decisão
    expect(nova.parsed?.obtainedBy).toMatch(/Conferir parte/);
    expect(nova.parsed?.nameVariation).toBe('LOCADORA FOCO');
  });
});
