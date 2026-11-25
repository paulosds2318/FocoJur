import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { groupEntity, monitoredTerm } from '@/db/schema/inbox';
import { audit } from '@/lib/audit';
import { cnpjDigits, cnpjRoot, formatCnpj, isValidCnpj } from '@/lib/cnpj';
import { foldName } from '@/lib/connectors/djen';

export type TermKind = 'cnpj' | 'name' | 'oab' | 'lawyer';
export const KIND_LABEL: Record<TermKind, string> = { name: 'Nome da parte', lawyer: 'Advogado (nome)', oab: 'OAB', cnpj: 'CNPJ no texto' };

type Valid = { ok: true; term: string; document: string | null } | { ok: false; error: string };

/**
 * Valida e normaliza um termo de busca. Regras aprendidas no teste real do DJEN: o nome da parte e a OAB funcionam;
 * o advogado só é achado pelo nome completo como está cadastrado; CNPJ no texto quase não retorna nada.
 */
export function validateTerm(kind: string, termRaw: string, documentRaw?: string | null): Valid {
  const term = termRaw.trim().replace(/\s+/g, ' ');
  const doc = (documentRaw ?? '').trim();
  if (kind === 'name') {
    if (term.length < 5) return { ok: false, error: 'O nome da parte deve ter pelo menos 5 letras.' };
    if (!doc) return { ok: false, error: 'Para termo de nome, informe o CNPJ para conferir homônimos (vale o CNPJ de qualquer unidade da empresa).' };
    if (!isValidCnpj(doc)) return { ok: false, error: 'CNPJ de conferência inválido: os dígitos verificadores não conferem.' };
    return { ok: true, term: term.toUpperCase(), document: formatCnpj(doc) };
  }
  if (kind === 'lawyer') {
    if (term.length < 8 || term.split(' ').length < 3) return { ok: false, error: 'Informe o nome COMPLETO do advogado, como está cadastrado na OAB (ex.: SERGIO MENDES CAHU FILHO). Nome incompleto não retorna resultado; se o nome tiver só duas palavras, use a OAB (número/UF).' };
    return { ok: true, term: term.toUpperCase(), document: null };
  }
  if (kind === 'oab') {
    const m = term.match(/^(\d{1,7})\s*[-\/ ]\s*([A-Za-z]{2})$/);
    if (!m) return { ok: false, error: 'OAB no formato número/UF, por exemplo 34790/PE.' };
    return { ok: true, term: `${Number(m[1])}/${m[2].toUpperCase()}`, document: null };
  }
  if (kind === 'cnpj') {
    if (!isValidCnpj(term)) return { ok: false, error: 'CNPJ inválido: os dígitos verificadores não conferem.' };
    return { ok: true, term: formatCnpj(term), document: null };
  }
  return { ok: false, error: 'Escolha o tipo do termo.' };
}

const sameTerm = (kind: string, a: string, b: string) => (kind === 'name' || kind === 'lawyer' ? foldName(a) === foldName(b) : a === b);

async function duplicate(kind: TermKind, term: string, exceptId?: string) {
  const rows = await db.select().from(monitoredTerm).where(eq(monitoredTerm.kind, kind));
  return rows.find((r) => r.id !== exceptId && sameTerm(kind, r.term, term));
}

export async function addTerm(actorId: string, input: { kind: string; term: string; document?: string | null }) {
  const v = validateTerm(input.kind, input.term, input.document);
  if (!v.ok) return v;
  if (await duplicate(input.kind as TermKind, v.term)) return { ok: false as const, error: 'Esse termo já está cadastrado.' };
  const [row] = await db.insert(monitoredTerm).values({ term: v.term, kind: input.kind as TermKind, document: v.document }).returning({ id: monitoredTerm.id });
  await audit({ actorId, entity: 'monitored_term', entityId: row.id, action: 'create', diff: { after: { kind: input.kind, term: v.term, document: v.document } } });
  return { ok: true as const, id: row.id };
}

export async function updateTerm(actorId: string, id: string, input: { term: string; document?: string | null }) {
  const [cur] = await db.select().from(monitoredTerm).where(eq(monitoredTerm.id, id));
  if (!cur) return { ok: false as const, error: 'Termo não encontrado.' };
  const v = validateTerm(cur.kind, input.term, cur.kind === 'name' ? input.document : null);
  if (!v.ok) return v;
  if (await duplicate(cur.kind, v.term, id)) return { ok: false as const, error: 'Já existe outro termo igual.' };
  await db.update(monitoredTerm).set({ term: v.term, document: v.document }).where(eq(monitoredTerm.id, id));
  await audit({ actorId, entity: 'monitored_term', entityId: id, action: 'update', diff: { before: { term: cur.term, document: cur.document }, after: { term: v.term, document: v.document } } });
  return { ok: true as const };
}

