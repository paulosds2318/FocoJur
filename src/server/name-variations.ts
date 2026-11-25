import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { inboxItem, monitoredTerm, nameDecision } from '@/db/schema/inbox';
import { audit } from '@/lib/audit';
import { levenshtein, looksLikeFoco, matchCompanyName, normalizeCompanyName } from '@/lib/company-name';
import { addTerm } from './monitoring';

export type FoundVariation = { name: string; publications: number; processes: number };

/**
 * Grafias do nome da empresa que aparecem nas publicações recebidas e ainda não foram resolvidas: não batem com nenhum
 * termo de nome cadastrado e o admin ainda não decidiu. Podem ser variação legítima ("LOCADORA FOCO") ou homônimo.
 */
export async function foundVariations(): Promise<FoundVariation[]> {
  const known = (await db.select().from(monitoredTerm).where(eq(monitoredTerm.kind, 'name'))).map((t) => t.term);
  const decided = new Set((await db.select().from(nameDecision)).map((d) => d.nameKey));
  const rows = (
    await db.execute<{ nome: string; pubs: number; procs: number }>(sql`
      select upper(x->>'nome') as nome, count(*)::int as pubs, count(distinct i.case_number)::int as procs
      from inbox_item i, jsonb_array_elements(coalesce(i.payload->'destinatarios', '[]'::jsonb)) x
      where i.source = 'djen_term' group by 1`)
  ).rows;
  const byKey = new Map<string, FoundVariation>();
  for (const r of rows) {
    if (!looksLikeFoco(r.nome) || matchCompanyName(r.nome, known) !== 'none') continue;
    const key = normalizeCompanyName(r.nome);
    if (decided.has(key)) continue;
    const cur = byKey.get(key);
    byKey.set(key, { name: cur?.name ?? r.nome, publications: (cur?.publications ?? 0) + r.pubs, processes: (cur?.processes ?? 0) + r.procs });
  }
  return [...byKey.values()].sort((a, b) => b.publications - a.publications);
}

/** CNPJ de conferência para uma variação aprovada: o do termo de nome cadastrado mais parecido com ela. */
async function documentFor(name: string) {
  const names = (await db.select().from(monitoredTerm).where(eq(monitoredTerm.kind, 'name'))).filter((t) => t.document);
  const key = normalizeCompanyName(name);
  names.sort((a, b) => levenshtein(normalizeCompanyName(a.term), key) - levenshtein(normalizeCompanyName(b.term), key));
  return names[0]?.document ?? null;
}

/**
 * Decisão do admin sobre uma grafia: aprovar vira termo de nome (passa a ser buscada e a confirmar a parte);
 * rejeitar marca como homônimo, e os itens ainda abertos que só citam essa grafia são descartados.
 */
export async function decideVariation(actorId: string, nameRaw: string, decision: 'approved' | 'rejected') {
  const name = nameRaw.trim();
  const key = normalizeCompanyName(name);
  if (key.length < 4) return { ok: false as const, error: 'Nome inválido.' };

  let termId: string | undefined;
  if (decision === 'approved') {
    const doc = await documentFor(name);
    if (!doc) return { ok: false as const, error: 'Cadastre antes a empresa (uma loja com CNPJ ou um termo de nome) para esta variação herdar o CNPJ de conferência.' };
    const term = name.replace(/\s*\([^)]*\)\s*/g, ' ').trim() || name; // tira "(FILIAL)", "(AGRAVADO)"
    const r = await addTerm(actorId, { kind: 'name', term, document: doc });
    if (r.ok) termId = r.id;
    else if (r.error !== 'Esse termo já está cadastrado.') return r;
  }

  await db
    .insert(nameDecision)
    .values({ nameKey: key, displayName: name, decision, decidedBy: actorId })
    .onConflictDoUpdate({ target: nameDecision.nameKey, set: { decision, decidedBy: actorId, displayName: name } });
  await audit({ actorId, entity: 'name_decision', entityId: key, action: 'create', diff: { after: { name, decision } } });

  // atualiza os itens da caixa que estavam esperando essa decisão
  const open = await db.select().from(inboxItem).where(inArray(inboxItem.status, ['new', 'in_review', 'possible_duplicate']));
  let affected = 0;
  for (const it of open) {
    const p = (it.parsed ?? {}) as { nameVariation?: string; obtainedBy?: string };
    if (!p.nameVariation || normalizeCompanyName(p.nameVariation) !== key) continue;
    affected++;
    if (decision === 'rejected') {
      await db.update(inboxItem).set({ status: 'discarded', reviewedBy: actorId }).where(eq(inboxItem.id, it.id));
    } else {
      await db
        .update(inboxItem)
        .set({ parsed: { ...p, nameVariation: undefined, obtainedBy: `Publicação do DJEN (variação do nome aprovada: "${p.nameVariation}")` } })
        .where(eq(inboxItem.id, it.id));
    }
  }
  return { ok: true as const, affected, termId };
}

/** Adiciona várias grafias de uma vez (uma por linha), todas com o mesmo CNPJ de conferência. */
export async function addNameVariants(actorId: string, lines: string, document: string) {
  const names = [...new Set(lines.split('\n').map((l) => l.trim()).filter(Boolean))];
  let added = 0;
  const ids: string[] = [];
  const errors: string[] = [];
  for (const n of names) {
    const r = await addTerm(actorId, { kind: 'name', term: n, document });
    if (r.ok) { added++; ids.push(r.id); }
    else if (r.error !== 'Esse termo já está cadastrado.') errors.push(`${n}: ${r.error}`);
  }
  return { added, errors, ids };
}
