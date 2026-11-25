import 'dotenv/config';
import { eq, inArray, like, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// estes testes cobrem a Triagem: o que vem do DJEN vai para ela (o cadastro direto em Processos é testado em djen-processo-direto.test.ts)
process.env.DJEN_AUTO_REGISTER = 'false';

/**
 * Integração com o Postgres local (`docker compose up -d` + `pnpm db:migrate && pnpm db:seed`).
 * Usa números de processo com prefixo 9998 e remove tudo no fim. A IA e o DJEN são simulados via fetch.
 */
const PREFIX = '9998';
const num = (n: number) => `${PREFIX}${String(n).padStart(3, '0')}1120268210001`;
const fmt = (n: number) => { const d = num(n); return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`; };

let db: typeof import('@/db').db;
let pool: typeof import('@/db').pool;
let adminId: string;
let termId: string;

const aiReply = (content: object) =>
  new Response(JSON.stringify({ id: 'gen-t', model: 'm/x', choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.001 } }));

beforeAll(async () => {
  ({ db, pool } = await import('@/db'));
  await cleanup(); // sobras de execução anterior que falhou
  const { user } = await import('@/db/schema');
  const [admin] = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);
  adminId = admin.id;
  const { monitoredTerm } = await import('@/db/schema/inbox');
  const [t] = await db.insert(monitoredTerm).values({ term: 'FOCO TESTE', kind: 'name', document: '12.345.678/0001-90' }).returning({ id: monitoredTerm.id });
  termId = t.id;
  const { aiTaskConfig } = await import('@/db/schema/ai');
  for (const task of ['movement_summary', 'deadline_suggestion', 'intake_classification', 'contract_extraction'] as const) {
    await db.insert(aiTaskConfig).values({ task, primaryModel: 'm/x' }).onConflictDoUpdate({ target: aiTaskConfig.task, set: { primaryModel: 'm/x' } });
  }
  process.env.OPENROUTER_API_KEY = 'teste';
});

async function cleanup() {
  const { cases, caseCivil, caseRisk, caseParty, caseProcon, caseLabor, rentalLink } = await import('@/db/schema/case');
  const { movement, deadlineSuggestion } = await import('@/db/schema/movement');
  const { inboxItem, monitoredTerm, connectorRun } = await import('@/db/schema/inbox');
  const { task } = await import('@/db/schema/task');
  const { aiCall, aiTaskConfig } = await import('@/db/schema/ai');
  await db.delete(aiTaskConfig).where(eq(aiTaskConfig.primaryModel, 'm/x')); // modelo fictício do teste
  const ids = (await db.select({ id: cases.id }).from(cases).where(like(cases.number, `${PREFIX}%`))).map((c) => c.id);
  const movs = ids.length ? (await db.select({ id: movement.id }).from(movement).where(or(inArray(movement.caseId, ids), like(movement.externalId, 'djen:t-%')))).map((m) => m.id) : [];
  if (movs.length) {
    await db.delete(task).where(inArray(task.movementId, movs));
    await db.delete(deadlineSuggestion).where(inArray(deadlineSuggestion.movementId, movs));
    await db.delete(movement).where(inArray(movement.id, movs));
  }
  await db.delete(movement).where(like(movement.externalId, 'djen:t-%'));
  if (ids.length) {
    await db.delete(task).where(inArray(task.caseId, ids));
    await db.delete(caseRisk).where(inArray(caseRisk.caseId, ids));
    await db.delete(caseParty).where(inArray(caseParty.caseId, ids));
    await db.delete(caseCivil).where(inArray(caseCivil.caseId, ids));
    await db.delete(caseProcon).where(inArray(caseProcon.caseId, ids));
    await db.delete(caseLabor).where(inArray(caseLabor.caseId, ids));
    await db.delete(rentalLink).where(inArray(rentalLink.caseId, ids));
  }
  await db.delete(inboxItem).where(like(inboxItem.caseNumber, `${PREFIX}%`));
  if (ids.length) await db.delete(aiCall).where(inArray(aiCall.caseId, ids));
  if (ids.length) await db.delete(cases).where(inArray(cases.id, ids));
  await db.delete(monitoredTerm).where(like(monitoredTerm.term, 'FOCO TESTE%'));
  await db.delete(connectorRun).where(like(connectorRun.error, '%teste-integracao%'));
  await db.delete(aiCall).where(eq(aiCall.generationId, 'gen-t'));
}

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe('captura e monitoramento', () => {
  it('DJEN: processo cadastrado vira movimentação; desconhecido vai à caixa com conferência de homônimo; reexecução não duplica', async () => {
    const { createCase, caseFormSchema } = await import('@/server/cases');
    const parsed = caseFormSchema.parse({
      number: fmt(1), portfolio: 'procon', systemId: '', courtTypeId: '', state: 'RS', city: '', court: '', ownerId: '', receivedAt: '', citedAt: '',
      costCenter: '', details: '', plaintiff: 'Autor Teste', subjectId: '', claimId: '', prognosis: '', riskTotal: '', riskMaterial: '', riskMoral: '', claimValue: '', contractCode: '',
    });
    const c = await createCase(adminId, parsed);
    expect(c.ok).toBe(true);

    const { runConnector } = await import('@/lib/connectors/runner');
    const { djen } = await import('@/lib/connectors/djen');
    const items = [
      { id: 't-1', numero_processo: fmt(1), texto: 'Intimação do réu FOCO TESTE para contestar em 15 dias', data_disponibilizacao: '2026-11-13', tipoComunicacao: 'Citação' },
      { id: 't-2', numero_processo: fmt(2), texto: 'Cite-se FOCO TESTE', data_disponibilizacao: '2026-11-13', siglaTribunal: 'TJRS', nomeOrgao: '3º Juizado' },
    ];
    const fetchFn = (async () => new Response(JSON.stringify({ items }))) as unknown as typeof fetch;
    const r1 = await runConnector(djen, { fetchFn, enrich: false, termFilter: (t) => t.term === 'FOCO TESTE' });
    expect(r1.status).toBe('ok');

    const { movement } = await import('@/db/schema/movement');
    const { inboxItem } = await import('@/db/schema/inbox');
    const movs = await db.select().from(movement).where(like(movement.externalId, 'djen:t-%'));
    expect(movs).toHaveLength(1);
    expect(movs[0].caseId).toBe(c.ok ? c.id : null);
    expect(movs[0].matchedTermId).toBe(termId);
    const box = await db.select().from(inboxItem).where(eq(inboxItem.caseNumber, num(2)));
    expect(box).toHaveLength(1);
    expect(box[0].source).toBe('djen_term');
    expect((box[0].parsed as { obtainedBy: string }).obtainedBy).toMatch(/Conferir parte/); // homônimo: documento ausente

    await runConnector(djen, { fetchFn, enrich: false, termFilter: (t) => t.term === 'FOCO TESTE' });
    expect(await db.select().from(movement).where(like(movement.externalId, 'djen:t-%'))).toHaveLength(1);
    expect(await db.select().from(inboxItem).where(eq(inboxItem.caseNumber, num(2)))).toHaveLength(1);
  });

  it('IA sugere; o sistema calcula a data; só vira tarefa com a decisão da advogada', async () => {
    const { movement } = await import('@/db/schema/movement');
    const { deadlineSuggestion } = await import('@/db/schema/movement');
    const { task } = await import('@/db/schema/task');
    const { enrichMovementWithAI, decideSuggestion } = await import('@/server/movements');
    const [m] = await db.select().from(movement).where(eq(movement.externalId, 'djen:t-1'));

    let n = 0;
    const fetchFn = (async () =>
      ++n === 1
        ? aiReply({ summary: 'Intimação para contestar.' })
        : aiReply({ hasDeadline: true, actType: 'Contestação', days: 15, dayCount: 'business', startDate: '2026-11-13', dueDate: '2026-12-01', legalBasis: 'CPC, art. 335', confidence: 0.94 })) as unknown as typeof fetch;
    const r = await enrichMovementWithAI(m.id, fetchFn);
    expect(r.ok).toBe(true);

    const [after] = await db.select().from(movement).where(eq(movement.id, m.id));
    expect(after.aiSummary).toBe('Intimação para contestar.');
    const [s] = await db.select().from(deadlineSuggestion).where(eq(deadlineSuggestion.movementId, m.id));
    expect(s.dueDate).toBe('2026-12-07'); // 15 dias úteis de 13/11/2026 com o feriado de 20/11 (e não o 01/12 que a IA chutou)
    expect(s.decision).toBeNull();
    expect(await db.select().from(task).where(eq(task.movementId, m.id))).toHaveLength(0); // nada de tarefa sem clique

    const d = await decideSuggestion(adminId, s.id, 'accepted');
    expect(d.ok).toBe(true);
    const [t] = await db.select().from(task).where(eq(task.movementId, m.id));
    expect(t.dueDate).toBe('2026-12-07');
    expect(t.origin).toBe('ai_suggestion');
    const [decided] = await db.select().from(deadlineSuggestion).where(eq(deadlineSuggestion.id, s.id));
    expect(decided.decision).toBe('accepted');
    expect((await decideSuggestion(adminId, s.id, 'accepted')).ok).toBe(false); // não decide duas vezes
  });

  it('caixa de entrada: duplicado pelo número, confirmação cria o processo e a importação em lote relata linhas', async () => {
    const { addInboxItem, confirmInboxItem, importProjurisFile } = await import('@/server/inbox');
    const dup = await addInboxItem({ source: 'manual', caseNumber: fmt(1) }); // já cadastrado
    expect(dup.ok && dup.duplicate).toBe(true);

    const fresh = await addInboxItem({ source: 'manual', caseNumber: fmt(3) });
    expect(fresh.ok && !fresh.duplicate).toBe(true);
    const confirmed = await confirmInboxItem(adminId, (fresh as { id: string }).id, {
      portfolio: 'procon', systemId: '', courtTypeId: '', state: 'PE', city: '', court: '', ownerId: '', receivedAt: '', citedAt: '', costCenter: '', details: '',
      plaintiff: 'Fulano', subjectId: '', claimId: '', prognosis: '', riskTotal: '', riskMaterial: '', riskMoral: '', claimValue: '', contractCode: '',
    });
    expect(confirmed.ok).toBe(true);
    expect((await confirmInboxItem(adminId, (fresh as { id: string }).id, {})).ok).toBe(false); // já tratado

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Projuris');
    ws.addRow(['Número do Processo', 'Demandante', 'UF']);
    ws.addRow([fmt(4), 'Beltrano', 'BA']);
    ws.addRow([fmt(1), 'Já existe', 'RS']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const imp = await importProjurisFile(adminId, 'projuris.xlsx', buf);
    expect(imp).toMatchObject({ ok: true, total: 2, novo: 1, duplicado: 1, erro: 0 });
    expect((await importProjurisFile(adminId, 'x.xlsx', Buffer.from('lixo'))).ok).toBe(false);
  });

  it('RF-13: a IA sugere objeto/prognóstico/contrato e nada muda até a advogada aceitar', async () => {
    const { addInboxItem, getInboxItem } = await import('@/server/inbox');
    const { suggestForItem, decideSuggestions } = await import('@/server/inbox-ai');
    const added = await addInboxItem({
      source: 'djen_term', caseNumber: fmt(5), externalId: 'djen:t-rf13',
      parsed: { plaintiff: 'Renata Teste', details: 'Autora alega que, após devolver o veículo do contrato POA004871-26, não recebeu o estorno da caução.' },
    });
    const id = (added as { id: string }).id;

    const { lookup } = await import('@/db/schema/lookups');
    const [subject] = await db.select().from(lookup).where(eq(lookup.label, 'Ausência de baixa na caução'));
    const fetchFn = (async (_u: string, init: RequestInit) => {
      const sys = String(JSON.parse(String(init.body)).messages[0].content);
      return sys.includes('classifica')
        ? aiReply({ portfolio: 'civil', subjectCode: subject.code, claimCode: null, prognosis: 'possible', rationale: 'Caução não estornada.' })
        : aiReply({ contractCodes: ['POA004871-26', 'xx-invalido'] });
    }) as unknown as typeof fetch;

    expect((await suggestForItem(adminId, id, fetchFn)).ok).toBe(true);
    const item = await getInboxItem(id);
    const p = item!.parsed as { subject?: string; prognosis?: string; ai: { subject: string; prognosis: string; contracts: string[] } };
    expect(p.subject).toBeUndefined(); // sugestão ainda não aplicada
    expect(p.ai).toMatchObject({ subject: 'Ausência de baixa na caução', prognosis: 'possible', contracts: ['POA004871-26'] }); // regex descarta o inválido

    expect((await decideSuggestions(adminId, id, true)).ok).toBe(true);
    const after = (await getInboxItem(id))!.parsed as { subject?: string; prognosis?: string; contracts?: string[] };
    expect(after).toMatchObject({ subject: 'Ausência de baixa na caução', prognosis: 'possible', contracts: ['POA004871-26'] });
    expect((await decideSuggestions(adminId, id, false)).ok).toBe(false); // já decidida

    const { aiCall } = await import('@/db/schema/ai');
    const calls = await db.select().from(aiCall).where(eq(aiCall.generationId, 'gen-t'));
    expect(calls.filter((c) => c.task === 'intake_classification' && c.accepted === true).length).toBeGreaterThan(0); // alimenta a taxa de aceite
  });

  it('RF-84: compara dois modelos contra a decisão das advogadas sem gravar nada', async () => {
    const { compareModels } = await import('@/server/ai-compare');
    const { aiCall } = await import('@/db/schema/ai');
    const before = (await db.select().from(aiCall)).length;
    const reply = (days: number) => aiReply({ hasDeadline: true, actType: 'Contestação', days, dayCount: 'business', startDate: '2026-11-13', legalBasis: null, confidence: 0.9 });
    const fetchFn = (async (_u: string, init: RequestInit) => (JSON.parse(String(init.body)).model === 'bom/modelo' ? reply(15) : reply(10))) as unknown as typeof fetch;
    const r = await compareModels('bom/modelo', 'ruim/modelo', 20, fetchFn);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.samples).toBeGreaterThan(0);
    expect(r.a.accuracy).toBe(1); // 15 dias úteis de 13/11 com o feriado = a data que a advogada aceitou
    expect(r.b.accuracy).toBe(0);
    expect(r.a.avgCostUsd).toBeCloseTo(0.001, 6);
    expect((await db.select().from(aiCall)).length).toBe(before); // só mede: nada em ai_call
    expect((await compareModels('x', 'x', 20)).ok).toBe(false); // modelos iguais
  });

  it('várias publicações do mesmo processo ficam num item e viram histórico do processo (sem alerta) ao confirmar', async () => {
    const { addInboxItem, getInboxItem, confirmInboxItem } = await import('@/server/inbox');
    const { movement } = await import('@/db/schema/movement');
    const { djen } = await import('@/lib/connectors/djen');
    const raw = (id: string, data: string) => ({ id, numero_processo: fmt(6), texto: `Publicação ${id}`, tipoComunicacao: 'Citação', data_disponibilizacao: data, _termKind: 'oab', _term: '34790/PE' });
    const a = djen.toInbox!(raw('t-g1', '2026-11-10'), {} as never)!;
    const b = djen.toInbox!(raw('t-g2', '2026-11-12'), {} as never)!;
    const r1 = await addInboxItem(a);
    const r2 = await addInboxItem(b);
    expect(r1.ok && r2.ok && (r2 as { skipped: boolean }).skipped).toBe(true); // a segunda entrou no mesmo item
    expect((r2 as { id: string }).id).toBe((r1 as { id: string }).id);
    await addInboxItem(b); // reenvio da mesma publicação não duplica
    const item = await getInboxItem((r1 as { id: string }).id);
    expect((item!.payload as { publications: unknown[] }).publications).toHaveLength(2);

    const ok = await confirmInboxItem(adminId, item!.id, {
      portfolio: 'procon', state: 'RS', plaintiff: 'Fulano Grupo', systemId: '', courtTypeId: '', city: '', court: '', ownerId: '', receivedAt: '', citedAt: '',
      costCenter: '', details: '', subjectId: '', claimId: '', prognosis: '', riskTotal: '', riskMaterial: '', riskMoral: '', claimValue: '', contractCode: '',
    });
    expect(ok.ok).toBe(true);
    const movs = await db.select().from(movement).where(like(movement.externalId, 'djen:t-g%'));
    expect(movs).toHaveLength(2);
    expect(movs.every((m) => m.caseId === (ok as { caseId: string }).caseId && m.triageStatus === 'linked' && m.readAt !== null)).toBe(true); // histórico já lido: só as atualizações seguintes viram alerta
  });
});
