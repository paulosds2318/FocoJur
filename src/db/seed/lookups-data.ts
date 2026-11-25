import type { LookupType } from '../schema/lookups';

/** Listas iniciais (provisórias, saem da normalização da planilha; o Jurídico aprova até 03/12/2026). */
export const LOOKUP_SEED: Record<LookupType, string[]> = {
  system: ['PJe', 'eProc', 'Projudi', 'eSaj', 'Processo Eletrônico TJRJ', 'Portal do Advogado SE', 'Domicílio Judicial'],
  court_type: ['Juizado', 'Vara Cível', 'Vara do Trabalho', 'Procon'],
  status: ['Em andamento', 'Aguardando sentença', 'Em fase recursal', 'Em execução', 'Suspenso', 'Encerrado'],
  contingency_status: ['Em andamento', 'Encerrado'],
  subject: [
    'Acidente de trânsito', '404', 'Defeito no veículo', 'No show', 'Veículo recuperado',
    'Cobrança de multa', 'Cobrança de avaria', 'Ausência de baixa na caução', 'Ausência de estorno',
  ],
  claim: ['Danos materiais', 'Danos morais', 'Danos materiais e morais', 'Restituição de valores', 'Obrigação de fazer'],
  closing_reason: ['Acordo', 'Improcedente', 'Procedente (pago)', 'Extinto sem mérito', 'Desistência', 'Arquivado'],
  hearing_type: ['Conciliação', 'Instrução e julgamento', 'UNA'],
  receiver: ['Domicílio Judicial', 'Citação por correio', 'Oficial de justiça', 'Projuris', 'Cadastro manual'],
  rental_type: ['RAC', 'APP', 'Flex'],
  reservation_origin: ['Site Foco', 'Aplicativo', 'Balcão', 'Corporativo', 'Agência/OTA'],
  task_type: [
    'Audiência', 'Contestação', 'Recurso', 'Pagamento', 'Subsídio', 'Provas', 'Réplica', 'Acordo', 'Procon', 'Geral',
  ],
  dismissal_type: ['Sem justa causa', 'Justa causa', 'Pedido de demissão', 'Acordo'],
  // colunas do quadro, como no Planner "Rotina Jurídico" (o Jurídico completa e ordena em Listas oficiais)
  task_bucket: ['Audiências e Contestações', 'Tarefas pendentes', 'Diretoria Geral e Sócios', 'Armazenamento dos Contratos', 'Trabalhista'],
  job_role: ['Atendente', 'Motorista', 'Manobrista', 'Lavador', 'Gerente de loja', 'Administrativo'],
};

export const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
