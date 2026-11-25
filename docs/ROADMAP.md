# Roadmap de implementação (Fase 1)

## Andamento (23/11/2026)

| Marco | Situação |
|---|---|
| M0 Fundação | **Pronto** |
| M1 Cadastro | **Pronto**: listas oficiais, lista/busca/filtros, exportar Excel, cadastro, ficha (dados, risco com histórico, contrato, partes, causa raiz, encerrar, monitoramento, exclusão lógica, histórico) |
| M2 Tarefas | **Pronto**: quadro (arrastar ou "mover para"), lista, filtros, revisor, tarefas gerais, **editar tarefa e trocar responsável direto no card (RF-27/28)**, feriados nacionais, rodízio, Início, alerta por e-mail às 7h (worker). Calendário de feriados estaduais/municipais/do tribunal cadastrável em `/admin/feriados` (vale só para o processo daquela UF/cidade/vara) |
| M3 Financeiro | **Pronto** |
| M4 Migração | **Scripts prontos e testados com dados fictícios** (`pnpm migrar:planilha`, `pnpm migrar:planner`, ambos com `--dry-run`). Falta rodar com a planilha e o export reais, ajustar os apelidos de colunas em `src/lib/migration/spreadsheet.ts` e validar o relatório com o Jurídico |
| M5 Produção | **Preparado** (Dockerfile do app e do worker, `docs/DEPLOY-AWS.md`). Driver S3 pronto. Falta o ambiente AWS (infraestrutura), homologação e a virada |
| M6 Captura | **Caixa de entrada (agora só consulta), Triagem (processos novos) e Alertas (publicações e movimentos de processos cadastrados) como as telas de decisão, criar tarefa com prazo manual (RF-106 a RF-108), importação do Projuris, termos/lojas/variações do nome editáveis pelo admin (RF-67), intervalo único de 1/6/12/24 h com padrão de 1 h (RF-68), busca imediata ao criar termo (RF-69), paginação (RF-109), conectores DJEN/DataJud, robô (pipeline) prontos**. **Teste real do DJEN feito (17/11/2026): 430 processos / 661 publicações da Foco na caixa de entrada, agrupadas por processo.** **DataJud:** conector reforçado para volume (lotes, espera e nova tentativa, teto, execução parcial), mas o CNJ respondeu 429 em todas as tentativas de 17 e 18/11; consulta de amostra agendada, sem insistir em laço. Pendente: Domicílio e API do Projuris (dependem de credencial/contrato), sistema de locação (depende do time), adaptadores eProc/PJe do robô (dependem de termos de uso e do piloto), validar DJEN/DataJud contra a API real |
| M7 IA | **Camada OpenRouter, admin de modelos, custos, PTAX, alertas de limite e sugestão de prazo prontos**. Comparação de modelos (RF-84), classificação na entrada e extração de contrato com aceite (RF-13) prontas. Pendente: chave do OpenRouter e a validação do contrato no sistema de locação |
| M8 Painéis | **Pronto** (validar com a planilha de out/2026 depois da migração) |

**Testes (24/11/2026):** 151 de unidade e integração e 22 de ponta a ponta, todos passando.

