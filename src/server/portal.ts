import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { inboxItem, portalFetch } from '@/db/schema/inbox';
import { runAiTask } from '@/lib/ai';
import { normalizeCaseNumber } from '@/lib/case-number';
import { audit } from '@/lib/audit';
import { lookupCaseCover, type CaseCover } from '@/lib/connectors/datajud';
import { adapterFor, htmlToText, type PortalAdapter, type PortalPage } from '@/lib/portals';
import type { Parsed } from './inbox';

type Trigger = 'inbox' | 'manual' | 'scheduled';

const FIELD_LABEL: Record<keyof Omit<CaseCover, 'grau'>, string> = {
  court: 'vara/órgão julgador', classe: 'classe', subject: 'assunto (objeto sugerido)', distributedAt: 'data de ajuizamento', system: 'sistema',
};

/**
 * RF-16/17: "Buscar no portal".
 * 1) Com adaptador de portal liberado para o tribunal, enfileira o robô (fluxo original).
 * 2) Sem adaptador (o normal hoje: adaptadores de portal só entram depois da avaliação dos termos de uso pelo Jurídico),
 *    faz UMA consulta curta à API pública oficial do CNJ (DataJud) e completa os dados de capa do item da caixa,
 *    só onde estiverem vazios. Nunca insiste contra 429 e nunca inventa dado.
 */
export async function enqueuePortalFetch(
  caseNumber: string, trigger: Trigger,
  opts: { adapters?: PortalAdapter[]; enabled?: Set<string>; fetchFn?: typeof fetch; sleep?: (ms: number) => Promise<void>; actorId?: string | null } = {},
) {
  const n = normalizeCaseNumber(caseNumber);
  const adapter = adapterFor(n, opts.enabled, opts.adapters);
  if (!adapter) return fetchFromDataJud(n, trigger, opts);

  const [row] = await db.insert(portalFetch).values({ caseNumber: n, portal: adapter.portal, trigger, status: 'queued' }).returning();
  if (!opts.adapters) {
    const { startBoss } = await import('@/lib/jobs');
    const boss = await startBoss();
    try { await boss.send('portal-fetch', { fetchId: row.id }); } finally { await boss.stop({ graceful: false }); }
  }
  return { id: row.id, ok: true, queued: true, message: 'Busca enfileirada. O resultado aparece em instantes.', filled: [] as string[], source: adapter.portal };
}

async function fetchFromDataJud(n: string, trigger: Trigger, opts: { fetchFn?: typeof fetch; sleep?: (ms: number) => Promise<void>; actorId?: string | null }) {
  const [row] = await db.insert(portalFetch).values({ caseNumber: n, portal: 'datajud', trigger, status: 'running', startedAt: new Date() }).returning();
  const r = await lookupCaseCover(n, { fetchFn: opts.fetchFn, sleep: opts.sleep });
  if (!r.ok) {
    await db.update(portalFetch).set({ status: 'error', finishedAt: new Date(), error: r.message }).where(eq(portalFetch.id, row.id));
    return { id: row.id, ok: false, queued: false, message: r.message, filled: [] as string[], source: 'datajud' };
  }
  const available = Object.keys(r.cover).filter((k) => k !== 'grau').length;
  const applied = await applyCoverToInbox(n, r.cover, opts.actorId ?? null);
  const filled = applied.filled.map((k) => FIELD_LABEL[k]);
  await db.update(portalFetch).set({
    status: available >= 3 ? 'ok' : 'partial', finishedAt: new Date(), extracted: r.cover, fieldsFilled: filled.length, navigation: 'script',
    error: applied.itemFound ? null : 'Não há item aberto na caixa de entrada para este número.',
  }).where(eq(portalFetch.id, row.id));
  const message = !applied.itemFound
    ? 'O DataJud tem dados deste processo, mas não há item aberto na caixa de entrada para completar.'
    : filled.length
      ? `Dados públicos do DataJud aplicados: ${filled.join(', ')}. Confira antes de confirmar.`
      : 'O DataJud respondeu, mas os campos de capa já estavam preenchidos; nada foi alterado.';
  return { id: row.id, ok: true, queued: false, message, filled, source: 'datajud' };
}

