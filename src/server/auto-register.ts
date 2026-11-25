import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { caseCivil, caseLabor, caseParty, caseProcon, cases } from '@/db/schema/case';
import { audit } from '@/lib/audit';
import { normalizeCaseNumber } from '@/lib/case-number';
import type { InboxItemInput } from '@/lib/connectors/types';
import { linkOpenInboxItems, type Publication } from './inbox';
import { ingestMovement } from './movements';

/**
 * Tudo que o DJEN traz já é processo em andamento: entra direto em Processos (cadastro mínimo, a completar) com o monitoramento
 * ligado. As publicações que trouxeram o processo ficam no histórico dele, já lidas; só as atualizações seguintes viram alerta.
 * Exceção: quando o nome da parte difere do cadastrado (possível homônimo, "Conferir parte"), o item NÃO vira processo sozinho: vai
 * à Triagem para uma advogada confirmar que é da Foco ou descartar (`hasPartDoubt`).
 * Desligue com DJEN_AUTO_REGISTER=false para mandar tudo o que vem do DJEN à Triagem.
 */
export const autoRegisterEnabled = () => (process.env.DJEN_AUTO_REGISTER ?? 'true') !== 'false';

/** O conector marcou dúvida sobre a parte (nome diferente do cadastrado): decisão humana na Triagem, antes de virar processo. */
export const hasPartDoubt = (input: InboxItemInput) => ((input.parsed ?? {}) as { obtainedBy?: string }).obtainedBy?.startsWith('Conferir parte') === true;

export async function registerOngoingCase(input: InboxItemInput, actorId: string | null = null) {
  const number = normalizeCaseNumber(input.caseNumber);
  const parsed = (input.parsed ?? {}) as { portfolio?: 'civil' | 'labor' | 'procon'; state?: string; court?: string; plaintiff?: string; obtainedBy?: string };
  const portfolio = parsed.portfolio ?? 'civil';
  // só chega aqui com dúvida de parte quando a conversão é feita de propósito (ex.: depois de confirmada na Triagem); fica o aviso na ficha
  const doubt = parsed.obtainedBy?.startsWith('Conferir parte') ? parsed.obtainedBy : null;

  let [c] = await db.select({ id: cases.id }).from(cases).where(and(eq(cases.number, number), eq(cases.portfolio, portfolio), isNull(cases.deletedAt))).limit(1);
  let createdCase = false;
  if (!c) {
    c = await db.transaction(async (tx) => {
      const [row] = await tx.insert(cases).values({
        number, portfolio, state: parsed.state?.toUpperCase() || null, court: parsed.court || null, details: doubt, source: 'djen_term', monitoring: true,
      }).returning({ id: cases.id });
      if (portfolio === 'civil') await tx.insert(caseCivil).values({ caseId: row.id });
      else if (portfolio === 'labor') await tx.insert(caseLabor).values({ caseId: row.id });
      else await tx.insert(caseProcon).values({ caseId: row.id });
      if (parsed.plaintiff) await tx.insert(caseParty).values({ caseId: row.id, role: 'plaintiff', name: parsed.plaintiff });
      return row;
    });
    createdCase = true;
    await audit({ actorId, entity: 'case', entityId: c.id, action: 'create', diff: { after: { number, portfolio, source: 'djen_term', automatico: true, conferirParte: !!doubt } } });
  }

  // as publicações que trouxeram o processo entram como histórico lido (não são "atualização"); a deduplicação por id evita repetir
  const pubs = ((input.payload ?? {}) as { publications?: Publication[] }).publications ?? [];
  for (const p of pubs) {
    await ingestMovement({
      source: 'djen', externalId: `djen:${p.id}`, caseNumber: number, occurredAt: p.data ? new Date(p.data) : new Date(), title: p.tipo, rawText: p.texto,
      alreadyRead: { by: actorId },
    });
  }
  await linkOpenInboxItems(c.id, number, actorId); // item que esperava na Triagem com o mesmo número passa a ser deste processo
  return { caseId: c.id, createdCase };
}