**Decisões recentes**
- 23/11: Caixa de entrada vira consulta; a decisão fica em duas telas com função distinta: Triagem (processo novo) e Alertas (novidade de processo cadastrado), cada uma com seu selo.
- 24/11: Alertas vira lista + painel de detalhe, com abas Pendentes/Tratados/Todos e histórico do alerta (RF-113, RF-114); botão Voltar em todas as telas (RF-115).
- 24/11: Tarefas e prazos no padrão do Planner do Jurídico: quadro por coluna (bucket) com "Adicionar tarefa", círculo para concluir, concluídas recolhidas, Grade e Calendário mensal/semanal com "não agendadas" (RF-20, RF-22, RF-22c a RF-22f). Falta: Linha do tempo e Gráficos do Planner (os gráficos já existem em Painéis).
- 24/11: Consulta real ao DataJud agendada no Windows todos os dias às 6h30 (horário em que o CNJ passa a atender), com novas tentativas a cada 30 min por 2 h (`pnpm datajud:agendado`).
- 24/11: Vários responsáveis por tarefa (RF-27, RF-28); fórmula do valor de risco como na planilha do Jurídico: Juizado 18%, Vara Cível 24%, Casos antigos 35% e 20% de honorários (RF-66b); Dia do Advogado e Dia da Justiça por tribunal/UF (RF-125); paginação de Processos no padrão da Triagem (RF-126); menu recolhido no celular (RF-127).
- 24/11: Rodízio da advogada do dia removido (todas veem o de todas): sai a coluna Rodízio de Usuários, a visão "Fila da advogada do dia" e a faixa do Início; tarefa sem responsável fica "Sem responsável".
- 24/11: Fluxo definido com o Jurídico: tudo que vem do DJEN entra direto em Processos (cadastro mínimo, monitoramento ligado; publicação de origem fica como histórico lido) e cada atualização seguinte vira alerta; distribuições (Projuris, Domicílio, manual) vão para Caixa de entrada e Triagem e, confirmadas, viram Processo; processos em andamento e concluídos ficam em Processos (sem tela de Histórico). Busca do DJEN pelo número dos processos monitorados (RF-119); chegada e "pendente há X dias" do alerta e sininho (RF-120, RF-121); prazo interno automático por tipo de tarefa (RF-22g); recesso forense de 20/12 a 20/01 no calendário de feriados; horário no calendário (RF-22h); processo do DJEN direto em Processos (RF-124).
- 24/11: Importação da base atual pela tela, com de-para, prévia, execução em segundo plano e relatório em Excel; concluídos entram sem monitoramento (RF-122, RF-123).
- 24/11: migração do Planner coloca cada tarefa na coluna de mesmo nome do bucket (cria a coluna se não existir).
- 24/11: a tela Andamentos passou a se chamar **Alertas** (`/alertas`; o endereço antigo redireciona). "Andamentos" fica só como o histórico dentro da ficha do processo, porque para o Jurídico "andamento" é a pasta do processo. Decisão da reunião de alinhamento de 24/11.
- 24/11: alertas de andamento ficam pendentes até uma decisão (criar tarefa ou ignorar com motivo; sem "só marcar como lida"); "Criar tarefa" leva à tela de tarefas e o alerta vira lido; aviso global com a contagem (RF-102, RF-107).
- 24/11: tarefa com prazo limite e prazo interno; responsável opcional ("Sem responsável"); filtros de responsável e de dia em Tarefas e prazos (RF-21, RF-22a, RF-22b).
- 24/11: fórmula do valor de risco configurável em Listas oficiais (RF-66b).
- 24/11: tela Auditoria por usuário (RF-73).
- 24/11: visibilidade compartilhada (todos veem todos os processos e tarefas; o responsável não restringe o acesso).
- 24/11: filtros de mês e ano e de período personalizado em Painéis (RF-56) e Custos de IA (RF-96, inclui o CSV).
- 24/11: descrição nos itens das listas oficiais, lida pela IA na Triagem e em Alertas para sugerir classificação, ato e prazo (RF-66a); sempre com confirmação humana.
- 24/11: botão "Buscar no portal" passa a consultar a API pública do CNJ (DataJud) para completar a capa, sem scraper de portal (RF-17).
- 23/11: ficha do processo ganha a aba Andamentos (linha do tempo); barra de ações em lote fixa no rodapé com contador; vincular um andamento não o tira da fila.
- 23/11: criação de tarefa com prazo não depende da IA (botão manual no andamento e bloco opcional ao confirmar processo novo); a sugestão da IA segue como atalho, sempre com confirmação da advogada.
- 18/11: um único intervalo de captura, em horas, vale para tudo (padrão 1 hora).

