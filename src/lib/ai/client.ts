import { z } from 'zod';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export type Usage = {
  promptTokens: number | null; completionTokens: number | null; cachedTokens: number | null;
  reasoningTokens: number | null; costUsd: number | null;
};

export type ChatResult<T> = { output: T; usage: Usage; generationId: string | null; provider: string | null; model: string; latencyMs: number };

/** Parâmetros de política de dados enviados em TODA chamada (decisão 13, PRD 8.3). */
export const DATA_POLICY = { data_collection: 'deny', zdr: true } as const;

export function parseUsage(u: Record<string, any> | undefined): Usage {
  const n = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    promptTokens: n(u?.prompt_tokens), completionTokens: n(u?.completion_tokens),
    cachedTokens: n(u?.prompt_tokens_details?.cached_tokens), reasoningTokens: n(u?.completion_tokens_details?.reasoning_tokens),
    costUsd: n(u?.cost),
  };
}

/** Extrai o JSON da resposta, tolerando cercas de código (```json). */
export function extractJson(content: string): unknown {
  const t = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(t);
}

export class AiCallError extends Error {
  constructor(message: string, readonly usage?: Usage, readonly latencyMs?: number) {
    super(message);
  }
}

type ChatArgs<T> = {
  apiKey: string; model: string; system: string; user: string; schema: z.ZodType<T>;
  timeoutMs?: number; fetchFn?: typeof fetch; appName?: string; zdr?: boolean;
};

/**
 * Uma chamada ao OpenRouter com saída JSON validada por Zod. Se o JSON vier inválido, tenta uma vez mais
 * pedindo correção. A chave da API só existe no servidor.
 */
export async function chatJson<T>(a: ChatArgs<T>): Promise<ChatResult<T>> {
  const fetchFn = a.fetchFn ?? fetch;
  const started = Date.now();
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: a.system },
    { role: 'user', content: a.user },
  ];
  let usage: Usage = parseUsage(undefined);
  let lastError = 'resposta inválida';

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchFn(ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(a.timeoutMs ?? 30_000),
      headers: {
        Authorization: `Bearer ${a.apiKey}`, 'Content-Type': 'application/json', 'X-Title': a.appName ?? 'FocoJur',
      },
      body: JSON.stringify({
        model: a.model,
        messages,
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'resposta', strict: false, schema: z.toJSONSchema(a.schema as z.ZodType) },
        },
        provider: { ...DATA_POLICY, zdr: a.zdr ?? DATA_POLICY.zdr },
      }),
    });
    if (!res.ok) throw new AiCallError(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`, usage, Date.now() - started);
    const json = (await res.json()) as { id?: string; model?: string; provider?: string; choices?: { message?: { content?: string } }[]; usage?: Record<string, any> };
    const u = parseUsage(json.usage);
    usage = {
      promptTokens: (usage.promptTokens ?? 0) + (u.promptTokens ?? 0), completionTokens: (usage.completionTokens ?? 0) + (u.completionTokens ?? 0),
      cachedTokens: u.cachedTokens, reasoningTokens: u.reasoningTokens, costUsd: (usage.costUsd ?? 0) + (u.costUsd ?? 0),
    };
    const content = json.choices?.[0]?.message?.content ?? '';
    try {
      const output = a.schema.parse(extractJson(content));
      return { output, usage, generationId: json.id ?? null, provider: json.provider ?? null, model: json.model ?? a.model, latencyMs: Date.now() - started };
    } catch (e) {
      lastError = e instanceof Error ? e.message.slice(0, 200) : 'JSON inválido';
      messages.push({ role: 'assistant', content }, { role: 'user', content: `Seu JSON era inválido (${lastError}). Responda de novo SOMENTE com o JSON correto.` });
    }
  }
  throw new AiCallError(`JSON inválido após nova tentativa: ${lastError}`, usage, Date.now() - started);
}
