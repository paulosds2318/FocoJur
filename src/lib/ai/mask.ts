/**
 * Política de dados (PRD 8.3): antes de enviar texto à IA, remove CPF, RG e dados bancários.
 * O nome das partes segue, porque é necessário para o contexto. CNPJ não é dado pessoal e é mantido.
 */
const rules: [RegExp, string][] = [
  // CPF com ou sem pontuação (11 dígitos), sem pegar trechos de números maiores (ex.: nº CNJ)
  [/(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g, '[CPF]'],
  [/(?<![\d.-])\d{11}(?![\d.-])/g, '[CPF]'],
  // RG (formato comum com pontos e dígito/X)
  [/(?<!\d)\d{1,2}\.\d{3}\.\d{3}-[\dXx](?!\d)/g, '[RG]'],
  [/\b(?:RG|R\.G\.|identidade)\s*(?:n[ºo°.]?\s*)?[:\-]?\s*[\dXx.\-]{5,14}/gi, '[RG]'],
  // dados bancários: agência/conta, PIX e chaves
  [/\b(?:ag[êe]ncia|ag\.?)\s*[:\-]?\s*\d{3,5}(?:-\d)?/gi, '[AGÊNCIA]'],
  [/\b(?:conta(?:\s+corrente|\s+poupan[çc]a)?|c\/c|cc)\s*[:\-nº.]*\s*\d{3,12}(?:-[\dXx])?/gi, '[CONTA]'],
  [/\bpix\b\s*[:\-]?\s*\S+/gi, '[PIX]'],
  [/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, '[CARTÃO]'],
];

export function maskSensitive(text: string): string {
  return rules.reduce((t, [re, repl]) => t.replace(re, repl), text);
}
