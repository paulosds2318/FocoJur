import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { inboxItem } from '@/db/schema/inbox';
import { markAccepted, runAiTask } from '@/lib/ai';
import { audit } from '@/lib/audit';
import { optionLines } from '@/lib/ai/options';
import { extractContractCodes } from '@/lib/case-number';
import { getInboxItem, type Parsed } from './inbox';
import { getLookups } from './lookups';

/** Sugestões da IA gravadas no item da caixa (em `parsed.ai`); só viram campo do processo quando a advogada aceita. */
export type AiSuggestions = {
  portfolio: 'civil' | 'labor' | 'procon' | null;
  subject: string | null; // rótulo da lista oficial
  claim: string | null;
  prognosis: 'probable' | 'possible' | 'remote' | null;
  rationale: string;
  contracts: string[];
  classificationCallId?: string;
  contractCallId?: string;
  decision?: 'accepted' | 'rejected';
};

export type ParsedWithAi = Parsed & { ai?: AiSuggestions };

const sourceText = (p: ParsedWithAi) => [p.details, p.plaintiff && `Demandante: ${p.plaintiff}`, p.court && `Vara: ${p.court}`, p.subject && `Objeto informado: ${p.subject}`].filter(Boolean).join('\n');

type Opt = { code: string; label: string; description?: string | null };

/** Prompt da classificação: opções das listas oficiais com a descrição de cada uma (quando houver) + texto do processo. */
export function buildClassificationPrompt(lk: { subject: Opt[]; claim: Opt[] }, text: string) {
  return `Listas oficiais. Escolha SOMENTE entre os códigos listados (use null quando nenhuma opção servir). Leia a descrição de cada opção: ela diz quando usá-la.\nObjeto:\n${optionLines(lk.subject)}\nPedido:\n${optionLines(lk.claim)}\n\nTexto do processo:\n${text}`;
}

/**
 * RF-13: sugere objeto, pedido, prognóstico (classificação) e contrato (extração) a partir do texto do item.
 * O contrato passa pelo regex da regra 7 depois da IA. A IA usa só os códigos das listas oficiais.
 */
export async function suggestForItem(actorId: string, itemId: string, fetchFn?: typeof fetch) {
  const item = await getInboxItem(itemId);
  if (!item) return { ok: false as const, error: 'Item não encontrado.' };
  const p = (item.parsed ?? {}) as ParsedWithAi;
  const text = sourceText(p).trim();
  if (text.length < 20) return { ok: false as const, error: 'Sem texto suficiente neste item (detalhamento vazio). Preencha ou espere o robô trazer os dados da capa.' };

  const lk = await getLookups(['subject', 'claim']);
  const prompt = buildClassificationPrompt(lk, text);

  const [cls, con] = await Promise.all([
    runAiTask('intake_classification', prompt, { userId: actorId, fetchFn }),
    runAiTask('contract_extraction', text, { userId: actorId, fetchFn }),
  ]);
  if (!cls.ok && !con.ok) return { ok: false as const, error: cls.error };

  const byCode = (rows: { code: string; label: string }[], code: string | null) => rows.find((r) => r.code === code)?.label ?? null;
  // regra 7: o regex confirma o formato; códigos fora do padrão são descartados
  const fromAi = con.ok ? con.output.contractCodes.map((c) => c.toUpperCase().trim()) : [];
  const contracts = [...new Set([...extractContractCodes(fromAi.join(' ')), ...extractContractCodes(text.toUpperCase())])];

  const ai: AiSuggestions = {
    portfolio: cls.ok ? cls.output.portfolio : null,
    subject: cls.ok ? byCode(lk.subject, cls.output.subjectCode) : null,
    claim: cls.ok ? byCode(lk.claim, cls.output.claimCode) : null,
    prognosis: cls.ok ? cls.output.prognosis : null,
    rationale: cls.ok ? cls.output.rationale : '',
    contracts,
    classificationCallId: cls.ok ? cls.aiCallId : undefined,
    contractCallId: con.ok ? con.aiCallId : undefined,
  };
  await db.update(inboxItem).set({ parsed: { ...p, ai }, status: item.status === 'new' ? 'in_review' : item.status }).where(eq(inboxItem.id, itemId));
  return { ok: true as const };
}

/**
 * "Aceitar sugestões" preenche os campos do painel; recusar descarta. Em ambos os casos a decisão é auditada
 * e alimenta a taxa de aceite por modelo (`ai_call.accepted`).
 */
export async function decideSuggestions(actorId: string, itemId: string, accept: boolean) {
  const item = await getInboxItem(itemId);
  const p = (item?.parsed ?? {}) as ParsedWithAi;
  if (!item || !p.ai || p.ai.decision) return { ok: false as const, error: 'Não há sugestão pendente neste item.' };
  const ai = p.ai;
  const next: ParsedWithAi = accept
    ? {
        ...p,
        portfolio: ai.portfolio ?? p.portfolio,
        subject: ai.subject ?? p.subject,
        claim: ai.claim ?? p.claim,
        prognosis: ai.prognosis ?? p.prognosis,
        contracts: ai.contracts.length ? ai.contracts : p.contracts,
        ai: { ...ai, decision: 'accepted' },
      }
    : { ...p, ai: { ...ai, decision: 'rejected' } };
  await db.update(inboxItem).set({ parsed: next }).where(eq(inboxItem.id, itemId));
  for (const id of [ai.classificationCallId, ai.contractCallId]) if (id) await markAccepted(id, accept);
  await audit({ actorId, entity: 'inbox_item', entityId: itemId, action: accept ? 'ai_accept' : 'ai_reject', diff: { suggestions: { portfolio: ai.portfolio, subject: ai.subject, claim: ai.claim, prognosis: ai.prognosis, contracts: ai.contracts } } });
  return { ok: true as const };
}
