import 'dotenv/config';
import { eq } from 'drizzle-orm';

/** Cria o admin inicial (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD). A senha vira temporária: troca no primeiro acesso. */
async function main() {
  const { db, pool } = await import('../index');
  const { user, account } = await import('../schema');
  const { auth } = await import('../../lib/auth');
  const { tempPasswordExpiry } = await import('../../lib/auth/password');

  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@focojur.local').toLowerCase();
  if (process.env.NODE_ENV === 'production' && !process.env.SEED_ADMIN_PASSWORD) {
    throw new Error('Em produção, defina SEED_ADMIN_PASSWORD (a senha padrão de desenvolvimento não é permitida).');
  }
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Trocar12345';
  const [exists] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (exists) {
    console.log(`Admin ${email} já existe.`);
  } else {
    const ctx = await auth.$context;
    const id = crypto.randomUUID();
    await db.insert(user).values({
      id,
      name: 'Administrador',
      email,
      emailVerified: true,
      role: 'admin',
      mustChangePassword: true,
      tempPasswordExpiresAt: tempPasswordExpiry(),
    });
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: await ctx.password.hash(password),
    });
    console.log(`Admin criado: ${email} / ${password} (troca obrigatória no primeiro acesso)`);
  }

  // listas oficiais iniciais (idempotente: só insere o que falta)
  const { lookup } = await import('../schema/lookups');
  const { LOOKUP_SEED, slug } = await import('./lookups-data');
  const existing = await db.select({ type: lookup.type, code: lookup.code }).from(lookup);
  const have = new Set(existing.map((l) => `${l.type}:${l.code}`));
  const rows = Object.entries(LOOKUP_SEED).flatMap(([type, labels]) =>
    labels
      .map((label, i) => ({ type: type as keyof typeof LOOKUP_SEED, code: slug(label), label, sort: i }))
      .filter((r) => !have.has(`${r.type}:${r.code}`)),
  );
  if (rows.length) await db.insert(lookup).values(rows);
  console.log(`Listas oficiais: ${rows.length} itens novos.`);

  // feriados nacionais (idempotente)
  const { holiday } = await import('../schema/task');
  const { NATIONAL_HOLIDAYS, FORENSIC_RECESS } = await import('./holidays-data');
  const haveH = new Set((await db.select({ d: holiday.date }).from(holiday).where(eq(holiday.scope, 'national'))).map((h) => h.d));
  const newH = [...NATIONAL_HOLIDAYS, ...FORENSIC_RECESS].filter(([d], i, all) => !haveH.has(d) && all.findIndex(([x]) => x === d) === i).map(([date, description]) => ({ date, scope: 'national' as const, description }));
  if (newH.length) await db.insert(holiday).values(newH);
  console.log(`Feriados nacionais: ${newH.length} novos.`);

  // lojas/CNPJs e termos de busca do grupo Foco: só na primeira vez (depois o admin gerencia em Administração > Monitoramento)
  const { groupEntity, monitoredTerm } = await import('../schema/inbox');
  const { FOCO_ALUGUEL, FOCO_SEMINOVOS, FOCO_NOMES, FOCO_ADVOGADOS } = await import('./termos-foco');
  const digits = (s: string) => s.replace(/\D/g, '');
  if ((await db.select({ id: groupEntity.id }).from(groupEntity).limit(1)).length === 0) {
    await db.insert(groupEntity).values([
      ...FOCO_ALUGUEL.map(([c, label]) => ({ cnpj: digits(c), label, companyName: 'FOCO ALUGUEL DE CARROS S/A' })),
      ...FOCO_SEMINOVOS.map(([c, label]) => ({ cnpj: digits(c), label, companyName: 'FOCO SEMINOVOS LTDA' })),
    ]);
    console.log('Lojas do grupo cadastradas.');
  }
  if ((await db.select({ id: monitoredTerm.id }).from(monitoredTerm).limit(1)).length === 0) {
    await db.insert(monitoredTerm).values([
      ...FOCO_NOMES.map((n) => ({ term: n.term, kind: 'name' as const, document: n.document })),
      ...FOCO_ADVOGADOS,
    ]);
    console.log('Termos de busca padrão cadastrados.');
  }
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
