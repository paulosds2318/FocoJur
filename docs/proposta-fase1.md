# FocoJur: Proposta da Fase 1

16/11/2026 · Lailson de Lima Sobral (DUO Technology)

O FocoJur vai substituir a planilha Contencioso e o Planner "Rotina Jurídico" por uma plataforma única. Ela captura, cadastra e acompanha os processos contra a Foco (Cível, Procon e Trabalhista), e a planilha e o Planner são aposentados já na Fase 1.

---

## 1. Contexto e problema

**Como o time trabalha hoje**

- **Captura antecipada:** o Projuris (pago) busca, nos tribunais e no diário oficial, processos com o nome da Foco, o CNPJ e outros termos ligados à empresa. Isso antecipa a informação, porque a citação oficial chega bem depois.
- **Complemento manual:** quando a captura é antecipada, a advogada entra no portal de cada tribunal para buscar os dados do processo. Os portais são PJe (PA, PE, PI, PB), eProc, Projudi, Processo Eletrônico do TJRJ, Portal do Advogado (SE) e eSaj. PJe e eProc concentram o maior volume.
- **Domicílio Judicial Eletrônico:** traz distribuições e intimações dos processos em curso, já com os dados.
- **Diário oficial:** traz as movimentações dos processos em aberto.
- **Registro:** os dados são digitados na planilha Contencioso, e as tarefas e prazos vão para o Planner.
- **Equipe:** 3 advogadas em rodízio diário (uma por dia). Acompanham em média 190 processos com movimentação por dia e cadastram cerca de 60 processos novos por semana.

**Problema central:** a mesma informação é buscada em vários portais, digitada à mão numa planilha de 64 colunas e repetida no Planner, sem ligação entre os dois. O resultado é retrabalho, campos vazios e indicadores montados à mão.

---

## 2. Diagnóstico da planilha Contencioso e do Planner

Base analisada: arquivo `CONTENCIOSO 06.11.xlsx` e um print do Planner, ambos enviados pelo jurídico.

### Volume

| Carteira | Linhas na aba atual | Ativos (ATIVO = SIM) |
|---|---|---|
| Cível 2026 | 3.644 | 1.380 |
| Procon | 513 | 348 |
| Trabalhista 2026 | 357 | 113 |

Processos cíveis por ano de recebimento: 213 (2022), 467 (2023), 831 (2024), 975 (2025) e 1.114 (2026 até 06/11). **O volume cresce todo ano.**

A planilha tem 35 abas, entre elas: carteiras ativas, abas de encerrados por ano (2018 a 2022), Polo Ativo, Processos de Parceiros, Fiscal, Sinistros, Consulta e abas de indicadores (Gráficos, Painel Inicial, Indicadores Procon).

### O que já funciona bem (e deve ser preservado)

- Prognóstico (possível, provável, remoto) e valor de risco separado em dano material e dano moral. Valor de risco somado dos cíveis ativos: cerca de R$ 55,7 milhões.
- Taxonomia de objeto da ação já em uso. Os mais frequentes entre os ativos: acidente de trânsito (294), 404 (199), defeito no veículo (155), no show (117) e veículo recuperado (65).
- Análise de causa raiz: "O processo era evitável pela Foco?" (283 marcados como SIM entre os ativos) e "Detalhe do erro e qual seria a solução".
- Vínculo com o negócio: loja/centro de custo, tipo de locação (RAC, APP, Flex), origem da reserva, placa e modelo.
- Financeiro do processo: valor pago, ticket SENS, custas, honorários, custo com correspondentes e escritório externo.

### Problemas que o sistema resolve

