import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Descrição das listas oficiais: salva, auditada, validada; e usada nos prompts da IA (classificação e prazo). */
const TAG = 'TESTE-DESC';
let adminId = '';

async function limpa() {
  const { db } = await import('@/db');
  const { auditLog } = await import('@/db/schema');
  const { lookup } = await import('@/db/schema/lookups');
  const { aiCall, aiTaskConfig } = await import('@/db/schema/ai');
  const { deadlineSuggestion, movement } = await import('@/db/schema/movement');
  const rows = await db.select({ id: lookup.id }).from(lookup).where(like(lookup.label, `${TAG}%`));
  if (rows.length) {
    await db.delete(auditLog).where(inArray(auditLog.entityId, rows.map((r) => r.id)));
    await db.delete(lookup).where(inArray(lookup.id, rows.map((r) => r.id)));
  }
  const ms = await db.select({ id: movement.id }).from(movement).where(like(movement.externalId, `${TAG}%`));
  for (const m of ms) {
    await db.delete(deadlineSuggestion).where(eq(deadlineSuggestion.movementId, m.id));
    await db.delete(movement).where(eq(movement.id, m.id));
  }
  await db.delete(aiCall).where(eq(aiCall.model, 'test/model-desc'));
  void aiTaskConfig;
}

beforeAll(async () => {
  const { db } = await import('@/db');
  const { user } = await import('@/db/schema');
  await limpa();
  adminId = (await db.select().from(user).where(eq(user.role, 'admin')).limit(1))[0].id;
});
afterAll(async () => {
  await limpa();
  const { pool } = await import('@/db');
  await pool.end();
});

describe('descrição do item da lista', () => {
  it('salva na criação e na edição, audita antes/depois, limita o tamanho e ignora o que não mudou', async () => {
    const { addLookup, updateLookupDescription, DESCRIPTION_MAX } = await import('@/server/lookups');
    const { db } = await import('@/db');
    const { auditLog } = await import('@/db/schema');
    const { lookup } = await import('@/db/schema/lookups');

    expect(await addLookup(adminId, 'task_type', `${TAG} Contestação`, '  Prazo de 15 dias úteis.  ')).toEqual({ ok: true });
    const [row] = await db.select().from(lookup).where(eq(lookup.label, `${TAG} Contestação`));
    expect(row.description).toBe('Prazo de 15 dias úteis.');

    expect(await updateLookupDescription(adminId, row.id, 'Contestação: 15 dias úteis a partir da citação.')).toEqual({ ok: true, changed: true });
    expect(await updateLookupDescription(adminId, row.id, 'Contestação: 15 dias úteis a partir da citação.')).toEqual({ ok: true, changed: false });
    expect((await db.select().from(lookup).where(eq(lookup.id, row.id)))[0].description).toBe('Contestação: 15 dias úteis a partir da citação.');

    const log = (await db.select().from(auditLog).where(eq(auditLog.entityId, row.id))).filter((l) => l.action === 'update');
    expect(log).toHaveLength(1);
    expect(log[0].diff).toEqual({ description: { before: 'Prazo de 15 dias úteis.', after: 'Contestação: 15 dias úteis a partir da citação.' } });

    expect(await updateLookupDescription(adminId, row.id, 'x'.repeat(DESCRIPTION_MAX + 1))).toMatchObject({ ok: false, error: expect.stringContaining(String(DESCRIPTION_MAX)) });
    expect(await addLookup(adminId, 'task_type', `${TAG} Longa`, 'x'.repeat(DESCRIPTION_MAX + 1))).toMatchObject({ ok: false });
    expect(await updateLookupDescription(adminId, '00000000-0000-0000-0000-000000000000', 'a')).toMatchObject({ ok: false });

    // vazio limpa a descrição
    expect(await updateLookupDescription(adminId, row.id, '   ')).toEqual({ ok: true, changed: true });
    expect((await db.select().from(lookup).where(eq(lookup.id, row.id)))[0].description).toBeNull();
  });

  it('só o administrador edita: as ações exigem requireAdmin', () => {
    const src = readFileSync('src/app/(app)/admin/listas/actions.ts', 'utf-8');
    expect((src.match(/await requireAdmin\(\)/g) ?? []).length).toBe(4); // adicionar e editar descrição, fórmula do risco e prazo interno do tipo
    expect(src).not.toContain('requireUser');
  });
});

