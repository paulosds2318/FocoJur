# FocoJur: Estimativa e Cronograma da Fase 1

16/11/2026 · Lailson de Lima Sobral (DUO Technology) · Revisão 3: captura pelo Projuris + monitoramento no FocoJur

A Fase 1 completa leva cerca de **133 dias úteis (aproximadamente 6,5 meses)**, de **23/11/2026 a 07/06/2027**, com 1 desenvolvedor usando Claude Code. A planilha Contencioso e o Planner são aposentados na **virada da etapa 1a, prevista para a semana de 22/02/2027**.

---

## Premissas

- **Equipe:** 1 desenvolvedor dedicado, usando Claude Code. Lailson coordena, valida com o jurídico e destrava as dependências.
- **Esforço:** as estimativas já consideram o ganho do Claude Code em código repetitivo (telas de cadastro, schema, testes). Integrações externas, robô de portais e migração de dados dependem de terceiros e ganham menos.
- **Contingência:** 15% em cada etapa (1a, 1b e 1c).
- **Calendário:** dias úteis, sem 24/12, 25/12, 31/12, 01/01, Carnaval (08 e 09/02/2027), Sexta-feira Santa (26/03/2027) e Tiradentes (21/04/2027).
- **Ambiente:** desenvolvimento local até o deploy na AWS, previsto para o fim da etapa 1a.
- **Robô nos portais (opção C):** a Fase 1 inclui o robô e um piloto em 2 portais (eProc e PJe de 1 tribunal). A expansão para os demais portais é estimada depois do piloto, com base nos resultados.

---

## Resumo por etapa

| Etapa | Entrega | Esforço (dias úteis) | Com contingência | Início | Fim |
|---|---|---|---|---|---|
| **0. Setup** | Projeto, banco local, login com usuário criado pelo admin, layout base | 5 | 5 | 23/11/2026 | 27/11/2026 |
| **1a. Base** | Cadastro, tarefas, financeiro, migração, deploy AWS, virada | 46 | 53 | 30/11/2026 | 18/02/2027 |
| **1b. Captura e monitoramento** | Caixa de entrada, entrada do Projuris, monitoramento (DJEN por termos, DataJud, Domicílio), triagem, camada de IA, robô de portais (piloto), sistema de locação | 45 | 52 | 19/02/2027 | 05/05/2027 |
| **1c. Inteligência** | IA nas telas, painel de custos, painéis de negócio | 20 | 23 | 06/05/2027 | 07/06/2027 |
| **Total** | | **116** | **133** | | |

**O que mudou na revisão 2:** entram o robô de enriquecimento e o piloto (8 dias); a camada OpenRouter passa da etapa 1c para a 1b.

**O que mudou na revisão 3:** a captura antecipada continua no Projuris. O FocoJur recebe os processos pela API do Projuris (se existir) ou por importação em lote, e assume o monitoramento: DJEN por termos (CNPJ, nome, OAB) com criação automática na caixa de entrada, tela de triagem, chave de monitoramento por processo e alerta de carteira parada (+5 dias líquidos). O fim da Fase 1 vai para 07/06/2027; a virada da 1a não muda.

### Marcos

| Data | Marco |
|---|---|
| 27/11/2026 | Ambiente local pronto, com criação de usuário e primeiro acesso funcionando |
| 18/12/2026 | Ficha do processo e lista de processos prontas para a primeira demonstração ao jurídico |
| 04/01/2027 | Tarefas e prazos prontos (substituto do Planner) |
| 21/01/2027 | Histórico da planilha migrado, com relatório de exceções para o jurídico |
| 29/01/2027 | FocoJur rodando na AWS |
| 05/02/2027 | Fim da operação em paralelo |
| **Semana de 22/02/2027** | **Virada: planilha e Planner passam a ser só leitura** |
| 24/03/2027 | Monitoramento por termos e tela de triagem prontos |
| 31/03/2027 | Camada de IA (OpenRouter) pronta, com registro de custo por chamada |
| **12/04/2027** | **Resultado do piloto do robô: decisão de expandir para outros portais** |
| 05/05/2027 | Entrada do Projuris, monitoramento, triagem e robô (piloto) em produção |
| 07/06/2027 | IA nas telas, painel de custos de IA e painéis de negócio em produção (fim da Fase 1) |

---

## Detalhamento por tarefa

