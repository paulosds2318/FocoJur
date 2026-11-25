import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AiCallError, chatJson, DATA_POLICY, extractJson, parseUsage } from '@/lib/ai/client';

const schema = z.object({ summary: z.string() });
const ok = (content: string, extra: object = {}) =>
  new Response(JSON.stringify({ id: 'gen-1', model: 'm/x', provider: 'P', choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0002, prompt_tokens_details: { cached_tokens: 3 }, ...extra } }));

describe('cliente OpenRouter', () => {
  it('envia política de dados e lê custo e tokens do usage', async () => {
    let body: any;
    const fetchFn = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return ok('{"summary":"ok"}'); }) as unknown as typeof fetch;
    const r = await chatJson({ apiKey: 'k', model: 'm/x', system: 's', user: 'u', schema, fetchFn });
    expect(body.provider.data_collection).toBe('deny');
    expect(body.provider.zdr).toBe(DATA_POLICY.zdr);
    expect(body.response_format.type).toBe('json_schema');
    expect(r.output.summary).toBe('ok');
    expect(r.usage).toMatchObject({ promptTokens: 10, completionTokens: 5, cachedTokens: 3, costUsd: 0.0002 });
    expect(r.generationId).toBe('gen-1');
  });

  it('tolera cerca de código e refaz uma vez quando o JSON é inválido, somando o custo', async () => {
    let n = 0;
    const fetchFn = (async () => (++n === 1 ? ok('isto não é json') : ok('```json\n{"summary":"corrigido"}\n```'))) as unknown as typeof fetch;
    const r = await chatJson({ apiKey: 'k', model: 'm/x', system: 's', user: 'u', schema, fetchFn });
    expect(n).toBe(2);
    expect(r.output.summary).toBe('corrigido');
    expect(r.usage.costUsd).toBeCloseTo(0.0004, 6);
  });

  it('falha depois de duas respostas inválidas ou erro HTTP', async () => {
    const bad = (async () => ok('{"outro":1}')) as unknown as typeof fetch;
    await expect(chatJson({ apiKey: 'k', model: 'm', system: 's', user: 'u', schema, fetchFn: bad })).rejects.toBeInstanceOf(AiCallError);
    const http = (async () => new Response('erro', { status: 429 })) as unknown as typeof fetch;
    await expect(chatJson({ apiKey: 'k', model: 'm', system: 's', user: 'u', schema, fetchFn: http })).rejects.toThrow(/429/);
  });

  it('utilitários', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseUsage(undefined).costUsd).toBeNull();
  });
});
