import { describe, expect, it } from 'vitest';
import { generateTempPassword, validateNewPassword } from '@/lib/auth/password';

describe('senha temporária', () => {
  it('tem 12 caracteres com letras e números', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateTempPassword();
      expect(p).toHaveLength(12);
      expect(p).toMatch(/[A-Za-z]/);
      expect(p).toMatch(/\d/);
    }
  });
});

describe('senha definitiva', () => {
  it('rejeita curta, sem número, igual à temporária e divergente', () => {
    expect(validateNewPassword('abc123', 'abc123')).toMatch(/10/);
    expect(validateNewPassword('somenteletras', 'somenteletras')).toMatch(/letras e números/);
    expect(validateNewPassword('Temporaria12', 'Temporaria12', 'Temporaria12')).toMatch(/diferente/);
    expect(validateNewPassword('SenhaNova123', 'SenhaNova124')).toMatch(/conferem/);
  });
  it('aceita senha válida', () => {
    expect(validateNewPassword('SenhaNova123', 'SenhaNova123', 'Temporaria12')).toBeNull();
  });
});
