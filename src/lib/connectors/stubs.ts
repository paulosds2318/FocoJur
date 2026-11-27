import type { Connector } from './types';

/**
 * Conectores que dependem de credencial ou contrato fora do controle da DUO (PRD, dependências externas).
 * Ficam registrados com a mesma interface e avisam o que falta, em vez de falhar em silêncio.
 */
export const domicilio: Connector = {
  name: 'domicilio',
  isConfigured: () =>
    process.env.DOMICILIO_CLIENT_ID && process.env.DOMICILIO_CLIENT_SECRET
      ? { ok: true }
      : { ok: false, reason: 'Credencial da Foco no Domicílio Judicial Eletrônico ainda não fornecida (DOMICILIO_CLIENT_ID/SECRET). Dependência do Jurídico, até 26/02/2027.' },
  async fetchSince() {
    throw new Error('Conector do Domicílio Judicial ainda não implementado: depende do acesso por sistema e da credencial da Foco (questão 7 do PRD).');
  },
};
