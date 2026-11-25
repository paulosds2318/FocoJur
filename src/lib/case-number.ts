/** Normaliza o número do processo: só dígitos (CNJ ou número do Procon). */
export function normalizeCaseNumber(input: string): string {
  return input.replace(/\D/g, '');
}

/** Máscara CNJ NNNNNNN-DD.AAAA.J.TR.OOOO quando tiver 20 dígitos; senão devolve como veio. */
export function formatCaseNumber(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.length !== 20) return digits;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}

/** Valida o dígito verificador do número CNJ (módulo 97 base 10, ISO 7064). */
export function isValidCnj(input: string): boolean {
  const d = normalizeCaseNumber(input);
  if (d.length !== 20) return false;
  const nnnnnnn = d.slice(0, 7);
  const dv = d.slice(7, 9);
  const rest = d.slice(9); // AAAAJTROOOO
  const rem = (s: string, start: number) => {
    let r = start;
    for (const ch of s) r = (r * 10 + Number(ch)) % 97;
    return r;
  };
  // DV = 98 - ((NNNNNNN AAAA JTR OOOO 00) mod 97)
  const r1 = rem(nnnnnnn, 0);
  const r2 = rem(rest + '00', r1);
  return 98 - r2 === Number(dv);
}

/** Código de contrato da locação: ex. POA004871-26. */
export const CONTRACT_REGEX = /[A-Z]{3}\d{6}-\d{2}/g;
export function extractContractCodes(text: string): string[] {
  return [...new Set(text.match(CONTRACT_REGEX) ?? [])];
}
