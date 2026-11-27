import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeCaseNumber } from '@/lib/case-number';
import { opposingParty, projuris } from '@/lib/connectors/projuris';
import type { ConnectorContext } from '@/lib/connectors/types';

const ENV = { ...process.env };
beforeEach(() => {
  process.env.PROJURIS_WEB_URL = 'https://foco.projuris.com.br/';
  process.env.PROJURIS_WEB_USER = 'usuario';
  process.env.PROJURIS_WEB_PASSWORD = 'senha';
});
afterEach(() => { process.env = { ...ENV }; vi.restoreAllMocks(); });

const PARTES = 'Nome: LETICIA PEREIRA LIRA; Relação: AUTOR; CNPJ: 11943195641; Advogados: (REGINALDO);\n'
  + 'Nome: ROBERT LOPES DE ALMEIDA; Relação: NEUTRO; Documento não informado; Advogados: ();\n'
  + 'Nome: FOCO ALUGUEL DE CARROS S/A; Relação: REU; CNPJ: 07730797000202; Advogados: ();\n';
const CTX_BASE = { terms: [{ id: 't1', term: 'FOCO ALUGUEL DE CARROS', kind: 'name', document: null }], rejectedNames: [] } as unknown as ConnectorContext;
const NUM = normalizeCaseNumber('1002940-89.2026.8.13.0027');

/** Mock mínimo do login + das duas listas (distribuição e publicação), controlável por página. */
function mockFetch({ dist = [], pub = [] }: { dist?: unknown[]; pub?: unknown[] }) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/authentication-service/authenticate')) {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ username: 'usuario', password: 'senha', tenant: 'foco' });
      return new Response(JSON.stringify({ access_token: 'tok123' }), { status: 200 });
    }
    if (url.includes('/distribuicao/pageable')) {
      const page = Number(new URL(url).searchParams.get('page'));
      return new Response(JSON.stringify({ content: page === 0 ? dist : [] }), { status: 200 });
    }
    if (url.includes('/publicacao/pageable')) {
      const page = Number(new URL(url).searchParams.get('page'));
      return new Response(JSON.stringify({ content: page === 0 ? pub : [] }), { status: 200 });
    }
    throw new Error('url inesperada: ' + url);
  });
}

