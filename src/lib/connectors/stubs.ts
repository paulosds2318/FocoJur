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

export const projuris: Connector = {
  name: 'projuris',
  isConfigured: () =>
    process.env.PROJURIS_API_URL && process.env.PROJURIS_API_TOKEN
      ? { ok: true }
      : { ok: false, reason: 'O contrato do Projuris inclui API? Sem resposta (questão 1 do PRD), a entrada é por importação em lote Excel/CSV.' },
  async fetchSince() {
    throw new Error('Conector da API do Projuris ainda não implementado: depende do contrato incluir API (questão 1 do PRD).');
  },
};
