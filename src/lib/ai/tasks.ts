import { z } from 'zod';
import type { AiTask } from '@/db/schema/ai';

/** Saídas validadas com Zod (PRD 8.1). A IA sugere; quem decide é a advogada (regra 1). */
export const schemas = {
  movement_summary: z.object({ summary: z.string().max(400) }),
  deadline_suggestion: z.object({
    hasDeadline: z.boolean(),
    actType: z.string().nullable().optional(),
    days: z.number().int().positive().nullable().optional(),
    dayCount: z.enum(['business', 'calendar']).nullable().optional(),
    startDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    legalBasis: z.string().nullable().optional(),
    confidence: z.number().min(0).max(1),
    hearing: z.object({ date: z.string(), time: z.string().nullable().optional(), mode: z.string().nullable().optional() }).nullable().optional(),
  }),
  intake_classification: z.object({
    portfolio: z.enum(['civil', 'labor', 'procon']),
    subjectCode: z.string().nullable(),
    claimCode: z.string().nullable(),
    prognosis: z.enum(['probable', 'possible', 'remote']).nullable(),
    rationale: z.string(),
  }),
  contract_extraction: z.object({ contractCodes: z.array(z.string()) }),
  portal_extraction: z.object({
    number: z.string().nullable(),
    court: z.string().nullable(),
    system: z.string().nullable(),
    plaintiffs: z.array(z.string()),
    defendants: z.array(z.string()),
    plaintiffLawyer: z.string().nullable(),
    claimValue: z.number().nullable(),
    distributedAt: z.string().nullable(),
    subject: z.string().nullable(),
    movements: z.array(z.object({ date: z.string(), text: z.string() })),
  }),
} satisfies Record<AiTask, z.ZodType>;

export type TaskOutput<T extends AiTask> = z.infer<(typeof schemas)[T]>;

const COMMON =
  'Responda SOMENTE com JSON válido no formato pedido, sem texto fora do JSON. Se uma informação não estiver no texto, use null; nunca invente.';

export const prompts: Record<AiTask, string> = {
  movement_summary: `Você resume publicações e intimações judiciais para advogadas de uma locadora de veículos. Resuma em 2 a 3 linhas (máx. 400 caracteres), em português, o que aconteceu e se exige providência. ${COMMON} Formato: {"summary": string}`,
  deadline_suggestion: `Você identifica prazos processuais em publicações. Indique o tipo de ato, o número de dias, se a contagem é em dias úteis ("business") ou corridos ("calendar"), o fundamento legal e a confiança (0 a 1). NÃO calcule a data final com certeza: ela será calculada pelo sistema. Se houver audiência, preencha "hearing". Se não houver prazo, hasDeadline=false. Quando o texto trouxer a lista "Tipos de ato cadastrados", escolha em actType EXATAMENTE um dos rótulos dessa lista, seguindo a descrição de cada tipo (inclusive o prazo e a forma de contagem que ela indicar); se nenhum servir, descreva o ato em texto livre. ${COMMON} Formato: {"hasDeadline": boolean, "actType": string|null, "days": number|null, "dayCount": "business"|"calendar"|null, "startDate": string|null, "dueDate": string|null, "legalBasis": string|null, "confidence": number, "hearing": {"date": string, "time": string|null, "mode": string|null}|null}`,
  intake_classification: `Você classifica uma ação nova contra uma locadora de veículos. Use APENAS os códigos das listas oficiais fornecidas no texto. A descrição de cada opção diz quando usá-la: siga-a para escolher; se nenhuma opção servir, use null (nunca invente um código). ${COMMON} Formato: {"portfolio": "civil"|"labor"|"procon", "subjectCode": string|null, "claimCode": string|null, "prognosis": "probable"|"possible"|"remote"|null, "rationale": string}`,
  contract_extraction: `Encontre códigos de contrato de locação no texto (três letras maiúsculas, seis dígitos, hífen e dois dígitos, ex.: POA004871-26). ${COMMON} Formato: {"contractCodes": string[]}`,
  portal_extraction: `Você extrai dados de capa da página de um processo no portal do tribunal. Campo não encontrado volta null, nunca inventado. Datas em AAAA-MM-DD. ${COMMON} Formato: {"number": string|null, "court": string|null, "system": string|null, "plaintiffs": string[], "defendants": string[], "plaintiffLawyer": string|null, "claimValue": number|null, "distributedAt": string|null, "subject": string|null, "movements": [{"date": string, "text": string}]}`,
};