| Problema | Evidência | Como o FocoJur resolve |
|---|---|---|
| Campos importantes vazios | Advogada responsável em 8% das linhas, valor da causa em 5%, placa e modelo em 7% | Preenchimento automático pela captura (capa do processo) e pelo sistema de locação (contrato) |
| Mesmo valor escrito de formas diferentes | "ESAJ / E-SAJ", "PROJUDI / PROUJDI", "DOMICÍLIO / DOMICILIO" | Listas fechadas no lugar de texto livre |
| Datas incoerentes | 31 processos com ano de recebimento 2027 | Validação na entrada |
| Status contraditório | 393 linhas com ATIVO = SIM e status ENCERRADO | Regra única de status (a confirmar com o jurídico) |
| Contrato escondido em texto livre | Códigos como "AJU004343-25" e "SDU008174-26" no detalhamento | Campo próprio de contrato, com busca automática de loja, placa, modelo e tipo de locação |
| Indicadores montados à mão | Abas de tabela dinâmica | Painéis atualizados sozinhos |

### Planner "Rotina Jurídico"

- Funciona como agenda de prazos e tarefas: cerca de 2.000 tarefas sem bucket e 1.066 em "Tarefas pendentes", além de buckets como "Audiências e Contestações", "Diretoria Geral e Sócios", "Regularização de lojas" e "Armazenamento dos Contratos".
- As tarefas trazem o número do processo no título (ex.: "INTERPOR RR - 0100584-60.2025.5.01.0062") e uma data, com várias responsáveis.
- **Não existe ligação entre o Planner e a planilha.** O processo vive num lugar e o que precisa ser feito nele, em outro.

---

## 3. Referências de mercado

