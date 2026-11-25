/**
 * CNPJs do grupo Foco informados pelo Jurídico (lista de lojas/filiais). Viram termos monitorados no DJEN.
 * Fora da lista de propósito: DUO Technology (53.321.304/0001-17), empresa da equipe de tecnologia, que só entra
 * se o Jurídico confirmar que processos contra ela devem ser acompanhados.
 */
export const FOCO_ALUGUEL_RAIZ = '07.730.797';

export const FOCO_ALUGUEL: [cnpj: string, unidade: string][] = [
  ['07.730.797/0001-21', 'Matriz Recife-PE'],
  ['07.730.797/0002-02', 'Natal-RN (NAT10)'],
  ['07.730.797/0003-93', 'Salvador-BA (SSA10)'],
  ['07.730.797/0004-74', 'Guarulhos-SP (SAO10)'],
  ['07.730.797/0005-55', 'Recife-PE (REC20)'],
  ['07.730.797/0006-36', 'Congonhas-SP (SAO11)'],
  ['07.730.797/0007-17', 'Confins-MG (CNF10)'],
  ['07.730.797/0008-06', 'Curitiba-PR (CWB10)'],
  ['07.730.797/0009-89', 'Porto Alegre-RS (POA10)'],
  ['07.730.797/0010-12', 'Rio de Janeiro-RJ (GIG10)'],
  ['07.730.797/0011-01', 'Fortaleza-CE (FOR10)'],
  ['07.730.797/0012-84', 'Florianópolis-SC (FLN10)'],
  ['07.730.797/0013-65', 'Maceió-AL (MCZ10)'],
  ['07.730.797/0014-46', 'João Pessoa-PB (JPA10)'],
  ['07.730.797/0015-27', 'Goiânia-GO (GYN10)'],
  ['07.730.797/0016-08', 'Porto Seguro-BA (BPS10)'],
  ['07.730.797/0020-94', 'Vitória-ES (VIX10)'],
  ['07.730.797/0021-75', 'Aracaju-SE (AJU10)'],
  ['07.730.797/0022-56', 'Navegantes-SC (NVT10)'],
  ['07.730.797/0023-37', 'Santos Dumont-RJ (SDU10)'],
  ['07.730.797/0024-18', 'Campinas-SP (VCP10)'],
  ['07.730.797/0028-41', 'Ribeirão Preto-SP (RAO10)'],
];

export const FOCO_SEMINOVOS: [string, string][] = [['62.029.309/0001-61', 'Foco Seminovos Ltda, Recife-PE']];

/** Advogados que representam a Foco: nome completo como cadastrado na OAB (o nome incompleto não retorna nada) e uma OAB por UF. */
export const FOCO_ADVOGADOS: { term: string; kind: 'lawyer' | 'oab'; document: null }[] = [
  { term: 'SERGIO MENDES CAHU FILHO', kind: 'lawyer', document: null },
  { term: '34790/PE', kind: 'oab', document: null },
  { term: '523443/SP', kind: 'oab', document: null },
];

/** Termos de nome: o documento (CNPJ da matriz) é conferido pela RAIZ, então qualquer filial confirma a parte. */
export const FOCO_NOMES: { term: string; document: string }[] = [
  { term: 'FOCO ALUGUEL DE CARROS', document: '07.730.797/0001-21' },
  { term: 'FOCO SEMINOVOS', document: '62.029.309/0001-61' },
];