export async function setTermActive(actorId: string, id: string, active: boolean) {
  await db.update(monitoredTerm).set({ active }).where(eq(monitoredTerm.id, id));
  await audit({ actorId, entity: 'monitored_term', entityId: id, action: 'update', diff: { after: { active } } });
}

/** Excluir some da lista; para só pausar a busca, prefira desativar. As publicações já recebidas não são apagadas. */
export async function deleteTerm(actorId: string, id: string) {
  const [row] = await db.delete(monitoredTerm).where(eq(monitoredTerm.id, id)).returning();
  if (row) await audit({ actorId, entity: 'monitored_term', entityId: id, action: 'delete', diff: { before: { kind: row.kind, term: row.term } } });
}

// ---------- lojas e CNPJs do grupo ----------
/**
 * Nova loja ou empresa: guarda o CNPJ e garante que a empresa tem um termo de nome ativo. Loja nova de uma empresa que já
 * é monitorada (mesma raiz de CNPJ) não precisa de nada além do cadastro, porque a conferência de homônimo é pela raiz.
 */
export async function addEntity(actorId: string, input: { cnpj: string; label: string; companyName?: string }) {
  if (!isValidCnpj(input.cnpj)) return { ok: false as const, error: 'CNPJ inválido: os dígitos verificadores não conferem.' };
  const cnpj = cnpjDigits(input.cnpj);
  const label = input.label.trim();
  if (!label) return { ok: false as const, error: 'Informe o nome da loja/unidade (ex.: Fortaleza-CE FOR10).' };
  const [dup] = await db.select({ id: groupEntity.id }).from(groupEntity).where(eq(groupEntity.cnpj, cnpj));
  if (dup) return { ok: false as const, error: 'Esse CNPJ já está cadastrado.' };

  const root = cnpjRoot(cnpj);
  const sameRoot = (await db.select().from(groupEntity)).find((e) => cnpjRoot(e.cnpj) === root);
  const companyName = (input.companyName ?? '').trim() || sameRoot?.companyName;
  if (!companyName) return { ok: false as const, error: 'Empresa nova (raiz de CNPJ ainda não cadastrada): informe a razão social para criar a busca por nome.' };

  const [row] = await db.insert(groupEntity).values({ cnpj, label, companyName }).returning({ id: groupEntity.id });
  await audit({ actorId, entity: 'group_entity', entityId: row.id, action: 'create', diff: { after: { cnpj: formatCnpj(cnpj), label, companyName } } });

  // empresa nova: cria o termo de nome (com o CNPJ para conferir homônimo), se ainda não houver um desta raiz
  const names = await db.select().from(monitoredTerm).where(eq(monitoredTerm.kind, 'name'));
  const covered = names.some((t) => t.document && cnpjRoot(t.document) === root);
  let createdTerm = false;
  let termId: string | undefined;
  if (!covered) {
    const r = await addTerm(actorId, { kind: 'name', term: companyName, document: formatCnpj(cnpj) });
    createdTerm = r.ok;
    if (r.ok) termId = r.id;
  }
  return { ok: true as const, createdTerm, termId };
}

export async function updateEntity(actorId: string, id: string, input: { label: string }) {
  const label = input.label.trim();
  if (!label) return { ok: false as const, error: 'Informe o nome da loja/unidade.' };
  await db.update(groupEntity).set({ label }).where(eq(groupEntity.id, id));
  await audit({ actorId, entity: 'group_entity', entityId: id, action: 'update', diff: { after: { label } } });
  return { ok: true as const };
}

export async function setEntityActive(actorId: string, id: string, active: boolean) {
  await db.update(groupEntity).set({ active }).where(eq(groupEntity.id, id));
  await audit({ actorId, entity: 'group_entity', entityId: id, action: 'update', diff: { after: { active } } });
}

export async function deleteEntity(actorId: string, id: string) {
  const [row] = await db.delete(groupEntity).where(eq(groupEntity.id, id)).returning();
  if (row) await audit({ actorId, entity: 'group_entity', entityId: id, action: 'delete', diff: { before: { cnpj: row.cnpj, label: row.label } } });
}

export const listTerms = () => db.select().from(monitoredTerm).orderBy(asc(monitoredTerm.kind), asc(monitoredTerm.term));
export const listEntities = () => db.select().from(groupEntity).orderBy(asc(groupEntity.companyName), asc(groupEntity.cnpj));
