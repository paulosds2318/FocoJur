/** Só dígitos (e letras, para o CNPJ alfanumérico da IN RFB 2229/24). */
export const cnpjDigits = (s: string) => s.replace(/[^0-9A-Za-z]/g, '').toUpperCase();

/** 14 caracteres com a máscara 00.000.000/0000-00. */
export function formatCnpj(s: string) {
  const d = cnpjDigits(s);
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : s;
}

/** Raiz (8 primeiros caracteres): identifica a empresa; o resto identifica matriz/filial. */
export const cnpjRoot = (s: string) => cnpjDigits(s).slice(0, 8);

/** Confere os dois dígitos verificadores (módulo 11); aceita o formato alfanumérico (letra vale ASCII - 48). */
export function isValidCnpj(s: string): boolean {
  const d = cnpjDigits(s);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const val = (c: string) => c.charCodeAt(0) - 48;
  const dv = (base: string) => {
    const w = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = [...base].reduce((acc, c, i) => acc + val(c) * w[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(d.slice(0, 12));
  const d2 = dv(d.slice(0, 12) + d1);
  return d.endsWith(`${d1}${d2}`);
}

/** Encontra CNPJs com máscara dentro de um texto (ex.: publicação do diário). */
export function findCnpjs(text: string): string[] {
  return [...new Set(text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) ?? [])];
}

/**
 * Confere se o documento da parte aparece no texto. Para CNPJ de 14 dígitos compara a RAIZ: a publicação pode citar
 * qualquer filial da mesma empresa, e isso não é homônimo.
 */
export function textMentionsDocument(text: string, document: string): boolean {
  const doc = cnpjDigits(document);
  const plain = text.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return plain.includes(doc.length === 14 ? doc.slice(0, 8) : doc);
}