/** Completa a capa do item aberto da caixa só onde estiver vazia (o que a advogada digitou nunca é sobrescrito). */
async function applyCoverToInbox(caseNumber: string, c: CaseCover, actorId: string | null) {
  const [item] = await db.select().from(inboxItem)
    .where(and(eq(inboxItem.caseNumber, caseNumber), inArray(inboxItem.status, ['new', 'in_review', 'possible_duplicate'])))
    .orderBy(desc(inboxItem.capturedAt)).limit(1);
  if (!item) return { itemFound: false, filled: [] as (keyof Omit<CaseCover, 'grau'>)[] };
  const cur = (item.parsed ?? {}) as Parsed;
  const next: Parsed = { ...cur };
  const filled: (keyof Omit<CaseCover, 'grau'>)[] = [];
  if (!cur.court && c.court) { next.court = c.court; filled.push('court'); }
  if (!cur.subject && c.subject) { next.subject = c.subject; filled.push('subject'); }
  if (!cur.distributedAt && c.distributedAt) { next.distributedAt = c.distributedAt; filled.push('distributedAt'); }
  if (!cur.system && c.system) { next.system = c.system; filled.push('system'); }
  if (!cur.details && c.classe) { next.details = `Classe: ${c.classe}${c.grau ? ` (${c.grau})` : ''}`; filled.push('classe'); }
  if (filled.length) {
    next.obtainedBy = `Dados de capa obtidos do DataJud (API pública do CNJ) em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
    await db.update(inboxItem).set({ parsed: next, status: item.status === 'new' ? 'in_review' : item.status }).where(eq(inboxItem.id, item.id));
    await audit({ actorId, entity: 'inbox_item', entityId: item.id, action: 'update', diff: { source: 'datajud', filled, after: Object.fromEntries(filled.map((k) => [k, c[k]])) } });
  }
  return { itemFound: true, filled };
}

export type ProcessDeps = {
  adapter: PortalAdapter; page: PortalPage; saveFile?: (key: string, data: Buffer | string) => Promise<void>; fetchFn?: typeof fetch;
};

/**
 * Pipeline do robô para um `portal_fetch`: o adaptador navega (roteiro), a página é salva para auditoria,
 * a IA extrai os dados (`portal_extraction`, nulo quando não achar) e o resultado é proposto — nunca sobrescreve o que a advogada digitou.
 */
export async function processPortalFetch(fetchId: string, deps: ProcessDeps) {
  const [f] = await db.select().from(portalFetch).where(eq(portalFetch.id, fetchId));
  if (!f) return { status: 'error' as const };
  const finish = async (status: (typeof portalFetch.$inferSelect)['status'], extra: Partial<typeof portalFetch.$inferInsert> = {}) => {
    await db.update(portalFetch).set({ status, finishedAt: new Date(), ...extra }).where(eq(portalFetch.id, fetchId));
    return { status };
  };
  await db.update(portalFetch).set({ status: 'running', startedAt: new Date() }).where(eq(portalFetch.id, fetchId));

  try {
    const opened = await deps.adapter.open(deps.page, f.caseNumber);
    if (opened === 'captcha') return finish('blocked_captcha', { error: 'Captcha no portal: preenchimento manual (o robô não contorna captcha).' });
    if (opened === 'not_public') return finish('not_public', { error: 'Processo em segredo de justiça ou não público.' });
    if (opened === 'not_found') return finish('error', { error: 'Processo não encontrado no portal.' });

    const htmlKey = `portal/${fetchId}.html`;
    const shotKey = `portal/${fetchId}.png`;
    if (deps.saveFile) {
      await deps.saveFile(htmlKey, await deps.page.content());
      await deps.saveFile(shotKey, await deps.page.screenshot());
    }
    const text = (await deps.adapter.pageText(deps.page)) || htmlToText(await deps.page.content());
    const ai = await runAiTask('portal_extraction', text.slice(0, 30_000), { fetchFn: deps.fetchFn });
    if (!ai.ok) return finish('error', { htmlKey, screenshotKey: shotKey, error: ai.error });

    const out = ai.output;
    const filled = [out.number, out.court, out.system, out.plaintiffLawyer, out.claimValue, out.distributedAt, out.subject].filter((v) => v !== null && v !== undefined).length
      + (out.plaintiffs.length ? 1 : 0) + (out.defendants.length ? 1 : 0);
    await applyToInbox(f.caseNumber, out, deps.adapter.portal);
    return finish(filled >= 6 ? 'ok' : 'partial', { htmlKey, screenshotKey: shotKey, extracted: out, aiCallId: ai.aiCallId, fieldsFilled: filled, navigation: 'script' });
  } catch (e) {
    return finish('layout_changed', { error: `${e instanceof Error ? e.message : e}`.slice(0, 500) });
  }
}

/** Completa os dados de capa do item da caixa apenas onde estão vazios (o que já foi digitado nunca é sobrescrito). */
async function applyToInbox(caseNumber: string, out: { court: string | null; system: string | null; plaintiffs: string[]; claimValue: number | null; subject: string | null; distributedAt: string | null }, portal: string) {
  const [item] = await db.select().from(inboxItem).where(and(eq(inboxItem.caseNumber, caseNumber), eq(inboxItem.status, 'new'))).orderBy(desc(inboxItem.capturedAt)).limit(1);
  if (!item) return;
  const cur = (item.parsed ?? {}) as Parsed;
  const next: Parsed = {
    ...cur,
    court: cur.court ?? out.court ?? undefined, system: cur.system ?? out.system ?? undefined, plaintiff: cur.plaintiff ?? out.plaintiffs[0],
    claimValue: cur.claimValue ?? out.claimValue ?? undefined, subject: cur.subject ?? out.subject ?? undefined,
    distributedAt: cur.distributedAt ?? out.distributedAt ?? undefined,
    obtainedBy: `Dados de capa obtidos pelo robô no portal (${portal}) em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
  };
  await db.update(inboxItem).set({ parsed: next, status: 'in_review' }).where(eq(inboxItem.id, item.id));
}

export async function lastPortalFetch(caseNumber: string) {
  const [r] = await db.select().from(portalFetch).where(eq(portalFetch.caseNumber, normalizeCaseNumber(caseNumber))).orderBy(desc(portalFetch.createdAt)).limit(1);
  return r ?? null;
}