describe('conector Projuris — Distribuições (processo novo)', () => {
  it('sem credencial, avisa o que falta', () => {
    delete process.env.PROJURIS_WEB_USER;
    expect(projuris.isConfigured()).toMatchObject({ ok: false });
  });

  it('acha a parte contrária, ignorando a Foco e quem está como "neutro"', () => {
    expect(opposingParty(PARTES)).toBe('LETICIA PEREIRA LIRA');
    expect(opposingParty('Nome: FOCO ALUGUEL DE CARROS S/A; Relação: REU; CNPJ: 1; Advogados: ();')).toBeNull();
    expect(opposingParty(undefined)).toBeNull();
  });

  it('faz login e traz só distribuições mais novas que o cursor, parando quando acha uma já vista', async () => {
    const fetchFn = mockFetch({ dist: [
      { id: 300, numeroProcesso: '1002940-89.2026.8.13.0027', ignorada: false, valorCausa: 1000, classeNatureza: 'PROCEDIMENTO COMUM', partes: PARTES, dataDistribuicao: '2026-02-19', tribunal: { nome: 'TJMG' }, uf: { uf: 'MG' }, comarca: { nome: 'Betim' } },
      { id: 250, numeroProcesso: '0042053-10.2026.8.04.1000', ignorada: false, partes: PARTES },
    ] });
    const ctx = { fetchFn, monitoredNumbers: [], pendingNumbers: [] } as unknown as ConnectorContext;
    const r = await projuris.fetchSince(JSON.stringify({ dist: 250, pub: null }), ctx); // já vimos até o id 250: só o 300 é novo
    expect(r.items).toHaveLength(1);
    expect((r.items[0] as { id: number }).id).toBe(300);
    expect(JSON.parse(r.nextCursor!)).toMatchObject({ dist: 300 });

    const inbox = projuris.toInbox!(r.items[0], CTX_BASE);
    expect(inbox).toMatchObject({ source: 'projuris_api', caseNumber: NUM, externalId: 'projuris:dist:300' });
    expect(inbox?.parsed).toMatchObject({ portfolio: 'civil', court: 'TJMG', state: 'MG', city: 'Betim', plaintiff: 'LETICIA PEREIRA LIRA', claimValue: 1000, details: 'PROCEDIMENTO COMUM', distributedAt: '2026-02-19' });
    expect(inbox?.parsed?.obtainedBy).toMatch(/Distribuição capturada do Projuris \(nº 300\)/);
  });

  it('a Foco precisa aparecer de verdade nas partes (RF-104, mesma checagem do DJEN)', () => {
    const PARTES_OUTRA_EMPRESA = 'Nome: FULANO DE TAL; Relação: AUTOR; CNPJ: 1; Advogados: ();\nNome: OUTRA EMPRESA LTDA; Relação: REU; CNPJ: 2; Advogados: ();\n';
    const PARTES_VARIACAO = 'Nome: FULANO DE TAL; Relação: AUTOR; CNPJ: 1; Advogados: ();\nNome: FOCO LOCADORA DE VEICULOS LTDA; Relação: REU; CNPJ: 3; Advogados: ();\n';
    const PARTES_VAZIAS = '';
    const base = (over: Record<string, unknown>) => ({ _kind: 'distribuicao', numeroProcesso: '1002940-89.2026.8.13.0027', ...over });

    const semFoco = projuris.toInbox!(base({ id: 1, partes: PARTES_OUTRA_EMPRESA }), CTX_BASE);
    expect(semFoco?.parsed?.obtainedBy).toMatch(/nenhuma parte.*bate/i);

    const variacao = projuris.toInbox!(base({ id: 2, partes: PARTES_VARIACAO }), CTX_BASE);
    expect(variacao?.parsed?.obtainedBy).toMatch(/Conferir parte: nome diferente/);
    expect(variacao?.parsed?.nameVariation).toBe('FOCO LOCADORA DE VEICULOS LTDA');

    const vazio = projuris.toInbox!(base({ id: 3, partes: PARTES_VAZIAS }), CTX_BASE);
    expect(vazio?.parsed?.obtainedBy).toMatch(/nenhuma parte.*bate/i);

    const rejeitado = projuris.toInbox!(base({ id: 4, partes: PARTES_VARIACAO }), { ...CTX_BASE, rejectedNames: ['FOCO LOCADORA DE VEICULOS LTDA'] } as unknown as ConnectorContext);
    expect(rejeitado).toBeNull();

    const ok = projuris.toInbox!(base({ id: 5, partes: PARTES }), CTX_BASE);
    expect(ok?.parsed?.obtainedBy).toMatch(/^Distribuição capturada do Projuris/);
  });

  it('sem cursor (primeira vez), devolve as distribuições encontradas e o maior id como novo cursor', async () => {
    const fetchFn = mockFetch({ dist: [{ id: 10, numeroProcesso: '1002940-89.2026.8.13.0027' }] });
    const r = await projuris.fetchSince(null, { fetchFn, monitoredNumbers: [], pendingNumbers: [] } as unknown as ConnectorContext);
    expect(JSON.parse(r.nextCursor!)).toMatchObject({ dist: 10 });
    expect(r.items).toHaveLength(1);
  });

  it('"ignorada" não impede a entrada (significado não confirmado com o Projuris; decide-se na Triagem)', () => {
    const inbox = projuris.toInbox!({ _kind: 'distribuicao', id: 1, numeroProcesso: '1002940-89.2026.8.13.0027', ignorada: true }, {} as ConnectorContext);
    expect(inbox).not.toBeNull();
  });

  it('número do processo ausente ou inválido não vira item', () => {
    expect(projuris.toInbox!({ _kind: 'distribuicao', id: 2, numeroProcesso: '' }, {} as ConnectorContext)).toBeNull();
    expect(projuris.toInbox!({ _kind: 'distribuicao', id: 3 }, {} as ConnectorContext)).toBeNull();
  });

  it('login recusado gera erro claro (sem token)', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Credenciais inválidas' }), { status: 200 }));
    await expect(projuris.fetchSince(null, { fetchFn, monitoredNumbers: [], pendingNumbers: [] } as unknown as ConnectorContext)).rejects.toThrow(/Credenciais inválidas/);
  });
});

