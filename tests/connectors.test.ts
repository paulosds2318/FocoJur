import { describe, expect, it } from 'vitest';
import { expandMovements, tribunalAlias } from '@/lib/connectors/datajud';
import { djen, foldName, termQuery } from '@/lib/connectors/djen';

describe('DataJud', () => {
  it('descobre o índice do tribunal pelos segmentos J.TR do número CNJ', () => {
    expect(tribunalAlias('5011870-02.2026.8.21.0001')).toBe('tjrs');
    expect(tribunalAlias('0100584-60.2025.5.01.0062')).toBe('trt1');
    expect(tribunalAlias('0000001-00.2026.4.03.6100')).toBe('trf3');
    expect(tribunalAlias('123')).toBeNull();
  });
  it('expande movimentos com id estável para não duplicar', () => {
    const [m] = expandMovements({ _number: '5011870-02.2026.8.21.0001', movimentos: [{ codigo: 26, nome: 'Distribuição', dataHora: '2026-11-10T10:00:00.000Z', complementosTabelados: [{ descricao: 'sorteio' }] }, { nome: 'sem data' }] });
    expect(expandMovements({ _number: 'x', movimentos: [{ nome: 'sem data' }] })).toHaveLength(0);
    expect(m.externalId).toBe('datajud:50118700220268210001:26:2026-11-10T10:00:00.000Z');
    expect(m.rawText).toBe('Distribuição — sorteio');
  });
});

describe('DJEN', () => {
  it('monta a consulta por tipo de termo', () => {
    expect(termQuery({ kind: 'cnpj', term: '12.345.678/0001-90' })).toEqual({ texto: '12345678000190' });
    expect(termQuery({ kind: 'oab', term: '123456/PE' })).toEqual({ numeroOab: '123456', ufOab: 'PE' });
    expect(termQuery({ kind: 'name', term: 'FOCO ALUGUEL' })).toEqual({ nomeParte: 'FOCO ALUGUEL' });
  });
  it('marca homônimo quando o nome bate mas o documento não aparece no texto (RF-104)', () => {
    const base = { id: '1', numero_processo: '5011870-02.2026.8.21.0001', texto: 'Cite-se a ré FOCO ALUGUEL DE CARROS', _termKind: 'name', _term: 'FOCO ALUGUEL' };
    expect(djen.toInbox!({ ...base, _termDoc: '12.345.678/0001-90' }, {} as never)?.parsed?.obtainedBy).toMatch(/Conferir parte/);
    const ok = djen.toInbox!({ ...base, texto: `${base.texto} CNPJ 12.345.678/0001-90`, _termDoc: '12.345.678/0001-90' }, {} as never);
    expect(ok?.parsed?.obtainedBy).not.toMatch(/Conferir parte/);
    expect(ok?.externalId).toBe('djen:1');
  });

  it('confirma a parte pelo nome dos destinatários da própria publicação (sem precisar de CNPJ no texto)', () => {
    const item = { id: '9', numero_processo: '5011870-02.2026.8.21.0001', texto: 'Intimação sem documento', _termKind: 'name', _term: 'FOCO ALUGUEL DE CARROS', _termDoc: '07.730.797/0001-21', destinatarios: [{ nome: 'FOCO ALUGUEL DE CARROS S/A', polo: 'P' }] };
    expect(djen.toInbox!(item, {} as never)?.parsed?.obtainedBy).not.toMatch(/Conferir parte/);
    const outro = { ...item, destinatarios: [{ nome: 'FOCO DESIGN E SOFTWARE LTDA', polo: 'P' }] };
    expect(djen.toInbox!(outro, {} as never)?.parsed?.obtainedBy).toMatch(/Conferir parte/);
    expect(foldName('Sérgio Mendes Cahu Filho')).toBe(foldName('SERGIO MENDES CAHU FILHO'));
  });

  it('guarda a publicação para agrupar várias do mesmo processo', () => {
    const r = djen.toInbox!({ id: '7', numero_processo: '5011870-02.2026.8.21.0001', texto: 'x', tipoComunicacao: 'Intimação', data_disponibilizacao: '2026-11-13', _termKind: 'oab', _term: '34790/PE' }, {} as never)!;
    expect((r.payload as { publications: { id: string; tipo: string }[] }).publications).toMatchObject([{ id: '7', tipo: 'Intimação' }]);
  });

  it('limpa o HTML do diário e deduz a carteira pelo número CNJ', () => {
    const base = { id: '5', texto: '<html><body><b>INTIMAÇÃO</b><p>Prazo de 15 dias</p></body></html>', _termKind: 'oab', _term: '34790/PE' };
    const civil = djen.toInbox!({ ...base, numero_processo: '5011870-02.2026.8.21.0001' }, {} as never)!;
    expect(civil.parsed?.details).toBe('INTIMAÇÃO Prazo de 15 dias');
    expect(civil.parsed?.portfolio).toBe('civil');
    expect(djen.toInbox!({ ...base, numero_processo: '0100584-60.2025.5.01.0062' }, {} as never)!.parsed?.portfolio).toBe('labor');
    expect(djen.toMovement!({ ...base, numero_processo: '5011870-02.2026.8.21.0001' }, {} as never)!.rawText).not.toMatch(/<\/?b>/);
  });
});
