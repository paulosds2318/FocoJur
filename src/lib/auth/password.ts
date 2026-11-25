import { randomInt } from 'node:crypto';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
export const TEMP_PASSWORD_LENGTH = 12;
export const TEMP_PASSWORD_HOURS = 72;

function pick(chars: string) {
  return chars[randomInt(chars.length)];
}

/** Senha temporária aleatória de 12 caracteres, sempre com letras e números (RF-61). */
export function generateTempPassword(): string {
  const all = LETTERS + DIGITS;
  const chars = [pick(LETTERS), pick(DIGITS)];
  while (chars.length < TEMP_PASSWORD_LENGTH) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function tempPasswordExpiry(from = new Date()): Date {
  return new Date(from.getTime() + TEMP_PASSWORD_HOURS * 3600_000);
}

/** Regras da senha definitiva (RF-62, RF-64a). Retorna a mensagem de erro ou null. */
export function validateNewPassword(next: string, confirm: string, current?: string): string | null {
  if (next.length < 10) return 'A senha deve ter no mínimo 10 caracteres.';
  if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) return 'Use letras e números.';
  if (current && next === current) return 'A nova senha deve ser diferente da temporária.';
  if (next !== confirm) return 'As senhas não conferem.';
  return null;
}