| Plataforma | Foco | O que aproveitar no FocoJur |
|---|---|---|
| [Projuris](https://www.projuris.com.br/) (já contratado pela Foco) | Departamento jurídico de empresa | Captura via Oystr; visão de carteira e risco (Deep Legal); IA conversacional com link para o registro; módulos Acordos e Presto (cofre de certificados) |
| [Expedit](https://www.expedit.com.br/) | Gestão e controladoria | Ciclo captura → ficha → publicação → prazo → agenda; tarefa com responsável e revisor; histórico de alterações; cofre de credenciais (OnePass) |
| [Freelaw](https://www.freelaw.ai/) | IA sobre publicações | IA lê a publicação e devolve prazo, fundamento legal e grau de confiança; resumo diário; revisão humana sempre; canal pelo WhatsApp |

**O diferencial que nenhuma delas entrega:** ligar o processo ao contrato, à loja e ao veículo da Foco, e transformar o contencioso em causa raiz para Operações e Atendimento. É isso que justifica construir.

Preço de referência: Expedit Firm custa R$ 1.190/mês (15 usuários, 1.500 processos). Com cerca de 1.800 processos ativos nas três carteiras, a Foco ficaria acima desse plano.

---

## 4. Decisões

### Tomadas

| # | Decisão | Escolha | Data |
|---|---|---|---|
| 1 | Abrangência da Fase 1 | Cível, Procon e Trabalhista desde o início | 13/11/2026 |
| 2 | Planner | Trazer as tarefas para dentro do FocoJur na Fase 1 e aposentar o Planner | 13/11/2026 |
| 3 | Histórico | Migrar tudo (inclusive as abas de anos anteriores), com limpeza | 13/11/2026 |
| 5 | Onde construir | Aplicação separada (fora do Foco OS) | 13/11/2026 |
| 6 | IA na Fase 1 | Sim: resumo de movimentação + sugestão de prazo, sempre com confirmação da advogada | 13/11/2026 |
| 7 | Stack e hospedagem | Next.js, PostgreSQL, Better Auth, hospedagem na AWS. Roda local para testes enquanto o ambiente AWS é preparado | 13/11/2026 |
| 8 | Login | E-mail e senha; o admin cria a conta com senha temporária e o usuário cria a senha definitiva no primeiro acesso (sem cadastro aberto) | 13/11/2026 |
| 9 | Provedor de IA | OpenRouter, com o admin escolhendo o modelo em tela; página de monitoramento de custos (R$ e US$) e tokens | 13/11/2026 |
| 10 | ORM | Drizzle | 13/11/2026 |
| 11 | Escolha de modelo | Um modelo por tarefa de IA, com modelo reserva | 13/11/2026 |
| 12 | Câmbio US$ → R$ | PTAX diária do Banco Central, automática, com ajuste manual do admin | 13/11/2026 |
| 13 | Política de dados na IA | Só provedores que não guardam nem treinam com os dados (LGPD) | 13/11/2026 |
| 4 | Captura antecipada | Continua no **Projuris**. O FocoJur recebe os processos pela API do Projuris (se existir), por importação em lote (Excel/CSV) ou pelo cadastro do número, e assume o **monitoramento** (DJEN por termos, DataJud, Domicílio), a triagem e as tarefas | 16/11/2026 |
| 14 | Enriquecimento nos portais | Robô híbrido (opção C): roteiro Playwright para navegar + IA para extrair os dados; piloto em eProc e PJe de 1 tribunal; captcha nunca contornado | 13/11/2026 |

Detalhes técnicos na seção 11.

### Em aberto

| # | Pergunta | Situação |
|---|---|---|
| 4a | O contrato do Projuris inclui API? Se não, permite exportar os processos capturados em Excel/CSV? | Aguardando o jurídico. Define como os processos entram: API (automático), importação em lote ou cadastro do número |

**Monitoramento no modelo do Expedit:** o FocoJur monitora por **termos** no DJEN (CNPJ, nome da Foco, OAB das advogadas), conferindo o documento para evitar homônimos. Publicações de processos ainda não cadastrados viram item na caixa de entrada automaticamente, funcionando como uma segunda rede de captura além do Projuris. Tudo passa por uma **tela de triagem** (vincular, criar prazo ou descartar com motivo); cada processo tem chave de monitoramento, e processos sem movimentação há mais de 90 dias recebem o alerta de **carteira parada**.

### Como a IA entra na Fase 1

| Uso | O que faz | Controle humano |
|---|---|---|
| Resumo de movimentação | Lê a publicação ou intimação e resume em 2 a 3 linhas | Advogada marca como lida |
| Sugestão de prazo | Indica o tipo de ato, o prazo, o fundamento legal e um grau de confiança | Nenhuma tarefa nasce sem confirmação da advogada |
| Classificação na entrada | Sugere objeto, pedido e prognóstico a partir da inicial | Advogada confirma ou corrige; a correção alimenta melhorias |
| Extração do contrato | Encontra o código do contrato no texto (ex.: "AJU004343-25") | Validado contra o sistema de locação |

---

## 5. Escopo da Fase 1

| Módulo | O que faz | Substitui |
|---|---|---|
| **1. Caixa de entrada** | Junta os processos capturados (Projuris por API ou importação em lote, Domicílio, DJEN por termos) e os de Procon cadastrados à mão; elimina duplicados; a advogada do dia confirma e completa | Busca manual nos portais |
| **2. Ficha do processo** | Núcleo comum + campos específicos de Cível, Trabalhista e Procon; listas fechadas; vínculo com contrato, loja e veículo; histórico de alterações | Planilha Contencioso |
| **3. Monitoramento e triagem** | Monitoramento diário (DJEN por termos, DataJud, Domicílio, robô); tela de triagem para vincular, criar prazo ou descartar; chave de monitoramento por processo; alerta de carteira parada; resumo por IA (decisão 6) | Leitura do diário oficial |
| **4. Tarefas e prazos** | Cada movimentação pode virar tarefa com prazo, responsável e revisor; quadro por etapa (equivalente aos buckets); fila da advogada do dia; alertas de vencimento | Planner |
| **5. Financeiro do processo** | Valores pagos, tickets SENS, custas, honorários, correspondentes e escritório externo | Colunas financeiras da planilha |
| **6. Painéis** | Contingência (risco por prognóstico), entradas e encerramentos por período, causa raiz por loja e objeto, casos evitáveis, indicadores Procon | Abas Gráficos, Painel Inicial e Indicadores Procon |
| **7. Administração** | Criação de usuários (senha temporária) e perfis, listas oficiais (objeto, motivo de encerramento, status), termos monitorados, auditoria | Nada (não existe hoje) |
| **8. IA: modelos e custos** | Admin escolhe o modelo de cada tarefa de IA entre os disponíveis no OpenRouter; painel de custos (R$ e US$) e tokens por período, tarefa, modelo e usuário; limite mensal com alerta | Nada (não existe hoje) |

Ficam para depois: Polo Ativo, Fiscal, Processos de Parceiros e Consulta são migrados como dados, mas sem fluxos próprios na Fase 1 (a confirmar com o jurídico).

---

## 6. Fontes de dados e integrações

| Fonte | O que traz | Carteira | Status |
|---|---|---|---|
| Projuris (decisão 4) | Processos capturados antecipadamente | Cível, Trabalhista | API, se o contrato incluir; senão importação em lote (Excel/CSV) ou cadastro do número |
| [Domicílio Judicial Eletrônico](https://www.cnj.jus.br/wp-content/uploads/2025/02/manual-domicilio-ed3-2025-1.pdf) (CNJ) | Citações e intimações oficiais | Cível, Trabalhista | Validar acesso por sistema com credencial da empresa |
| DJEN (Diário de Justiça Eletrônico Nacional, CNJ) | Publicações e intimações, monitoradas por termos (CNPJ, nome, OAB) | Cível, Trabalhista | Validar API |
| [DataJud](https://www.cnj.jus.br/wp-content/uploads/2023/05/tutorial-api-publica-datajud-beta.pdf) (API pública do CNJ) | Movimentações por número do processo | Cível, Trabalhista | Gratuita; não busca por parte |
| Portais dos tribunais (robô, decisão 14) | Dados de capa e movimentações de processo já conhecido pelo número | Cível, Trabalhista | Piloto em eProc e PJe de 1 tribunal; expansão conforme resultado |
| Portais Procon (Procon SP, ProConsumidor, físicos) | Reclamações | Procon | Cadastro manual assistido na Fase 1 |
| Sistema de locação da Foco | Contrato, loja, placa, modelo, tipo de locação, origem da reserva | Cível, Procon | Definir com o time do sistema |
| Microsoft Graph (Planner) | Tarefas existentes | Todas | Só para a migração |
| SENS | Tickets de pagamento | Todas | Avaliar integração ou manter manual |

Fluxo: as fontes alimentam a caixa de entrada → a advogada confirma → nasce a ficha do processo → as movimentações chegam todo dia → viram tarefas e prazos → os painéis leem tudo da mesma base.

---

## 7. Modelo de dados proposto

| Entidade | Principais campos | Origem na planilha |
|---|---|---|
| **Processo** (núcleo) | número CNJ, carteira (Cível, Trabalhista, Procon), sistema/portal, foro, UF, comarca, vara, status, status para contingência, datas de recebimento, citação e encerramento, motivo de encerramento | Colunas comuns às três abas |
| **Extensão Cível** | pedido, objeto, objeto secundário, detalhamento, origem da reserva, contrato assinado, tipo de locação, evitável (S/N), erro e solução, motivo real da negativa 404 / no-show | Aba Cível 2026 |
| **Extensão Trabalhista** | função, tipo de demissão, admissão, demissão, pedidos, liderança/regional, limite de acordo | Aba Trabalhista 2026 |
| **Extensão Procon** | tipo (digital, físico), órgão, número de acompanhamento, contrato/reserva | Aba Procon |
| **Risco** | prognóstico, valor de risco, dano material, dano moral, valor da causa, histórico de revisões | Colunas de risco |
| **Parte** | nome, documento, polo, advogado | Demandante, demandadas, advogado do autor |
| **Contrato / Locação** | código do contrato, loja/centro de custo, placa, modelo, uso por motorista de app | Detalhamento (extraído), placa, modelo, centro de custo |
| **Movimentação** | data, fonte, texto, resumo IA, lida por, gerou tarefa | Nova |
| **Tarefa / Prazo** | título, tipo (audiência, contestação, recurso, pagamento etc.), prazo, responsável, revisor, status | Planner |
| **Lançamento financeiro** | tipo (condenação, acordo, custas, honorários, correspondente), valor, ticket SENS, data | Colunas financeiras |
| **Escritório externo** | nome, data de envio, valores faturados | Colunas de escritório |
| **Listas oficiais** | objeto, motivo de encerramento, status, tipo de audiência, recebedor, sistema | Valores normalizados da planilha |

---

## 8. Migração

**Planilha Contencioso (histórico completo, decisão 3)**

1. Mapear cada aba para a entidade e a carteira correspondentes (inclusive as abas de encerrados de 2018 a 2022).
2. Normalizar valores (sistema, recebedor, objeto, status) contra as listas oficiais aprovadas pelo jurídico.
3. Extrair o código do contrato do campo de detalhamento e enriquecer com o sistema de locação.
4. Tratar inconsistências: anos futuros, ATIVO × ENCERRADO, duplicados entre abas.
5. Gerar um relatório de exceções para o jurídico validar antes da virada.

**Planner**

1. Exportar as tarefas via Microsoft Graph.
2. Ligar cada tarefa ao processo pelo número CNJ no título.
3. Migrar as tarefas abertas com prazo e responsável. As concluídas viram histórico do processo.
4. Tarefas sem número de processo (ex.: "Regularização de lojas", "Diretoria Geral e Sócios") vão para uma área de tarefas gerais ou ficam fora (a decidir com o jurídico).

**Virada:** um período curto de operação em paralelo, depois a planilha e o Planner passam a ser só leitura.

---

## 9. Roadmap

| Etapa | Entrega | Critério para avançar |
|---|---|---|
| **1a. Base** | Ficha do processo (3 carteiras), listas oficiais, migração da planilha, tarefas e prazos, migração do Planner | Jurídico opera sem planilha e sem Planner |
| **1b. Captura e monitoramento** | Caixa de entrada com a entrada do Projuris, monitoramento por termos, triagem, Domicílio, movimentações diárias, robô de enriquecimento nos portais (piloto) e vínculo com o sistema de locação | Processos novos chegam sem digitação manual dos dados de capa; piloto do robô com ≥ 90% de acerto |
| **1c. Inteligência** | Painéis, resumo de movimentação e sugestão de prazo por IA | Indicadores sem tabela dinâmica; prazos sugeridos revisados pelas advogadas |
| **Fase 2** | Elaboração de defesa e recursos com IA a partir do processo e dos dados da locação; controle de prazos completo; apoio a acordos | A definir |
| **Fase 3** | Sinistro (já existe uma aba Sinistros na planilha) | A definir |

A etapa 1a pode começar sem a decisão 4. O módulo 8 (IA: modelos e custos) entra na etapa 1c, junto com os primeiros usos de IA. Datas e esforço por etapa estão no documento Estimativa e Cronograma (início em 23/11/2026, virada da 1a na semana de 22/02/2027, fim da Fase 1 em 07/06/2027).

---

## 10. Riscos, premissas e próximos passos

**Riscos**

- **Entrada do Projuris:** sem API nem exportação, os processos capturados precisam ter o número cadastrado à mão no FocoJur (o resto é completado e monitorado automaticamente).
- **Adoção:** aposentar o Planner na Fase 1 exige que o módulo de tarefas esteja pronto no dia da virada.
- **Qualidade do histórico:** a limpeza pode revelar regras de negócio não documentadas (ex.: o significado da coluna ATIVO).
- **Dados sensíveis:** processos trabalhistas e valores de risco pedem perfis de acesso bem definidos.
- **Robô nos portais:** captcha, restrição de acesso ou mudança de tela podem reduzir a cobertura. Mitigação: piloto com métricas antes de expandir, e a extensão no navegador da advogada (opção D) como alternativa.

**Premissas**

- O jurídico valida as listas oficiais e o relatório de exceções da migração.
- O time do sistema de locação disponibiliza consulta por código de contrato.

**Próximos passos**

- [ ] Jurídico: confirmar se o contrato do Projuris inclui API; se não, se permite exportar em Excel/CSV (e com quais colunas)
- [ ] Jurídico: indicar quem tem a credencial da Foco no Domicílio Judicial Eletrônico
- [ ] Jurídico: explicar a coluna ATIVO quando o status é ENCERRADO
- [ ] Jurídico: aprovar a taxonomia de objeto e motivo de encerramento como lista oficial
- [ ] Jurídico: dizer quem consome os indicadores (diretoria, Controladoria)
- [ ] Jurídico: enviar a lista de termos monitorados no DJEN: CNPJs do grupo, nomes usados nos diários, OAB das advogadas (até 17/03/2027)
- [ ] Jurídico: avaliar os termos de uso dos portais do piloto e escolher o tribunal PJe (até 31/03/2027)
- [x] DUO: decidir onde construir (aplicação separada) e se haverá IA na Fase 1 (sim)
- [x] DUO: decidir stack/hospedagem, login e provedor de IA (questões 7, 8 e 9)
- [x] DUO: decidir ORM, escolha de modelo, câmbio e política de dados na IA (questões 10 a 13)
- [ ] DUO: definir com a infraestrutura os serviços AWS (aplicação, banco, e-mail, arquivos)
- [ ] DUO: validar o acesso ao DJEN, ao DataJud e à consulta de contratos
- [x] DUO: estimar esforço e datas das etapas 1a, 1b e 1c (ver Estimativa e Cronograma)

---

## 11. Arquitetura técnica

### Stack

| Camada | Escolha | Observação |
|---|---|---|
| Aplicação | Next.js (App Router) | Front-end e back-end no mesmo projeto |
| Banco | PostgreSQL | Local via Docker; na AWS, banco gerenciado (ex.: RDS) |
| ORM | Drizzle | Decisão 10 |
| Autenticação | Better Auth | E-mail e senha, cadastro aberto desligado, contas criadas pelo admin |
| IA | OpenRouter | Um único contrato dá acesso a vários modelos; custo e tokens vêm em cada resposta |
| Rotinas agendadas | Jobs para captura, movimentações e câmbio | Local: cron no próprio ambiente; AWS: agendador gerenciado |
| E-mail | Alertas (prazos, custo de IA, falha de conector) | Local: caixa de teste (ex.: Mailpit); AWS: serviço de e-mail (ex.: SES) |
| Arquivos | Documentos do processo | Local: disco; AWS: armazenamento de objetos (ex.: S3) |

**Ambientes:** começa local (Docker com Postgres e caixa de e-mail de teste) e passa para a AWS quando o ambiente estiver pronto. Toda configuração fica em variáveis de ambiente desde o primeiro dia, para a mudança ser só de configuração.

### Por que Drizzle (decisão 10)

| Critério | Drizzle | Prisma |
|---|---|---|
| Estilo | Próximo do SQL, schema em TypeScript | Schema próprio (`schema.prisma`), mais abstrato |
| Consultas analíticas (painéis, contingência) | Mais natural, por estar perto do SQL | Exige SQL cru com mais frequência |
| Peso em execução | Leve | Mais pesado |
| Curva de aprendizado | Exige conhecer SQL | Mais fácil para quem não domina SQL |
| Better Auth | Suportado | Suportado |

**Escolhido: Drizzle.** O FocoJur tem muitos painéis e consultas de carteira, e o time já trabalha com Postgres.

### Criação de usuário e primeiro acesso (decisão 8)

1. O admin cria o usuário com nome, e-mail (login) e perfil (Admin, Advogada ou Leitura).
2. O sistema gera uma senha temporária, mostrada uma única vez ao admin, com validade de 72 horas. O admin passa a senha à pessoa por um canal seguro.
3. No primeiro login com a senha temporária, a pessoa é levada à tela "Crie sua senha definitiva" e não acessa nada antes de concluir.
4. "Esqueci minha senha" é resolvido pelo admin, que gera uma nova senha temporária. O admin também desativa e reativa usuários. Tudo fica na auditoria.

O acesso não depende de envio de e-mail, o que simplifica o ambiente local e a etapa 0.

Recomendações: regra mínima de senha, bloqueio após tentativas erradas e, como evolução, segundo fator (2FA), que o Better Auth já suporta.

### IA via OpenRouter (decisão 9)

**Escolha de modelo pelo admin**

- O sistema carrega a lista de modelos do OpenRouter, com preço por milhão de tokens de entrada e saída.
- **Decisão 11:** o admin escolhe um modelo por tarefa (resumo, sugestão de prazo, classificação, extração de contrato), mais um modelo reserva caso o principal falhe. Tarefas diferentes pedem modelos diferentes: extrair um código de contrato não precisa do mesmo modelo que sugerir um prazo.
- Toda troca de modelo fica registrada (quem, quando, de qual para qual), para comparar o desempenho antes e depois.
- Para medir qualidade, e não só custo: a taxa de aceite das advogadas (prazo sugerido confirmado sem correção) por modelo vira o principal indicador.

**Política de dados (decisão 13):** o OpenRouter permite restringir as chamadas a provedores que não armazenam nem usam os dados para treino. Como há dados pessoais (principalmente nos processos trabalhistas), essa restrição fica sempre ligada e o admin só vê os modelos compatíveis.

### Painel de custos de IA

Cada resposta do OpenRouter já traz tokens e custo, sem chamada extra ([documentação](https://openrouter.ai/docs/guides/administration/usage-accounting)). O FocoJur grava um registro por chamada:

| Campo gravado | Uso no painel |
|---|---|
| Data e hora, usuário, tarefa de IA, processo | Filtros e rateio por área ou por tarefa |
| Modelo e provedor | Comparar modelos |
| Tokens de entrada, saída e cache | Volume consumido |
| Custo em US$ (créditos do OpenRouter) | Custo original |
| Cotação do dia e custo em R$ | Custo para o orçamento da Foco |
| Tempo de resposta e status (sucesso ou erro) | Desempenho |
| Aceite da advogada (quando houver) | Qualidade por modelo |

**O que o admin vê:** custo do dia, do mês e projeção do mês (R$ e US$); custo e tokens por tarefa, por modelo e por usuário; custo médio por processo; tempo médio de resposta e taxa de erro por modelo; taxa de aceite por modelo; saldo de créditos no OpenRouter; limite mensal configurável com alerta (ex.: 80% e 100%).

**Câmbio (decisão 12):** PTAX diária do Banco Central, buscada automaticamente, com possibilidade de o admin fixar uma cotação. O custo em R$ de cada chamada usa a cotação do dia da chamada, para o histórico não mudar quando o dólar variar.

---

**Fontes:** [Projuris](https://www.projuris.com.br/) · [Expedit](https://www.expedit.com.br/) · [Freelaw](https://www.freelaw.ai/) · [Manual do Domicílio Judicial Eletrônico (CNJ)](https://www.cnj.jus.br/wp-content/uploads/2025/02/manual-domicilio-ed3-2025-1.pdf) · [Tutorial API DataJud (CNJ)](https://www.cnj.jus.br/wp-content/uploads/2023/05/tutorial-api-publica-datajud-beta.pdf) · [OpenRouter: Usage Accounting](https://openrouter.ai/docs/guides/administration/usage-accounting) · Planilha CONTENCIOSO 06.11.xlsx · Print do Planner "Rotina Jurídico"