**Pendências que dependem de decisão ou de terceiros:** chave do OpenRouter (IA), credencial do Domicílio, resposta sobre a API do Projuris, ambiente AWS, planilha e export do Planner reais para a migração, termos de uso dos portais (robô), reavaliar o DataJud de outro IP ou horário, nomes de variação da Foco a validar com o Jurídico.

Cada marco termina com testes passando, migration aplicada e demonstração possível.

| Marco | Período | Entregas | Pronto quando | Telas (docs/design) |
|---|---|---|---|---|
| **M0 Fundação** | 23–27/11/2026 | Next.js + Tailwind + shadcn; Docker (Postgres + Mailpit); Drizzle; Better Auth sem cadastro público; criação de usuário com senha temporária e primeiro acesso (RF-60 a 64a); layout com menu; RBAC; `audit_log` | Admin semeado cria advogada; ela entra, cria senha definitiva e vê o layout | Login, AdminUsuarios |
| **M1 Cadastro** | 30/11–18/12 | Schema 5.1–5.3; listas oficiais + admin (RF-66); ficha do processo (RF-40 a 48); lista e busca (RF-30 a 33) | Cadastrar, editar, encerrar e buscar processos das 3 carteiras, com auditoria | Processos, FichaProcesso |
| **M2 Tarefas** | 21/12–04/01/2027 | `task`, `holiday`; quadro e lista (RF-20 a 26); Início (RF-01 a 03); rodízio (RF-65) | Advogada do dia trabalha sem o Planner | Tarefas, Main |
| **M3 Financeiro e usuários** | 05–11/01 | `financial_entry` (RF-45); usuários completos | | FichaProcesso (aba), AdminUsuarios |
| **M4 Migração** | 12–26/01 | Scripts planilha (9.2) e Planner (9.3); relatório de exceções | Base local com histórico completo e relatório validado | |
| **M5 Produção** | 27/01–18/02 | Deploy AWS, backup, SES, homologação, operação em paralelo, **virada** | Planilha e Planner somente leitura | |
| **M6 Captura e monitoramento (1b)** | 19/02–05/05 | `inbox_item`, `import_batch`; conectores (Domicílio, DJEN, DataJud, Projuris); caixa de entrada; triagem; monitoramento e carteira parada; camada OpenRouter; robô + piloto (12/04); sistema de locação | Processos e movimentações chegam sozinhos; relatório do piloto | CaixaEntrada, Triagem |
| **M7 IA (1c)** | 06–20/05 | Tarefas de IA nas telas (RF-04, RF-13); admin de modelos (RF-80 a 84); custos (RF-90 a 95) | Sugestões com custo por chamada | AdminIA, CustosIA |
| **M8 Painéis (1c)** | 21/05–07/06 | RF-50 a 55; homologação | Indicadores batem com a planilha de out/2026 | Paineis |

## Dependências externas críticas
- **Ambiente AWS até 27/01/2027** (caminho crítico da virada): abrir a solicitação em novembro.
- Listas oficiais e regra da coluna ATIVO até 03/12/2026.
- Planilha atualizada até 12/01/2027; exportação do Planner até 22/01/2027.
- Resposta sobre API/exportação do Projuris até 19/02/2027.
- Lista de termos DJEN até 17/03; termos de uso dos portais do piloto até 31/03; 50 processos do piloto até 07/04; acesso ao sistema de locação até 13/04.

## Primeiros passos (M0)
1. Colocar os documentos originais em `docs/` (`PRD.md`, `proposta-fase1.md`, `cronograma.md`) e as telas `.dc.html` em `docs/design/`.
2. `pnpm create next-app` na raiz (TypeScript, Tailwind, App Router, `src/`); `pnpm dlx shadcn@latest init`.
3. `pnpm add drizzle-orm pg better-auth zod pg-boss nodemailer` e `pnpm add -D drizzle-kit vitest @playwright/test`.
4. `cp .env.example .env`; `docker compose up -d`.
5. Schema 5.1 (usuário, auditoria) → migration → seed do admin → telas de login e primeiro acesso.