| Etapa | Tarefa | Dias | Início | Fim |
|---|---|---|---|---|
| 0 | Repositório, Docker (Postgres + Mailpit), Next.js, Drizzle, padrões de código | 2 | 23/11 | 24/11 |
| 0 | Better Auth: usuário criado pelo admin com senha temporária, primeiro acesso, perfis e layout base | 3 | 25/11 | 27/11 |
| 1a | Modelo de dados, listas oficiais e tela de administração das listas | 4 | 30/11 | 03/12 |
| 1a | Ficha do processo (Cível, Trabalhista, Procon) com histórico de alterações | 8 | 04/12 | 15/12 |
| 1a | Lista de processos, busca e filtros | 3 | 16/12 | 18/12 |
| 1a | Tarefas e prazos: quadro, fila do dia, alertas | 7 | 21/12 | 04/01 |
| 1a | Financeiro do processo | 3 | 05/01 | 07/01 |
| 1a | Usuários, perfis e auditoria | 2 | 08/01 | 11/01 |
| 1a | Migração da planilha: scripts, normalização, relatório de exceções | 8 | 12/01 | 21/01 |
| 1a | Migração do Planner | 3 | 22/01 | 26/01 |
| 1a | Deploy na AWS (com a infraestrutura) | 3 | 27/01 | 29/01 |
| 1a | Homologação com o jurídico e operação em paralelo | 5 | 01/02 | 05/02 |
| 1a | Contingência (15%) | 7 | 10/02 | 18/02 |
| 1b | Arquitetura de conectores, caixa de entrada e eliminação de duplicados | 5 | 19/02 | 25/02 |
| 1b | Conector Domicílio Judicial Eletrônico | 4 | 26/02 | 03/03 |
| 1b | Movimentações diárias (DJEN e DataJud) | 5 | 04/03 | 10/03 |
| 1b | Entrada do Projuris: conector da API ou importação em lote (Excel/CSV) | 4 | 11/03 | 16/03 |
| 1b | Monitoramento por termos no DJEN (CNPJ, nome, OAB) com criação automática na caixa de entrada | 2 | 17/03 | 18/03 |
| 1b | Tela de triagem de publicações e movimentações | 3 | 19/03 | 23/03 |
| 1b | Chave de monitoramento por processo e alerta de carteira parada | 1 | 24/03 | 24/03 |
| 1b | Camada OpenRouter: modelo por tarefa, reserva, política de dados, registro de uso | 4 | 25/03 | 31/03 |
| 1b | Robô de enriquecimento nos portais (opção C): worker Playwright, extração por IA | 4 | 01/04 | 06/04 |
| 1b | Piloto do robô: eProc + PJe de 1 tribunal, 50 processos e medição | 4 | 07/04 | 12/04 |
| 1b | Integração com o sistema de locação | 4 | 13/04 | 16/04 |
| 1b | Rotinas agendadas e monitoramento | 2 | 19/04 | 20/04 |
| 1b | Homologação | 3 | 22/04 | 26/04 |
| 1b | Contingência (15%) | 7 | 27/04 | 05/05 |
| 1c | IA: resumo, sugestão de prazo, classificação, extração de contrato + tela de aceite | 7 | 06/05 | 14/05 |
| 1c | Painel de custos de IA, PTAX e limite mensal | 4 | 17/05 | 20/05 |
| 1c | Painéis: contingência, causa raiz, Procon | 6 | 21/05 | 28/05 |
| 1c | Homologação | 3 | 31/05 | 02/06 |
| 1c | Contingência (15%) | 3 | 03/06 | 07/06 |

---

## Dependências externas (o que precisa chegar e quando)

| Dependência | Responsável | Precisa até | Impacto se atrasar |
|---|---|---|---|
| Listas oficiais aprovadas (objeto, motivo de encerramento, status) | Jurídico | 03/12/2026 | Ficha do processo nasce com listas provisórias e retrabalho na migração |
| Significado da coluna ATIVO e regras de status | Jurídico | 03/12/2026 | Regra de status errada no cadastro e na migração |
| Planilha Contencioso atualizada para a migração | Jurídico | 12/01/2027 | Migração com dados defasados |
| Exportação do Planner (acesso ao Microsoft Graph ou arquivo exportado) | TI / Jurídico | 22/01/2027 | Tarefas abertas digitadas à mão |
| Ambiente AWS pronto (aplicação, banco, arquivos e um serviço para o robô de portais) | Infraestrutura | 27/01/2027 | **Virada da 1a adiada** |
| Resposta sobre o Projuris: tem API? Se não, permite exportar em Excel/CSV? | Jurídico | 19/02/2027 | Sem resposta, a entrada fica só por cadastro manual do número |
| Credencial da Foco no Domicílio Judicial Eletrônico | Jurídico | 26/02/2027 | Conector do Domicílio adiado |
| Conta no OpenRouter com créditos | DUO / Financeiro | 25/03/2027 | Camada de IA e robô adiados |
| Lista de termos monitorados (CNPJs, nomes, OAB das advogadas) | Jurídico | 17/03/2027 | Monitoramento por termos adiado |
| Avaliação dos termos de uso dos portais do piloto (eProc e PJe escolhido) | Jurídico | 31/03/2027 | Piloto adiado |
| Lista de 50 processos para o piloto, com dados conferidos | Jurídico | 07/04/2027 | Sem base para medir acerto |
| Acesso ao sistema de locação (consulta por contrato) | Time do sistema de locação | 13/04/2027 | Vínculo com contrato fica manual |

O caminho crítico da virada continua sendo o **ambiente AWS**. Vale abrir a solicitação à infraestrutura já em novembro.

---

## Opções para encurtar

| Opção | Ganho estimado | Custo / risco |
|---|---|---|
| **A) Segundo desenvolvedor nas etapas 1b e 1c** (ex.: um nos conectores e no robô, outro na IA e nos painéis) | Fim da Fase 1 cerca de 4 semanas antes (meados de maio/2027) | Precisa liberar mais uma pessoa a partir de fevereiro |
| **B) Migrar o histórico encerrado depois da virada** (antes da virada, só os processos ativos) | Virada cerca de 1 semana antes (meados de fevereiro/2027) | Painéis históricos ficam incompletos por algumas semanas |
| **C) Antecipar o resumo de movimentação por IA para a etapa 1b** (a camada de IA já estará pronta lá) | Advogadas usam IA cerca de 1 mês antes | A etapa 1b cresce 2 a 3 dias |
| **D) Manter o plano atual** | Nenhum | Prazo final em 07/06/2027 |
