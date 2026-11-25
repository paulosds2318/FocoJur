import { describe, expect, it } from 'vitest';
import { maskSensitive } from '@/lib/ai/mask';

describe('máscara de dados sensíveis', () => {
  it('remove CPF, RG e dados bancários', () => {
    expect(maskSensitive('Autor CPF 123.456.789-09 e RG 12.345.678-X')).not.toMatch(/123\.456|12\.345/);
    expect(maskSensitive('cpf 12345678909')).toContain('[CPF]');
    expect(maskSensitive('Agência 1234-5 conta corrente 98765-4')).toBe('[AGÊNCIA] [CONTA]');
    expect(maskSensitive('Chave PIX: fulano@email.com')).toContain('[PIX]');
  });
  it('mantém nome das partes, CNPJ e número do processo', () => {
    const t = 'Renata Lopes x FOCO ALUGUEL, CNPJ 12.345.678/0001-90, processo 5011870-02.2026.8.21.0001';
    expect(maskSensitive(t)).toBe(t);
  });
});
