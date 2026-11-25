import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { user } from '@/db/schema';
import { cases } from '@/db/schema/case';
import { connectorRun, monitoredTerm, nameDecision } from '@/db/schema/inbox';
import { sendMail } from '@/lib/mail';
import { addInboxItem } from '@/server/inbox';
import { getDjenIntervalHours } from '@/server/settings';
import { autoRegisterEnabled, hasPartDoubt, registerOngoingCase } from '@/server/auto-register';
import { enrichMovementWithAI, ingestMovement } from '@/server/movements';
import { normalizeCaseNumber } from '@/lib/case-number';
import { datajud, expandMovements, movementCutoff } from './datajud';
import { djen } from './djen';
import { domicilio, projuris } from './stubs';
import type { Connector, ConnectorContext } from './types';

export const CONNECTORS = { djen, datajud, domicilio, projuris } as const;
const MAX_FAILURES = 3;

/**
 * Executa um conector: grava `connector_run`, cria itens na caixa de entrada e movimentações (sem duplicar),
 * dispara resumo/prazo por IA nas movimentações novas e avisa os admins após 3 falhas seguidas.
 */
export async function runConnector(c: Connector, opts: { fetchFn?: typeof fetch; now?: Date; enrich?: boolean; termFilter?: (t: { id: string; term: string; kind: string }) => boolean; since?: string; sleep?: (ms: number) => Promise<void> } = {}) {
  const cfg = c.isConfigured();
  if (!cfg.ok) {
    // registra uma vez; repetir a cada 2 h só encheria o histórico
    const [prev] = await db.select({ status: connectorRun.status }).from(connectorRun).where(eq(connectorRun.connector, c.name)).orderBy(desc(connectorRun.startedAt)).limit(1);
    if (prev?.status !== 'not_configured') await db.insert(connectorRun).values({ connector: c.name, status: 'not_configured', finishedAt: new Date(), error: cfg.reason });
    return { status: 'not_configured' as const, reason: cfg.reason };
  }
  const [run] = await db.insert(connectorRun).values({ connector: c.name }).returning({ id: connectorRun.id });
  // Busca parcial (um termo ou período escolhido): não avança o ponto de retomada global, senão a consulta diária
  // pularia dias dos outros termos.
  const partial = !!opts.termFilter || !!opts.since;
  try {
    const [last] = await db.select({ cursor: connectorRun.cursor, finishedAt: connectorRun.finishedAt }).from(connectorRun)
      .where(and(eq(connectorRun.connector, c.name), eq(connectorRun.status, 'ok'), isNotNull(connectorRun.cursor))).orderBy(desc(connectorRun.startedAt)).limit(1);
    const terms = (await db.select().from(monitoredTerm).where(eq(monitoredTerm.active, true))).filter((t) => !opts.termFilter || opts.termFilter(t));
    const monitored = await db.select({ n: cases.number }).from(cases).where(and(eq(cases.monitoring, true), isNull(cases.closedAt), isNull(cases.deletedAt)));
    const ctx: ConnectorContext = {
      terms: terms.map((t) => ({ id: t.id, term: t.term, kind: t.kind, document: t.document })),
      rejectedNames: (await db.select().from(nameDecision).where(eq(nameDecision.decision, 'rejected'))).map((d) => d.displayName),
      monitoredNumbers: opts.termFilter ? [] : monitored.map((m) => m.n), /* busca de UM termo não varre os processos monitorados */ fetchFn: opts.fetchFn ?? fetch, now: opts.now ?? new Date(), explicitSince: opts.since, sleep: opts.sleep,
      lastRunAt: last?.finishedAt ?? null, intervalHours: await getDjenIntervalHours(),
    };
    const { items, nextCursor, errors } = await c.fetchSince(last?.cursor ?? null, ctx);
    const cutoff = movementCutoff(ctx.now); // DataJud: só movimentações recentes (sem inundar a triagem com histórico)

    let created = 0;
    const newMovements: string[] = [];
    const justCreated = new Set<string>(); // processos que o DJEN acabou de cadastrar nesta rodada: suas publicações são histórico, não alerta
    for (const item of items) {
      // 1) processo já cadastrado → movimentação; 2) senão, conectores com `toInbox` geram item na caixa de entrada
      const movs = c.name === 'datajud' ? expandMovements(item, cutoff) : [c.toMovement?.(item, ctx)].filter((m): m is NonNullable<typeof m> => !!m);
      let handled = false;
      for (const m of movs) {
        const r = await ingestMovement(justCreated.has(normalizeCaseNumber(m.caseNumber)) ? { ...m, alreadyRead: { by: null } } : m);
        if (r.linked) handled = true;
        if (r.created && r.linked) { created++; newMovements.push(r.id); }
        else if (r.created) await removeUnlinkedIfInbox(c, r.id, handled);
      }
      if (!handled && c.toInbox) {
        const inbox = c.toInbox(item, ctx);
        if (inbox && c.name === 'djen' && autoRegisterEnabled() && !hasPartDoubt(inbox)) {
          // tudo que o DJEN traz já é processo em andamento: entra direto em Processos; só as atualizações seguintes viram alerta (dúvida de parte vai à Triagem)
          const r = await registerOngoingCase(inbox);
          if (r.createdCase) { created++; justCreated.add(normalizeCaseNumber(inbox.caseNumber)); }
        } else if (inbox) {
          const r = await addInboxItem(inbox);
          if (r.ok && !r.skipped) created++;
        }
      }
    }
    if (opts.enrich !== false) for (const id of newMovements) await enrichMovementWithAI(id).catch(() => undefined);
    // lote que falhou não perde o que deu certo: a execução fica "parcial" e o motivo é registrado
    const warnings = errors ?? [];
    await db.update(connectorRun).set({
      status: warnings.length ? 'partial' : 'ok', finishedAt: new Date(), cursor: partial ? null : nextCursor, itemsFound: items.length, itemsNew: created,
      error: warnings.length ? warnings.join('; ').slice(0, 1000) : null,
    }).where(eq(connectorRun.id, run.id));
    return { status: 'ok' as const, found: items.length, created, warnings };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(connectorRun).set({ status: 'error', finishedAt: new Date(), error: msg.slice(0, 1000) }).where(eq(connectorRun.id, run.id));
    await alertIfRepeatedFailures(c.name, msg);
    return { status: 'error' as const, error: msg };
  }
}

/** Publicação que não pertence a processo cadastrado não fica solta em `movement`: vira item da caixa (se o conector suportar). */
async function removeUnlinkedIfInbox(c: Connector, movementId: string, handled: boolean) {
  if (!c.toInbox || handled) return;
  const { movement } = await import('@/db/schema/movement');
  await db.delete(movement).where(eq(movement.id, movementId));
}

async function alertIfRepeatedFailures(name: string, error: string) {
  const recent = await db.select({ status: connectorRun.status }).from(connectorRun).where(eq(connectorRun.connector, name)).orderBy(desc(connectorRun.startedAt)).limit(MAX_FAILURES);
  if (recent.length === MAX_FAILURES && recent.every((r) => r.status === 'error')) {
    const admins = await db.select({ email: user.email }).from(user).where(eq(user.role, 'admin'));
    if (admins.length) {
      await sendMail(admins.map((a) => a.email), `FocoJur: o conector ${name} falhou ${MAX_FAILURES} vezes seguidas`, `<p>Último erro: ${error.slice(0, 300).replace(/</g, '&lt;')}</p>`);
    }
  }
}