describe('conector Projuris — Publicações (atualização de processo já conhecido, decisão de 27/11/2026)', () => {
  const publicacao = (over: Record<string, unknown> = {}) => ({
    id: 900, numeroProcesso: '1002940-89.2026.8.13.0027', dataPublicacao: '2026-11-27', descricao: 'Texto da intimação.', diario: 'Diário X', forum: 'Vara Y', ...over,
  });

  it('sem nenhum processo monitorado nem pendente, nem chama a rota de publicações', async () => {
    const fetchFn = mockFetch({});
    await projuris.fetchSince(null, { fetchFn, monitoredNumbers: [], pendingNumbers: [] } as unknown as ConnectorContext);
    expect(fetchFn.mock.calls.some(([url]) => String(url).includes('/publicacao/'))).toBe(false);
  });

  it('processo JÁ confirmado (monitoredNumbers): a publicação vira movimentação/alerta, não item da Triagem', async () => {
    const fetchFn = mockFetch({ pub: [publicacao()] });
    const ctx = { fetchFn, monitoredNumbers: [NUM], pendingNumbers: [] } as unknown as ConnectorContext;
    const r = await projuris.fetchSince(JSON.stringify({ dist: 999999, pub: 1 }), ctx); // já viu todas as distribuições; só falta publicação
    expect(r.items).toHaveLength(1);
    const item = r.items[0];
    expect(projuris.toInbox!(item, ctx)).toBeNull(); // nunca cria item novo a partir de publicação
    const mov = projuris.toMovement!(item, ctx);
    expect(mov).toMatchObject({ source: 'projuris', externalId: 'projuris:pub:900', caseNumber: NUM, rawText: 'Texto da intimação.' });
    expect(mov?.alreadyRead).toBeUndefined(); // não é a primeira captura de publicações (cursor já tinha pub:1)
  });

  it('primeira captura de publicações (sem cursor ainda): entra como histórico lido, não como alerta', async () => {
    const fetchFn = mockFetch({ pub: [publicacao()] });
    const ctx = { fetchFn, monitoredNumbers: [NUM], pendingNumbers: [] } as unknown as ConnectorContext;
    const r = await projuris.fetchSince(JSON.stringify({ dist: 999999, pub: null }), ctx);
    const mov = projuris.toMovement!(r.items[0], ctx);
    expect(mov?.alreadyRead).toMatchObject({ by: null });
  });

  it('processo ainda esperando a Triagem (pendingNumbers): a publicação some como item novo, agrupada na lista de publicações', async () => {
    const fetchFn = mockFetch({ pub: [publicacao({ id: 901 })] });
    const ctx = { fetchFn, monitoredNumbers: [], pendingNumbers: [NUM] } as unknown as ConnectorContext;
    const r = await projuris.fetchSince(JSON.stringify({ dist: 999999, pub: null }), ctx);
    const item = r.items[0];
    expect(projuris.toMovement!(item, ctx)).toBeNull(); // ainda não tem processo confirmado: não vira alerta sozinho
    const inbox = projuris.toInbox!(item, ctx);
    expect(inbox).toMatchObject({ source: 'projuris_api', caseNumber: NUM, externalId: 'projuris:pub-item:901' });
    expect((inbox?.payload as { publications: { texto: string }[] }).publications[0].texto).toBe('Texto da intimação.');
  });

  it('processo que não bate com monitorado nem pendente é ignorado', async () => {
    const fetchFn = mockFetch({ pub: [publicacao({ id: 902, numeroProcesso: '9999999-99.2026.8.00.0000' })] });
    const ctx = { fetchFn, monitoredNumbers: [NUM], pendingNumbers: [] } as unknown as ConnectorContext;
    const r = await projuris.fetchSince(JSON.stringify({ dist: 999999, pub: null }), ctx);
    expect(r.items).toHaveLength(0);
  });
});