describe('opções com descrição nos prompts da IA', () => {
  it('optionLines junta rótulo e descrição, trunca e respeita o orçamento; canonicalOption casa sem caixa/acento', async () => {
    const { canonicalOption, optionLines } = await import('@/lib/ai/options');
    expect(optionLines([{ code: 'a', label: 'Dano moral', description: 'Quando há pedido de\n  indenização' }, { code: 'b', label: 'Outro' }]))
      .toBe('- a = Dano moral: Quando há pedido de indenização\n- b = Outro');
    expect(optionLines([{ label: 'X', description: 'y'.repeat(50) }], { maxDesc: 10 })).toBe(`- X: ${'y'.repeat(9)}…`);
    const cheio = optionLines([{ label: 'A', description: 'abcdef' }, { label: 'B', description: 'ghijkl' }], { maxTotal: 6 });
    expect(cheio).toBe('- A: abcdef\n- B'); // estourou o orçamento: o rótulo fica, a descrição não
    expect(canonicalOption('contestacao', [{ label: 'Contestação' }])).toBe('Contestação');
    expect(canonicalOption('Ato inexistente', [{ label: 'Contestação' }])).toBe('Ato inexistente');
    expect(canonicalOption('  ', [{ label: 'Contestação' }])).toBeNull();
  });

  it('classificação: o prompt traz objeto e pedido com as descrições', async () => {
    const { buildClassificationPrompt } = await import('@/server/inbox-ai');
    const p = buildClassificationPrompt(
      { subject: [{ code: 'no_show', label: 'No show', description: 'Cliente não retirou o veículo reservado' }], claim: [{ code: 'dm', label: 'Dano material' }] },
      'Texto do caso',
    );
    expect(p).toContain('no_show = No show: Cliente não retirou o veículo reservado');
    expect(p).toContain('dm = Dano material');
    expect(p).toContain('SOMENTE entre os códigos listados');
    expect(p.endsWith('Texto do caso')).toBe(true);
  });

  it('prazo: a IA recebe os tipos de ato com descrição e o ato devolvido é normalizado para o rótulo da lista (ou fica como texto livre)', async () => {
    const { db } = await import('@/db');
    const { aiTaskConfig } = await import('@/db/schema/ai');
    const { movement, deadlineSuggestion } = await import('@/db/schema/movement');
    const { addLookup } = await import('@/server/lookups');
    const { enrichMovementWithAI } = await import('@/server/movements');

    await addLookup(adminId, 'task_type', `${TAG} Réplica`, 'Réplica à contestação: 15 dias úteis, contados da intimação.');
    const antes = await db.select().from(aiTaskConfig);
    const keyAntes = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'chave-de-teste';
    for (const task of ['movement_summary', 'deadline_suggestion'] as const) {
      await db.insert(aiTaskConfig).values({ task, primaryModel: 'test/model-desc' }).onConflictDoUpdate({ target: aiTaskConfig.task, set: { primaryModel: 'test/model-desc', fallbackModel: null } });
    }

    const resposta = (obj: unknown) => new Response(JSON.stringify({ id: 'g', model: 'test/model-desc', provider: 'P', choices: [{ message: { content: JSON.stringify(obj) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    const enviados: string[] = [];
    const rodar = async (ato: string, ext: string) => {
      const [m] = await db.insert(movement).values({ source: 'djen', externalId: `${TAG}-${ext}`, occurredAt: new Date('2026-12-01T12:00:00Z'), title: 'Intimação', rawText: 'Intimada a Foco para manifestar-se sobre a contestação.' }).returning();
      const fetchFn = (async (_u: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        const all = (body.messages as { content: string }[]).map((x) => x.content).join('\n');
        enviados.push(all);
        return all.includes('Você resume') ? resposta({ summary: 'Resumo.' }) : resposta({ hasDeadline: true, actType: ato, days: 15, dayCount: 'business', confidence: 0.9 });
      }) as unknown as typeof fetch;
      await enrichMovementWithAI(m.id, fetchFn);
      return (await db.select().from(deadlineSuggestion).where(eq(deadlineSuggestion.movementId, m.id)))[0];
    };

    try {
      const s1 = await rodar(`${TAG.toLowerCase()} réplica`, 'a'); // caixa diferente da lista
      expect(s1.actType).toBe(`${TAG} Réplica`);
      const s2 = await rodar('Ato que não está na lista', 'b');
      expect(s2.actType).toBe('Ato que não está na lista');
    } finally {
      process.env.OPENROUTER_API_KEY = keyAntes;
      if (keyAntes === undefined) delete process.env.OPENROUTER_API_KEY;
      for (const task of ['movement_summary', 'deadline_suggestion'] as const) {
        const old = antes.find((a) => a.task === task);
        if (old) await db.update(aiTaskConfig).set({ primaryModel: old.primaryModel, fallbackModel: old.fallbackModel }).where(eq(aiTaskConfig.task, task));
        else await db.delete(aiTaskConfig).where(eq(aiTaskConfig.task, task));
      }
    }
    const doPrazo = enviados.find((e) => e.includes('Tipos de ato cadastrados'))!;
    expect(doPrazo).toContain(`${TAG} Réplica: Réplica à contestação: 15 dias úteis, contados da intimação.`);
    expect(doPrazo).toContain('Intimada a Foco para manifestar-se');
  });
});
