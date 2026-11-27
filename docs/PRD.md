# PRD: FocoJur, Fase 1

| | |
|---|---|
| **Produto** | FocoJur, plataforma de gestão do contencioso da Foco Aluguel de Carros |
| **Responsável** | Lailson de Lima Sobral (DUO Technology) |
| **Versão** | 1.3, 23/11/2026 (captura pelo Projuris + monitoramento no FocoJur; robô de enriquecimento, opção C; Triagem como única tela de decisão, tarefa com prazo manual, edição de tarefa, intervalo único de captura) |
| **Status** | Aprovado para início do desenvolvimento em 23/11/2026 |
| **Documentos relacionados** | `docs/proposta-fase1.md`, `docs/cronograma.md`, `docs/design/` (protótipo) |
| **Protótipo navegável** | Canvas "FocoJur - Telas da Fase 1": https://claude.ai/artifact/X1jPTPxa6EhXmhj8ug3kUM |

---

## 1. Visão

O FocoJur substitui a planilha **Contencioso** e o Planner **Rotina Jurídico** por uma aplicação web única. Nela o time do Jurídico captura, cadastra e acompanha os processos contra a Foco (Cível, Trabalhista e Procon), com prazos, financeiro, painéis e IA de apoio.

**Diferencial:** cada processo é ligado ao contrato, à loja e ao veículo da Foco. Assim o contencioso vira causa raiz para Operações e Atendimento.

### 1.1 Problema

- A mesma informação é buscada em vários portais, digitada à mão numa planilha de 64 colunas e repetida no Planner.
- Os campos importantes ficam vazios: advogada responsável em 8% das linhas, valor da causa em 5%, placa em 7%.
- Os dados são inconsistentes: grafias diferentes, anos futuros, status contraditórios.
- Os indicadores são montados à mão em tabelas dinâmicas.

### 1.2 Métricas de sucesso da Fase 1

| Métrica | Meta |
|---|---|
| Planilha e Planner em modo somente leitura | Até a semana de 22/02/2027 |
| Piloto do robô de portais (eProc + PJe) | ≥ 90% dos processos com capa completa e correta |
| Processos novos cadastrados sem digitar dados de capa | ≥ 80% após a etapa 1b |
| Campos obrigatórios preenchidos (responsável, valor da causa, objeto, prognóstico, contrato quando aplicável) | ≥ 95% dos processos ativos |
| Prazos perdidos | Zero |
| Taxa de aceite das sugestões de prazo da IA | Medida por modelo; meta definida após 30 dias de uso |

---

## 2. Usuários e perfis

| Perfil | Quem | Pode |
|---|---|---|
| **Admin** | Coordenação do Jurídico e DUO | Tudo, incluindo criação de usuários e senhas temporárias, listas oficiais, modelos de IA, custos de IA e auditoria |
| **Advogada** | 3 advogadas, todas veem o trabalho de todas | Caixa de entrada, processos, tarefas, financeiro do processo e painéis |
| **Leitura** | Diretoria, Controladoria | Consultar processos e painéis; não edita nada |

**Quem captura e quem monitora:** a captura antecipada (descobrir processos novos) continua no **Projuris**. O FocoJur recebe esses processos (API ou importação) e cuida do **monitoramento**, da triagem, das tarefas e dos painéis.

**Sem rodízio (decisão de 24/11/2026):** não existe "advogada do dia". Todas veem tudo e se organizam entre si; o que chega sem responsável fica **sem responsável** até alguém assumir.

**Visibilidade compartilhada (decisão de 24/11/2026):** todos os perfis veem **todos** os processos e todas as tarefas, de todas as advogadas. O responsável do processo ou da tarefa **não restringe o acesso**: serve para distribuir o trabalho e para os filtros opcionais "Minhas" e "Responsável" (inclui "Sem responsável"). Qualquer advogada pode editar e reatribuir tarefa de outra; o histórico registra quem fez.

---

## 3. Escopo

### 3.1 Dentro da Fase 1

| Etapa | Módulos | Período |
|---|---|---|
| **0. Setup** | Projeto, banco, autenticação (usuário criado pelo admin), layout | 23/11 a 27/11/2026 |
| **1a. Base** | Ficha do processo, listas oficiais, processos, tarefas e prazos, financeiro, usuários e auditoria, migração (planilha e Planner), deploy AWS | 30/11/2026 a 18/02/2027 |
| **1b. Captura e monitoramento** | Caixa de entrada, entrada do Projuris (API ou importação em lote), monitoramento (DJEN por termos, DataJud, Domicílio), triagem, camada OpenRouter, robô de enriquecimento com piloto (seção 9.4), sistema de locação, rotinas agendadas | 19/02 a 05/05/2027 |
| **1c. Inteligência** | Tarefas de IA nas telas, admin de modelos, painel de custos de IA, painéis de negócio | 06/05 a 07/06/2027 |

### 3.2 Fora da Fase 1

- Elaboração de defesa e recursos com IA (Fase 2).
- Sinistro (Fase 3).
- Peticionamento eletrônico nos tribunais.
- Fluxos próprios para Polo Ativo, Fiscal, Processos de Parceiros e Consulta: os dados são migrados, mas sem telas específicas.
- Aplicativo móvel: a aplicação deve ser responsiva, sem app nativo.
- SSO corporativo: o login é por e-mail e senha.

---

## 4. Stack e convenções

| Camada | Escolha | Observação |
|---|---|---|
| Linguagem | TypeScript (strict) | |
| Aplicação | Next.js (App Router), Server Components e Server Actions | Route Handlers só para webhooks e jobs |
| UI | Tailwind CSS + shadcn/ui | **Recomendado; confirmar.** Tokens da seção 4.2 |
| Banco | PostgreSQL 16 | Local via Docker; AWS: banco gerenciado (RDS) |
| ORM | Drizzle ORM + drizzle-kit (migrations versionadas) | |
| Autenticação | Better Auth (e-mail e senha), cadastro público desligado | Contas criadas só pelo admin, com senha temporária e troca obrigatória no primeiro acesso (seção 6.7) |
| Validação | Zod em toda entrada (forms, actions, respostas da IA) | |
| Filas e agendamento | pg-boss (fila sobre o próprio Postgres) | **Recomendado; confirmar.** Não exige infraestrutura extra local nem na AWS |
| E-mail | Nodemailer via SMTP, só para alertas (prazos, custo de IA, falha de conector) | Local: Mailpit; AWS: SES via SMTP. O acesso não depende de e-mail |
| Arquivos | Interface de storage com driver local (disco) e S3 | |
| IA | OpenRouter (API compatível com OpenAI) | Seção 8 |
| Robô de portais | Playwright (Chromium sem tela) em um worker separado do Next.js | Seção 9.4. Local: processo Node; AWS: container próprio |
| Testes | Vitest (unitários e integração) + Playwright (fluxos principais) | |
| Pacotes | pnpm | |

### 4.1 Estrutura de pastas sugerida

```
focojur/
  CLAUDE.md
  docker-compose.yml          # postgres + mailpit
  .env.example
  drizzle.config.ts
  docs/
    PRD.md
    proposta-fase1.md
    cronograma.md
    design/                   # protótipo de referência (.dc.html)
  src/
    app/
      (auth)/login, (auth)/primeiro-acesso
      (app)/inicio, caixa-entrada, triagem, tarefas, processos, processos/[id], paineis
      (app)/admin/usuarios, admin/listas, admin/ia, admin/ia/custos
      api/jobs/..., api/webhooks/...
    components/               # ui (shadcn) + componentes de domínio
    db/
      schema/                 # um arquivo por domínio
      migrations/
      seed/
    lib/
      auth/                   # better-auth config, rbac
      ai/                     # cliente OpenRouter, tarefas, prompts, schemas
      connectors/             # domicilio, djen, datajud, captura, locacao
      portals/                # robô: um adaptador por portal (eproc, pje-<tribunal>...)
      jobs/                   # pg-boss
      fx/                     # PTAX
      audit/
    server/                   # casos de uso (services) chamados pelas actions
  worker/                     # processo que consome a fila do robô (Playwright)
  scripts/
    migracao/                 # planilha e planner
  tests/
```

### 4.2 Identidade visual (Foco)

| Token | Valor | Uso |
|---|---|---|
| `brand` | `#F20000` | Marca, destaques grandes; nunca texto pequeno sobre branco |
| `primary` | `#C20000` | Botões primários, item ativo do menu, links |
| `primary-hover` | `#A30000` | Hover e active |
| `bg` | `#F6F6F7` | Fundo da aplicação |
| `surface` | `#FFFFFF` | Cards, tabelas |
| `border` | `#E4E4E7` | Bordas |
| `text` | `#1F1F1F` | Texto principal |
| `text-muted` | `#5A5A5A` | Texto secundário (contraste ≥ 4,5:1) |
| `ai` | `#5C2A6B` (texto) sobre `#FBF8FC` | Blocos de sugestão da IA |
| `ok` | `#04625D` sobre `#DDF3F1` | Sucesso, concluído |
| `warn` | `#5E4700` sobre `#FFF1C2` | Atenção, prazos próximos |
| `danger` | `#A30000` sobre `#FDE5E5` | Atrasado, hoje, erro |
| Fonte | Nunito (substituta web da Omnes) | 400, 600, 700, 800 |
| Raio | 10px (controles), 14px (cards) | |

**Por que `#C20000` nos botões:** branco sobre `#F20000` não atinge o contraste mínimo de 4,5:1 para texto de 14px. O vermelho institucional fica para a marca e para elementos grandes.

### 4.3 Convenções

- Idioma da interface: português (pt-BR). Código e nomes de tabelas em inglês; rótulos de listas oficiais em português.
- Datas no banco em UTC (`timestamptz`); exibição em `America/Sao_Paulo`. Prazos processuais em `date`.
- Valores monetários em `numeric(14,2)`; custos de IA em `numeric(14,6)`.
- Toda alteração em entidades de negócio grava auditoria (seção 6.8).
- Nenhuma regra de negócio em componentes de UI: ficam em `src/server`.

---

## 5. Modelo de dados

Os nomes são sugestões para o schema Drizzle. `id` é `uuid` com default aleatório; todas as tabelas têm `created_at` e `updated_at`.

### 5.1 Acesso

| Tabela | Campos principais |
|---|---|
| `user`, `session`, `account`, `verification` | Gerenciadas pelo Better Auth. `user` ganha `role` (`admin`, `lawyer`, `viewer`), `active` (bool), `rotation_order` (int, nulo = fora do rodízio), `must_change_password` (bool), `temp_password_expires_at` (timestamptz), `created_by` |
| `audit_log` | `actor_id` (nulo = sistema), `entity`, `entity_id`, `action` (`create`, `update`, `delete`, `login`, `ai_accept`...), `diff` (jsonb antes/depois), `at` |

### 5.2 Listas oficiais

| Tabela | Campos |
|---|---|
| `lookup` | `type` (enum abaixo), `code`, `label`, `active`, `sort`, `portfolio` (nulo = todas) |

Tipos: `system` (PJe, eProc, Projudi, eSaj, Proc. Eletrônico TJRJ, Portal do Advogado SE), `court_type` (foro/esfera), `status`, `contingency_status`, `subject` (objeto), `claim` (pedido), `closing_reason`, `hearing_type`, `receiver` (recebedor), `rental_type`, `reservation_origin`, `task_type`, `dismissal_type`, `job_role`.

As listas iniciais saem da normalização da planilha (seção 9) e são aprovadas pelo Jurídico.

### 5.3 Processo

| Tabela | Campos principais |
|---|---|
| `case` | `number` (único; CNJ ou nº Procon), `portfolio` (`civil`, `labor`, `procon`), `polarity` (`passive` padrão, `active`), `system_id`, `court_type_id`, `state` (UF), `city`, `court` (vara/órgão), `status_id`, `contingency_status_id`, `owner_id` (advogada responsável), `external_firm` (nulo = interno), `received_at`, `cited_at`, `fact_date`, `closed_at`, `closing_reason_id`, `cost_center` (loja), `details` (texto), `source` (`manual`, `migration`, `domicilio`, `projuris_api`, `import`, `djen_term`, `datajud`), `monitoring` (bool, padrão `true`), `last_movement_at` |
| `case_civil` | `case_id`, `claim_id`, `subject_id`, `subject_secondary_id`, `reservation_origin_id`, `contract_signed` (bool), `rental_type_id`, `avoidable` (bool, nulo = não analisado), `root_cause` (texto), `root_cause_area`, `negative_404_reason` |
| `case_labor` | `case_id`, `job_role_id`, `dismissal_type_id`, `admission_month`, `dismissal_month`, `claims` (texto), `region` |
| `case_procon` | `case_id`, `kind` (`digital`, `physical`), `agency`, `tracking_number` |
| `case_party` | `case_id`, `role` (`plaintiff`, `defendant`, `other_defendant`), `name`, `document`, `lawyer_name` |
| `case_risk` | `case_id`, `prognosis` (`probable`, `possible`, `remote`), `risk_total`, `risk_material`, `risk_moral`, `claim_value`, `settlement_limit`, `reviewed_by`, `reviewed_at` (histórico: uma linha por revisão; a vigente é a mais recente) |
| `rental_link` | `case_id`, `contract_code`, `store`, `plate`, `vehicle_model`, `rental_type`, `app_driver` (bool), `source` (`manual`, `ai`, `rental_system`), `validated_at` |

### 5.4 Movimentações, tarefas e financeiro

| Tabela | Campos principais |
|---|---|
| `movement` | `case_id` (nulo enquanto não vinculada), `source` (`djen`, `domicilio`, `datajud`, `portal`), `external_id` (para não duplicar), `occurred_at`, `title`, `raw_text`, `ai_summary`, `triage_status` (`pending`, `linked`, `task_created`, `discarded`), `discard_reason`, `matched_term_id`, `read_by`, `read_at` |
| `task` | `case_id` (nulo = tarefa geral), `movement_id` (nulo se manual), `type_id`, `title`, `due_date`, `due_time`, `owner_id`, `reviewer_id`, `status` (`todo`, `doing`, `review`, `done`, `cancelled`), `origin` (`manual`, `ai_suggestion`, `migration`), `completed_at` |
| `deadline_suggestion` | `movement_id`, `act_type`, `days`, `day_count` (`business`, `calendar`), `due_date`, `legal_basis`, `confidence` (0 a 1), `ai_call_id`, `decision` (`accepted`, `edited`, `rejected`), `decided_by`, `decided_at`, `final_due_date` |
| `holiday` | `date`, `scope` (`national`, `state`, `city`, `court`), `state`, `city`, `description` |
| `financial_entry` | `case_id`, `kind` (`judgment`, `settlement`, `court_fees`, `deposit`, `attorney_fees`, `correspondent`, `external_firm`), `amount`, `paid_at`, `sens_ticket`, `notes` |

### 5.5 Captura

| Tabela | Campos principais |
|---|---|
| `inbox_item` | `source` (`projuris_api`, `import`, `djen_term`, `domicilio`, `manual`), `import_batch_id`, `external_id`, `captured_at`, `payload` (jsonb), `case_number`, `parsed` (jsonb com dados de capa), `status` (`new`, `in_review`, `possible_duplicate`, `confirmed`, `discarded`), `duplicate_of` (case_id), `reviewed_by`, `case_id` (após confirmação) |
| `connector_run` | `connector`, `started_at`, `finished_at`, `status`, `items_found`, `items_new`, `error` |
| `monitored_term` | `term`, `kind` (`cnpj`, `name`, `oab`), `document` (CNPJ/CPF para conferir homônimo), `active` |
| `import_batch` | `file_key`, `source` (`projuris_export`), `uploaded_by`, `rows_total`, `rows_new`, `rows_duplicate`, `rows_error`, `report` (jsonb) |
| `portal_fetch` | `case_number`, `portal` (`eproc`, `pje_xx`...), `trigger` (`inbox`, `manual`, `scheduled`), `status` (`queued`, `running`, `ok`, `partial`, `blocked_captcha`, `not_public`, `layout_changed`, `error`), `started_at`, `finished_at`, `html_key` (página salva no storage), `screenshot_key`, `extracted` (jsonb), `ai_call_id`, `fields_filled` (int), `navigation` (`script`, `ai_fallback`), `error` |

### 5.6 IA

| Tabela | Campos principais |
|---|---|
| `ai_task_config` | `task` (`movement_summary`, `deadline_suggestion`, `intake_classification`, `contract_extraction`, `portal_extraction`), `primary_model`, `fallback_model`, `updated_by`, `updated_at` |
| `ai_task_config_history` | `task`, `field`, `old_value`, `new_value`, `changed_by`, `changed_at` |
| `ai_model_catalog` | `model_id`, `name`, `prompt_price_usd`, `completion_price_usd` (por token), `context_length`, `data_policy_ok` (bool), `synced_at` |
| `ai_call` | `task`, `model`, `provider`, `user_id`, `case_id`, `generation_id` (OpenRouter), `prompt_tokens`, `completion_tokens`, `cached_tokens`, `reasoning_tokens`, `cost_usd`, `fx_rate`, `cost_brl`, `latency_ms`, `status` (`ok`, `error`, `fallback`), `error`, `accepted` (bool, nulo = sem decisão), `at` |
| `fx_rate` | `date`, `source` (`ptax`, `manual`), `rate`, `set_by` |
| `ai_budget` | `month`, `limit_brl`, `alert_80_sent_at`, `alert_100_sent_at` |

---

## 6. Requisitos funcionais

Cada requisito aponta para a tela de referência em `docs/design/` e no canvas. O protótipo é **referência de layout e conteúdo**, não especificação de pixel: os componentes devem seguir shadcn/ui com os tokens da seção 4.2.

### 6.1 Início (`docs/design/Main.dc.html`)

| ID | Requisito | Critério de aceite |
|---|---|---|
| RF-01 | Mostrar saudação e a data | Sem rodízio nem "advogada do dia" |
| RF-02 | Indicadores: prazos hoje, tarefas atrasadas, processos novos a cadastrar, movimentações não lidas | Contagens batem com as telas de destino; "processos novos" leva à Triagem e "movimentações não lidas" leva a Alertas |
| RF-03 | Tabela "Prazos de hoje e atrasados" com processo, ato, carteira, prazo e responsável | Ordenada por prazo; atrasados primeiro |
| RF-04 | Lista "Movimentações com sugestão da IA" com Confirmar prazo, Ajustar e Recusar (aparece quando a IA gerou sugestões; sem IA o prazo se cria pelo RF-107 na tela Alertas) | Confirmar cria a tarefa e grava `deadline_suggestion.decision = accepted`; Ajustar abre o formulário pré-preenchido e grava `edited`; nada cria tarefa sem clique |

### 6.2 Caixa de entrada (`docs/design/CaixaEntrada.dc.html`), etapa 1b

> **Decisão de 23/11/2026:** a Caixa de entrada passa a ser **somente consulta e visualização** (histórico do que foi capturado, com busca, filtros e o conteúdo das publicações). Todas as ações dos requisitos RF-12 a RF-19b (revisar, aceitar sugestões da IA, confirmar e criar processo, marcar duplicado, descartar, "Buscar no portal", importar do Projuris, cadastrar pelo número) acontecem na **Triagem** (RF-106). Na Caixa, itens pendentes têm o atalho "Classificar na Triagem". Motivo: duas filas parecidas confundiam a advogada; uma só fila de pendências é mais simples.

| ID | Requisito | Critério de aceite |
|---|---|---|
| RF-10 | Listar `inbox_item` com filtros por fonte e situação | Filtros: Todos, Projuris, Domicílio, DJEN por termos, Possível duplicado, Descartados |
| RF-11 | Detectar duplicado pelo número do processo (normalizado) contra `case` e outros itens | Marca `possible_duplicate` e mostra o processo existente |
| RF-12 | Painel de revisão com dados de capa pré-preenchidos e editáveis | Campos: carteira, foro, vara, demandante, valor da causa |
| RF-13 | Sugestões da IA (objeto, pedido, prognóstico) e contrato encontrado, validado no sistema de locação | "Aceitar sugestões" preenche os campos; aceite e edição são auditados |
| RF-14 | Ações: Confirmar e criar processo, É duplicado, Descartar | Confirmar cria `case` + extensão + `rental_link` e abre a ficha |
| RF-15 | Cadastro manual (Procon ou processo sem captura) | Mesmo formulário, `source = manual` |
| RF-16 | Item da caixa de entrada sem dados de capa dispara o robô de enriquecimento (seção 9.4) quando o portal tem adaptador | O painel de revisão mostra a origem ("Dados obtidos pelo robô no eProc às 08:16") e o link para a página salva |
| RF-17 | Botão "Buscar no portal" (hoje **"Buscar dados públicos (DataJud)"**, na Triagem). Sem adaptador de portal liberado, consulta **um** número na API pública oficial do CNJ (DataJud), com uma única consulta curta (no máximo 1 nova tentativa; 429 nunca é repetido) e completa a capa **só onde está vazia** (vara, assunto, data de ajuizamento, sistema, classe); mostra o resultado e a última tentativa. Com adaptador de portal liberado, vale o critério ao lado | Enfileira um `portal_fetch` manual; resultado em até 2 minutos; campos já preenchidos pela advogada nunca são sobrescritos sem confirmação |
| RF-18 | Falha do robô (captcha, processo não público, tela mudou) | Item segue para preenchimento manual com o motivo visível; nenhuma tentativa de contornar captcha |
| RF-19 | Entrada do Projuris por API (se o contrato incluir) | Job periódico traz os processos capturados para a caixa de entrada com `source = projuris_api` |
> **Atualização (26–27/11/2026):** a API oficial com contrato não foi confirmada (ver seção 12, questão 1). Enquanto isso, `src/lib/connectors/projuris.ts` captura pela mesma rota interna que o site do Projuris Empresas usa depois do login (login por usuário/senha da Foco, `PROJURIS_WEB_*`; não documentada publicamente, pode mudar sem aviso). Roda a cada 2 h em dias úteis (`worker/index.ts`). **Distribuições** (processo novo): cada uma entra na Caixa de entrada; a Triagem decide. O campo `ignorada` que a API devolve teve o significado não confirmado (testes reais trouxeram tudo marcado assim) e por isso **não** é usado para descartar automaticamente. **Decisão de 27/11/2026: o Projuris também virou fonte de atualização de processo já conhecido** (módulo Publicações, RF-117/RF-104 continuam valendo); atualização de processo com monitoramento ligado vira alerta (igual DJEN/DataJud), e atualização de processo ainda esperando a Triagem entra agrupada no mesmo item, sem virar alerta sozinha. **DJEN continua ligado ao lado do Projuris** (decisão do mesmo dia, revertendo uma pausa breve); pode haver alerta repetido para a mesma publicação, uma por fonte — a advogada descarta a repetida. `DJEN_ENABLED=false` existe para desligar o DJEN (agendamento e busca manual de termo) se for preciso no futuro; exige reiniciar `pnpm dev` **e** `pnpm worker` para valer em todo lugar.
| RF-19a | Entrada do Projuris por importação em lote (se não houver API) | Botão "Importar do Projuris" aceita Excel/CSV exportado; mapeamento de colunas salvo; relatório com novos, duplicados e erros por linha (`import_batch`) |
| RF-19b | Entrada manual pelo número | A advogada informa só o número; o robô (9.4) e o DataJud completam a capa quando possível |

Na etapa 1a, enquanto a captura não existe, o botão "Novo processo" abre o cadastro manual (RF-15).

### 6.2a Triagem (processos novos) e Alertas (`docs/design/Triagem.dc.html`), etapa 1b

A decisão sobre a captura fica em **duas telas** (decisão de 23/11/2026, porque o fluxo de processos é grande e as duas filas têm natureza diferente): **Triagem** (`/triagem`), com os processos novos para cadastrar (itens abertos da caixa de entrada, RF-106), e **Alertas** (`/alertas`), com as publicações e movimentações dos processos já cadastrados (RF-100 a RF-105, RF-107). Cada item do menu tem o seu selo de pendências. A Caixa de entrada é só consulta.

| ID | Requisito | Critério de aceite |
|---|---|---|
| RF-100 | Listar `movement` com `triage_status = pending`, agrupadas por fonte (DJEN, Domicílio, DataJud, portal) | Filtros: fonte, UF/tribunal, carteira, "sem processo vinculado", "com prazo sugerido" |
| RF-101 | Cada item mostra o texto original, o resumo da IA e, quando houver, a sugestão de prazo | O texto original fica sempre visível ou a um clique |
| RF-102 | Ações: Vincular ao processo, Criar tarefa com prazo (RF-107), Criar processo (quando não existe, pela seção "Processos novos"), Ignorar com motivo | Cada andamento é um **alerta** que fica pendente até alguém decidir: **Criar tarefa** (o alerta vira lido) ou **Ignorar** (motivo obrigatório, de uma lista). Não existe "só marcar como lida". Tudo auditado |
| RF-103 | Publicação do DJEN que cita um termo monitorado e não pertence a nenhum processo cadastrado | Tudo que o DJEN traz já é **processo em andamento**: o processo **entra direto em Processos** (RF-124), sem passar pela Triagem; as publicações que o trouxeram ficam no histórico dele, já lidas, e só as atualizações seguintes viram alerta |
| RF-104 | Conferência de homônimo | Termo do tipo nome só gera item se o CNPJ/CPF conferir; sem documento no texto, o item vem marcado "conferir parte" |
| RF-105 | Ação em lote | Selecionar vários alertas e ignorar com o mesmo motivo |
| RF-106 | Tela Triagem ("Processos novos para cadastrar"): lista paginada dos itens abertos da caixa de entrada e painel de revisão com todas as ações dos RF-12 a RF-19b | Confirmar cria `case` e volta para a ficha; duplicado e descarte voltam para a Triagem; só admin e advogada agem; leitura apenas visualiza |
| RF-107 | Na tela Alertas, botão "Criar tarefa" em cada alerta vinculado a um processo, sem depender de IA; o formulário abre no próprio painel de detalhe do alerta (a rota `/tarefas?andamento=...` também funciona) | Formulário com título, tipo, responsável (ou **sem responsável**), **prazo limite** e **prazo interno** opcional, por **data** ou por **N dias úteis/corridos** contados da data da publicação (calculado pelo sistema com a tabela `holiday`; se ambos, valem os dias). Cria a tarefa ligada ao processo e ao andamento (`task.movement_id`), marca o andamento como `task_created` e audita. Andamento sem processo pede vínculo antes |
| RF-108 | Ao confirmar um processo novo, bloco opcional "Já criar uma tarefa com prazo" (título, data e responsável) | Processo e tarefa nascem juntos; se a tarefa falhar, o processo é mantido |
| RF-109 | Paginação no servidor nas listas grandes | Caixa de entrada 25 por página, Triagem 20, "Processos novos" 25; página fora do intervalo cai na última |
| RF-110 | Texto das publicações é exibido sem códigos HTML | Entidades (`&Aacute;`, `&ccedil;`, `&#233;`) são convertidas na gravação; o texto original continua visível |
| RF-111 | Barra de ações em lote na tela Alertas | Barra flutuante e centralizada no rodapé, só aparece com itens marcados, mostra "N selecionados" e oferece Marcar como lidos e Descartar selecionados; o descarte exige o motivo (validação no navegador e no servidor) e "Marcar como lidos" não pede motivo |
| RF-112 | Vincular um andamento a um processo não o tira da fila | Segue pendente para criar a tarefa ou ignorar |
| RF-113 | Tela Alertas em **lista + painel de detalhe**: lista curta de alertas à esquerda (processo, resumo, fonte, data) e painel à direita com resumo da IA, texto original, sugestão, formulário de criar tarefa, vínculo e Ignorar; ao decidir, abre o próximo alerta | Abas **Pendentes / Tratados / Todos** com contagem; link do alerta na URL (`?item=`) |
| RF-114 | **Histórico de alertas** (aba Tratados): alertas já decididos, com filtros de fonte, UF, desfecho (tarefa criada, ignorado, lido), quem decidiu e período em que foi tratado | O painel de um alerta tratado mostra a decisão (tarefa com prazos, ou motivo de ignorar), quem e quando, e o **histórico do alerta** montado da auditoria (chegada, vínculo, tarefa, ignorado). Inclui alertas sem processo vinculado |
| RF-115 | Botão **Voltar** em todas as telas, exceto o Início | Leva à **tela pai**, nunca ao histórico cru do navegador: Alertas (criar tarefa a partir do alerta), Processos (novo processo) e Início (demais telas, inclusive administração). Onde faz sentido, devolve à **tela de origem**, com os filtros que estavam nela: a ficha do processo volta para Tarefas, Alertas, Triagem etc., conforme de onde foi aberta (aberta direto, volta para Processos); editar tarefa volta para a lista de Tarefas ou para a ficha do processo. O rótulo diz o destino ("Voltar para Processos") |
| RF-116 | Alerta só nasce para processo com o **monitoramento ligado** | Publicação ou movimentação de processo cadastrado com monitoramento desligado (ou encerrado) não cria alerta nem vira processo novo na Triagem; religar o monitoramento volta a gerar alertas dos próximos recebimentos. Alertas já pendentes não somem ao desligar |
| RF-117 | **Fluxo geral (decisão de 24/11/2026):** **tudo que vem do DJEN entra direto em Processos** e lá fica; **cada atualização** que chegar de um processo cadastrado com monitoramento ligado aparece em **Alertas**. **Distribuições** (processos novos do Projuris, Domicílio ou cadastro manual) vão para a **Caixa de entrada** e a **Triagem**, onde a advogada classifica e, se for o caso, já cria a tarefa; confirmado, vira Processo. Processos em andamento e concluídos que já existem entram em Processos pela importação da base atual (RF-122) | Não há tela de "Histórico": o que está em andamento e o que foi concluído ficam em Processos (os concluídos, sem monitoramento) |
| RF-118 | Ao importar a base, itens que já esperavam na Triagem com o mesmo número passam a ser do processo importado | O item fica confirmado e suas publicações viram andamentos do processo, que aparecem em **Alertas** (se o monitoramento estiver ligado; processo concluído não gera alerta). Registrado na auditoria |
| RF-119 | **Busca do DJEN pelo número do processo** para os cadastrados com monitoramento ligado | Cobre o caso em que o advogado da Foco não está habilitado e a publicação sai sem o nome da Foco. Janela de 3 dias para trás (a deduplicação por id evita repetição); cada rodada consulta uma fatia de até 120 processos (`DJEN_NUMBER_QUERIES_PER_RUN`), girando de hora em hora, para respeitar 1 requisição a cada 1,5 s. Não roda na busca de um único termo. Erro 429 interrompe as consultas por número e fica registrado |
| RF-120 | O alerta mostra **quando chegou** ao FocoJur e **há quantos dias está pendente** (vermelho a partir de 2 dias), na lista, no painel e no histórico do alerta | Data da publicação continua visível à parte |
| RF-121 | **Sininho** no topo de todas as telas com a contagem de alertas pendentes e os 8 mais recentes | Clicar leva ao alerta (e, pelo painel, ao processo); "Ver todos os alertas" |
| RF-122 | Tela **Importação da base atual** (`/admin/importacao`, só admin): envia a planilha Contencioso (.xlsx, até 25 MB), confere o **de-para** e vê a prévia antes de gravar | 1) Envio: nada é gravado. 2) Por aba: importar sim/não, carteira, "aba de encerrados", polo, linha dos títulos e, para cada campo do sistema, qual coluna da planilha o alimenta (sugerido automaticamente pelos nomes das colunas; corrigível). 3) Prévia: linhas lidas, quantos serão criados (e quantos concluídos), já existentes (pulados), bloqueados por exceção grave, avisos, valores fora das listas oficiais, advogadas sem usuário e as exceções por linha. 4) "Importar N processos" roda **em segundo plano** (fila no servidor; acompanha o andamento na tela) |
| RF-123 | Regras da importação | Número já existente (mesma carteira) é pulado; número repetido entre abas, o primeiro vale e os demais são exceção grave; em andamento entram com **monitoramento ligado**, **concluídos** (aba de encerrados, data de encerramento, status encerrado/arquivado ou ATIVO = não) entram **sem monitoramento**, só para consulta; **relatório em Excel** (exceções, valores fora das listas, advogadas sem usuário) para o Jurídico validar; tudo auditado. A linha de comando `pnpm migrar:planilha` usa o mesmo gravador |
| RF-124 | **Processo do DJEN entra direto em Processos:** cadastro mínimo automático (número, carteira pelo número CNJ — Justiça do Trabalho = trabalhista, as demais = cível —, UF, vara/órgão, parte quando houver), `source = djen_term`, **monitoramento ligado**, sem responsável | As publicações que trouxeram o processo ficam como histórico **lido** (não são alerta, nem as várias da mesma rodada); as que chegarem depois viram alerta. A ficha mostra "Processo criado automaticamente pelo DJEN" até alguém definir o responsável, e a advogada completa objeto, prognóstico e valores. Se o nome da parte difere do cadastrado (possível homônimo), o processo entra igual e a ficha traz o aviso "Conferir parte: …". `DJEN_AUTO_REGISTER=false` manda tudo à Triagem. `pnpm triagem:converter-djen` leva para Processos o que já está esperando na Triagem (idempotente). Auditado (ação automática, sem usuário) |
| RF-125 | **Dia do Advogado (11/08) e Dia da Justiça (08/12)** nos feriados: cadastro em lote por UF ou por tribunal/vara, para um intervalo de anos (até 5), na tela de Feriados | Variam por tribunal, por isso não são nacionais; valem só para a UF ou o tribunal/vara informado e não duplicam o que já existe; auditado |
| RF-126 | **Processos** usa o mesmo paginador da Triagem (números de página, Anterior/Próxima, "Mostrando a a b de N"), 20 por página | Os filtros e a busca acompanham a página; página além do fim cai na última |
| RF-127 | **Celular (360 px):** o menu lateral vem recolhido atrás do botão "Menu" e fecha ao trocar de tela; o botão Voltar quebra a linha e a página não rola na horizontal | Em telas largas o menu fica sempre aberto |

### 6.3 Tarefas e prazos (`docs/design/Tarefas.dc.html`)

| ID | Requisito | Critério de aceite |
|---|---|---|
| RF-20 | Quadro no padrão do Planner "Rotina Jurídico": **colunas por bucket** (padrão), cadastradas em Listas oficiais ("Colunas do quadro de tarefas"), mais "Sem bucket"; alternativa "Agrupar por: Situação" (A fazer, Em andamento, Aguardando revisão, Concluídas) | Arrastar o card entre colunas muda o bucket (ou a situação, quando agrupado por situação); o contador da coluna conta as abertas |
| RF-21 | Filtros: Todas, Minhas, Tarefas gerais; carteira; tipo; **responsável** (qualquer pessoa ou "Sem responsável"); **coluna**; **dia** (calendário) | Filtros combináveis e refletidos na URL. O filtro de dia acha a tarefa pelo prazo limite **ou** pelo prazo interno |
| RF-22 | Card (padrão Planner): **círculo para concluir/reabrir**, título, processo e tipo, prazo limite e interno, avatares do responsável e do revisor; "Atribuir e mover" recolhido (responsável, coluna, situação). Mostra tipo, prazo limite (com cor por urgência), prazo interno, título, processo, responsável e revisor | Cores: atrasado e hoje = danger; até 2 dias úteis = warn; demais = neutro |
| RF-22a | Tarefa tem **prazo limite** (fatal, dirige a cor de urgência, o aviso diário e o painel) e **prazo interno** opcional, a data em que a equipe quer entregar | O interno não pode ser depois do limite e exige o limite (validado no servidor, na criação e na edição); aparece no card, na lista e na edição; auditado |
| RF-22b | Ao criar ou editar tarefa, os responsáveis podem ficar em branco ("Sem responsável") | A tarefa aparece no filtro "Sem responsável" e qualquer pessoa pode assumi-la; o e-mail diário de prazos mostra a tarefa sem responsável a todas as pessoas ativas |
| RF-22c | **"+ Adicionar tarefa"** no topo de cada coluna do quadro | Cria uma tarefa geral só com o título, já na coluna; o resto se completa na edição |
| RF-22d | **Tarefas concluídas** recolhidas dentro de cada coluna, com contagem (últimos 30 dias); o círculo reabre | Por situação, a coluna "Concluídas" mostra as mesmas |
| RF-22e | **Formas de exibição:** Quadro, **Grade** (a lista, com colunas Coluna, Prazo limite e Prazo interno) e **Calendário** | Filtros de visão, carteira, responsável, coluna, tipo e dia valem nas três |
| RF-22f | **Calendário** mensal e semanal: Hoje, anterior/próximo, tarefas no dia do prazo limite (contorno cheio) e do prazo interno (tracejado, "Int."), até 3 por dia no mês com "+N mais", atrasadas em vermelho e as que vencem hoje em amarelo, concluídas riscadas | O "+N mais" abre um **pop-up** com todas as tarefas do dia (fecha com ✕, Esc ou clicando fora; link "Abrir na Grade"); o número do dia abre a Grade filtrada por aquele dia. Painel lateral **"Tarefas não agendadas"** (abertas sem prazo limite) |
| RF-22g | **Prazo interno automático por tipo de tarefa:** em Listas oficiais, cada tipo de tarefa pode ter "dias úteis antes do limite" | Ao criar a tarefa com prazo limite e prazo interno em branco, o sistema calcula limite menos N dias úteis (com feriados), nunca antes de hoje nem depois do limite; o digitado vence; fica na auditoria como "calculado pelo tipo". Só admin define a regra |
| RF-22h | O calendário mostra o **horário** da tarefa quando houver (audiências, por exemplo) | "14:30 Título" no chip e no pop-up do dia |
| RF-23 | Tarefa com revisor só vai para "Concluída" após o revisor aprovar | Status `review` exige ação do revisor |
| RF-24 | Tarefas gerais (sem processo) | `case_id` nulo; aparecem só no filtro próprio e em "Minhas" |
| RF-25 | Alertas de vencimento | E-mail diário às 7h para cada responsável com prazos do dia e atrasados |
| RF-26 | Visão em lista, além do quadro | Mesmos filtros |
| RF-27 | Editar tarefa (`/tarefas/[id]`): título, tipo, coluna, prazos, **responsáveis (uma ou várias pessoas)** e revisor | Link "Editar" no card e na lista; só o que mudou vai para a auditoria (com os nomes); o revisor não pode estar entre os responsáveis |
| RF-28 | Marcar os responsáveis direto no card do quadro ("Atribuir e mover"): uma caixa por pessoa | Marcar várias pessoas vale; nenhuma = sem responsável; as iniciais de todos aparecem no card (até 3, com "+N"); mesmas validações e auditoria do RF-27 |

### 6.4 Processos (`docs/design/Processos.dc.html`)

| ID | Requisito | Critério de aceite |
|---|---|---|
| RF-30 | Busca única por número, parte, contrato ou placa | Resultado em menos de 1 s com 10 mil processos |
| RF-31 | Filtros: carteira, status, prognóstico, objeto, UF, loja, responsável | Combináveis, refletidos na URL |
| RF-32 | Tabela paginada com processo, carteira, objeto, local, loja, prognóstico, valor de risco e próximo prazo | Paginação no servidor |
| RF-33 | Exportar para Excel o resultado filtrado | Colunas equivalentes às da planilha atual |
| RF-34 | Chave de monitoramento por processo e em lote | Processo com `monitoring = false` não é consultado no DataJud nem no robô; encerrar processo desliga o monitoramento por padrão |
| RF-35 | Alerta de carteira parada | Processos em andamento sem movimentação há mais de 90 dias (configurável) aparecem com selo na lista, em filtro próprio e no painel |

### 6.5 Ficha do processo (`docs/design/FichaProcesso.dc.html`)

> **Aba Andamentos (23/11/2026):** além de Resumo, Tarefas, Financeiro e Histórico, a ficha tem a aba **Andamentos** com a linha do tempo do processo (publicações e movimentações, da mais recente à mais antiga), cada uma com o estado (pendente, lido, tarefa criada com link, descartado com motivo), o resumo da IA e o texto original (RF-43). Só consulta; a decisão fica na tela Andamentos.

| ID | Requisito | Critério de aceite |
|---|---|---|
| RF-40 | Cabeçalho: número, badges (carteira, status, prognóstico, sistema/tribunal), partes, vara, responsável, origem e datas | |
| RF-41 | Aba Resumo: Dados do processo, Risco e contingência, Contrato e locação, Causa raiz | Campos específicos por carteira (Cível, Trabalhista, Procon) |
| RF-42 | Revisão de prognóstico guarda histórico | Nova linha em `case_risk`; a ficha mostra a vigente e "última revisão" |
| RF-43 | Aba Andamentos (antes "Movimentações") em ordem cronológica, com fonte, resumo da IA e situação (prazo confirmado, lida) | |
| RF-44 | Aba Tarefas do processo | Mesmo comportamento de RF-20 a RF-23 |
| RF-45 | Aba Financeiro com lançamentos por tipo e total pago | Ticket SENS opcional |
| RF-46 | Aba Histórico a partir de `audit_log` | Mostra quem, quando e o quê, incluindo aceites de IA |
| RF-47 | Encerrar processo exige motivo de encerramento e data | Status vira Encerrado; tarefas abertas pedem decisão (cancelar ou manter) |
| RF-48 | Campos obrigatórios por carteira, validados antes de salvar | Responsável, objeto, prognóstico e valor de risco no Cível |

### 6.6 Painéis (`docs/design/Paineis.dc.html`), etapa 1c

| ID | Requisito | Critério de aceite |
|---|---|---|
| RF-50 | Indicadores: em andamento, valor de risco total, entradas e encerramentos no mês, % evitáveis, carteira parada | Filtro por carteira |
| RF-51 | Gráfico de entradas e encerramentos por mês (12 meses) | |
| RF-52 | Processos ativos por objeto, com a parcela evitável destacada | |
| RF-53 | Contingência por prognóstico (quantidade, valor, %) | Soma igual ao total do indicador |
| RF-54 | Lojas com mais processos evitáveis e valor pago | |
| RF-55 | Indicadores Procon equivalentes à aba atual da planilha | Validar com o Jurídico quais |
| RF-56 | Filtro de período nos painéis: padrão "Visão geral", "Mês e ano" e "Período personalizado" (de/até), além do filtro de carteira | Parâmetros na URL, validados no servidor (mês 1-12, datas válidas, final não anterior à inicial, máximo de 5 anos; inválido cai no padrão com aviso). Com período, os indicadores contam os processos **recebidos** no período (e "Encerrados no período" os encerrados no período); o gráfico mensal acompanha o período. A tela informa em uma linha o que o filtro afeta |

### 6.7 Usuários e acesso (`docs/design/AdminUsuarios.dc.html`, `docs/design/Login.dc.html`)

| ID | Requisito | Critério de aceite |
|---|---|---|
| RF-60 | Cadastro público desligado | Não existe rota de cadastro; tentativa direta na API falha |
| RF-61 | Admin cria o usuário com nome, e-mail (login) e perfil; o sistema gera a senha temporária | Senha aleatória de 12 caracteres, exibida uma única vez para o admin copiar; `must_change_password = true`; validade de 72 horas |
| RF-62 | No primeiro login com a senha temporária, o usuário é levado à tela "Crie sua senha definitiva" | Enquanto `must_change_password = true`, qualquer rota redireciona para `/primeiro-acesso`; nova senha diferente da temporária; ao salvar, a flag vira `false` e as outras sessões são encerradas |
| RF-63 | Senha temporária expirada não entra | Mensagem pedindo para falar com o admin |
| RF-64 | Admin gera nova senha temporária (serve também para "esqueci minha senha"), desativa e reativa usuários | Nova senha temporária invalida a anterior e marca `must_change_password = true`; usuário desativado perde as sessões na hora |
| RF-64a | Login por e-mail e senha | Senha definitiva com no mínimo 10 caracteres, letras e números; bloqueio temporário após 5 tentativas erradas |
| RF-65 | ~~Configurar o rodízio da advogada do dia~~ | **Removido em 24/11/2026**: não há rodízio |
| RF-66 | Admin gerencia listas oficiais e termos monitorados | Desativar item não apaga histórico |
| RF-66a | Cada item das listas oficiais tem uma **descrição** (até 600 caracteres), editada só pelo admin e auditada | Serve de contexto para a IA: na Triagem ela lê rótulo + descrição de Objeto e Pedido para sugerir a classificação e, em Alertas, os tipos de ato com descrição (inclusive prazo e forma de contagem escritos nela) para sugerir ato e dias. A IA só escolhe entre as opções cadastradas (nenhuma serve = vazio); o prazo final é calculado pelo sistema e confirmado por uma advogada. As telas mostram a descrição da opção escolhida como dica. O Jurídico preenche; nada vem pré-preenchido |
| RF-66b | Em Listas oficiais, **Fórmula do valor de risco** (só admin, auditada), como na planilha do Jurídico: subtotal = valor da causa + valor da causa × percentual da categoria; honorários = subtotal × percentual; **valor de risco = subtotal + honorários** | Categorias: **Juizado** (18%), **Vara Cível** (24%) e **Casos antigos/ajuste** (35%, processo com mais de 36 meses desde a data de recebimento ou citação; meses = dias ÷ 30); honorários 20%. Tudo editável, com simulador para conferir (exemplos da planilha: R$ 13.680,00 → R$ 19.370,88; R$ 5.000,00 → R$ 7.440,00; R$ 28.625,90 → R$ 46.373,96). A categoria vem do Foro/esfera (campo também no formulário da Triagem); trabalhista, Procon e foro desconhecido não usam a fórmula. Opcional: sem valor da causa, usar o **teto dos juizados** (20 salários mínimos sem advogado ou 40 com advogado), com o salário mínimo informado. Desligada por padrão; ligada, calcula só quando o "Valor de risco total" está em branco (cadastro e revisão de prognóstico); o digitado nunca é sobrescrito e processos já cadastrados não mudam |

### 6.7a Monitoramento e termos de busca (`/admin/monitoramento`)

| ID | Requisito | Critério de aceite |
|---|---|---|
| RF-67 | Admin gerencia, sem alterar código, os termos de busca (nome da parte, advogado, OAB), as lojas/CNPJs do grupo e as variações do nome da Foco | Termo de nome exige CNPJ para conferir homônimo; advogado exige o nome completo registrado; OAB no formato número/UF; variações parecidas são sugeridas para decisão do admin; desativar pausa, excluir mantém as publicações já recebidas |
| RF-68 | **Um único intervalo** de captura, em horas: 1, 6, 12 ou 24 (padrão 1 hora), guardado em `app_setting` | Vale para o agendamento do worker, para a busca de termo novo e para os padrões de "Buscar de novo" e "Rodar agora"; não existe janela em dias; o DJEN informa só a data, então a janela é "agora menos N horas" e a deduplicação por id evita repetição; worker parado volta até a última execução boa, limitado a 7 dias |
| RF-69 | Criar, editar ou ativar um termo dispara a busca dele na hora, em segundo plano | Status do termo na tela (na fila, buscando, concluída, erro); busca de um termo ou de período escolhido é parcial e não avança o ponto de retomada da captura automática |

### 6.8 Auditoria

| ID | Requisito | Critério de aceite |
|---|---|---|
| RF-70 | Registrar criação, alteração e exclusão de processo, tarefa, lançamento, risco, vínculo de contrato, usuário, geração de senha temporária, lista e configuração de IA | `diff` com antes e depois |
| RF-71 | Registrar login, falha de login, troca de senha no primeiro acesso e aceite, edição ou rejeição de sugestão da IA | |
| RF-72 | Exclusão lógica para processos e lançamentos | Só admin exclui; sempre auditado |
| RF-73 | Tela **Auditoria** (`/admin/auditoria`, só admin): trilha de tudo o que cada usuário fez, com filtros por usuário (inclui "Sistema"), tipo de registro, ação e período, resumo de atividade por usuário, link para o processo ou tarefa afetado e o que mudou (antes/depois) | Paginada (30 por página); horário de Brasília; o sistema não tem opção de editar ou apagar registros |

### 6.9 Modelos de IA (`docs/design/AdminIA.dc.html`), etapa 1c

| ID | Requisito | Critério de aceite |
|---|---|---|
| RF-80 | Sincronizar o catálogo de modelos do OpenRouter (diário e sob demanda) | Atualiza `ai_model_catalog` com preços |
| RF-81 | Mostrar só modelos compatíveis com a política de dados (seção 8.3) | Faixa "Política de dados sempre ativa" |
| RF-82 | Escolher modelo principal e reserva por tarefa | Grava `ai_task_config` e `ai_task_config_history` |
| RF-83 | Mostrar preço por 1M tokens, taxa de aceite (30 dias) e custo médio por chamada por tarefa | |
| RF-84 | Comparar dois modelos numa amostra de 20 ou 50 casos já revisados | Mostra acerto (contra a decisão final da advogada), custo e tempo; não altera dados |

### 6.10 Custos de IA (`docs/design/CustosIA.dc.html`), etapa 1c

| ID | Requisito | Critério de aceite |
|---|---|---|
| RF-90 | Indicadores: custo hoje, no mês, projeção do mês, tokens no mês, saldo de créditos no OpenRouter | Alternância R$ / US$ |
| RF-91 | Barra do limite mensal com alertas em 80% e 100% | E-mail aos admins, uma vez por limiar por mês |
| RF-92 | Gráfico de custo por dia | |
| RF-93 | Câmbio: PTAX do dia (automática) e cotação manual opcional | Cada `ai_call` grava a cotação usada; mudar a cotação não altera o histórico |
| RF-94 | Tabela por tarefa e modelo: chamadas, tokens de entrada e saída, custo, tempo médio, % de erros, % de aceite | Também por usuária e por processo; exportar CSV |
| RF-95 | Ao atingir 100% do limite | **Decisão em aberto:** só alertar ou suspender a IA até o admin liberar (seção 12) |
| RF-96 | Filtro de período nos custos de IA: Hoje, 7 dias, Mês atual, **Mês e ano** e **Período personalizado** | O período vale para custo, chamadas e tokens do período, gráfico (por dia até 62 dias, por mês acima disso), tabela por tarefa e modelo e para o CSV (mesmo parser e mesmo período). "Custo hoje", projeção e limite mensal continuam do mês atual. Fuso America/Sao_Paulo |

---

## 7. Regras de negócio

1. **Número do processo:** normalizar (só dígitos, máscara CNJ na exibição). O Procon usa o número do órgão. O número é único por carteira.
2. **Prazos processuais:** contagem em dias úteis, excluindo feriados nacionais, estaduais, municipais e do tribunal (`holiday`). Quando o calendário do tribunal não estiver cadastrado, a sugestão traz o aviso "conferir feriados locais".
3. **IA nunca decide:** sugestão de prazo, classificação e resumo só viram dado depois da ação de uma advogada. O texto original da movimentação é sempre exibido junto do resumo.
4. **Sem responsável:** itens novos e tarefas sem responsável ficam visíveis a todas até alguém assumir (não há advogada do dia).
5. **Status e contingência:** "Status" é a situação processual (lista oficial). "Status para contingência" é `em andamento` ou `encerrado`. A regra da coluna ATIVO da planilha será definida com o Jurídico antes da migração.
6. **Valor de risco:** `risk_total` é informado. Material e moral são opcionais, mas a soma não pode passar do total.
7. **Vínculo de contrato:** o código segue o padrão `[A-Z]{3}\d{6}-\d{2}` (ex.: POA004871-26). Só é considerado validado após a consulta ao sistema de locação.

---

## 8. Inteligência artificial (OpenRouter)

### 8.1 Tarefas

| Tarefa | Entrada | Saída (JSON validado com Zod) |
|---|---|---|
| `movement_summary` | Texto da movimentação + capa do processo | `{ summary: string (até 400 caracteres) }` |
| `deadline_suggestion` | Texto da movimentação + carteira + rito (Juizado ou Vara) | `{ hasDeadline: boolean, actType, days, dayCount: "business" \| "calendar", startDate, dueDate, legalBasis, confidence: 0..1, hearing?: { date, time, mode } }` |
| `intake_classification` | Texto da inicial ou capa | `{ portfolio, subjectCode, claimCode, prognosis, rationale }`, com códigos das listas oficiais passadas no prompt |
| `contract_extraction` | Texto livre | `{ contractCodes: string[] }` com o regex da regra 7 aplicado depois |
| `portal_extraction` | Texto da página do processo no portal (HTML convertido em texto) | `{ number, court, system, plaintiffs[], defendants[], plaintiffLawyer, claimValue, distributedAt, subject, movements[{ date, text }] }`; campo não encontrado volta nulo, nunca inventado |

**Prazo calculado pelo sistema:** a IA identifica o ato, os dias e a forma de contagem. Quem calcula a data final é o FocoJur, com o calendário de feriados. A data da IA serve só de conferência; se divergir, mostrar o aviso.

### 8.2 Cliente

- Endpoint compatível com OpenAI: `https://openrouter.ai/api/v1/chat/completions`, com saída estruturada (JSON schema) quando o modelo suportar; senão, JSON no prompt + validação Zod e uma nova tentativa.
- **Fallback:** erro, timeout (30 s) ou JSON inválido após a nova tentativa → chama o modelo reserva e grava `status = fallback`.
- **Registro:** toda chamada grava `ai_call` com os tokens e o custo do objeto `usage` da resposta (vem automaticamente; ver [documentação](https://openrouter.ai/docs/guides/administration/usage-accounting)), o `generation_id`, a latência e a cotação do dia.
- **Catálogo:** `GET https://openrouter.ai/api/v1/models` (preços por token em US$). **Saldo:** endpoint de créditos da conta (confirmar na documentação).
- A chave da API fica só no servidor (`OPENROUTER_API_KEY`).

### 8.3 Política de dados (decisão 13)

- Toda chamada envia as preferências de provedor que bloqueiam retenção e uso para treino (no OpenRouter: `provider.data_collection = "deny"` e, se disponível, a opção de retenção zero). **Confirmar os nomes exatos dos parâmetros na documentação antes de implementar.**
- O catálogo marca `data_policy_ok`; a tela de admin lista só esses modelos.
- Antes de enviar, remover CPF, RG e dados bancários do texto (máscara por regex). Nome das partes pode seguir, porque é necessário para o contexto.

### 8.4 Câmbio

- Job diário (dias úteis, 13h30) busca a PTAX de venda na API pública do Banco Central (Olinda, serviço PTAX `CotacaoDolarDia`).
- Sem PTAX no dia (fim de semana, feriado), usar a última disponível.
- Se o admin fixou uma cotação manual, ela vale a partir da data em que foi definida, até ser removida.

---

## 9. Integrações e migração

### 9.1 Interface de conectores (etapa 1b)

Todo conector implementa a mesma interface e roda como job do pg-boss:

```ts
interface Connector {
  name: 'projuris' | 'domicilio' | 'djen' | 'datajud';
  fetchSince(cursor: string | null): Promise<{ items: RawItem[]; nextCursor: string | null }>;
  toInbox?(item: RawItem): InboxItemInput;     // processos novos
  toMovement?(item: RawItem): MovementInput;   // movimentações de processos existentes
}
```

| Conector | Frequência | Status |
|---|---|---|
| Projuris (API) | A cada 2 h em dias úteis | Só se o contrato incluir API; senão, importação em lote (RF-19a) |
| Domicílio Judicial Eletrônico | A cada 2 h em dias úteis | Depende da credencial da Foco |
| DJEN por termos (nome, advogado, OAB; CNPJ só como referência) | Conforme o intervalo único (RF-68; padrão 1 hora) | Publicações de processos cadastrados vão para os andamentos da Triagem; de processos não cadastrados, para "Processos novos" (RF-103). **API validada em 17/11/2026** (ver abaixo) |
| DataJud | Diário, 6h30, só para processos com `monitoring = true` | API pública do CNJ, por número, em lote de 50 por tribunal, com espera e nova tentativa para 429/5xx/timeout, teto de requisições e execução "Parcial". **Em 17 e 18/11/2026 o CNJ respondeu 429 em todas as tentativas** (chave aceita, sem dados); nunca insistir em laço. Consulta de amostra agendada e reavaliação pendente |
| Sistema de locação | Sob demanda, por código de contrato | Depende do time do sistema |

Cada execução grava `connector_run`. Três falhas seguidas geram e-mail aos admins.

**Teste real do DJEN (17/11/2026):** a API `comunicaapi.pje.jus.br` responde 200 a requisições identificadas (FocoJurBot, cerca de 1 requisição a cada 1,5 s); nunca se finge ser navegador. Em 30 dias: nome da parte "FOCO ALUGUEL DE CARROS" = 624 publicações; advogado "SERGIO MENDES CAHU FILHO" = 548; OAB 34790/PE = 448; OAB 523443/SP = 102; CNPJ no texto = 1 (inútil). Por isso os termos monitorados são nome, advogado e OAB; os CNPJs do grupo servem de referência.

### 9.2 Migração da planilha (etapa 1a)

Script em `scripts/migracao/planilha` (TypeScript ou Python), idempotente, com modo de simulação (`--dry-run`):

1. Ler todas as abas; mapear cada uma para carteira e entidade (Cível 2026, Cível, Trabalhista 2026, Trabalhista, Procon, abas de encerrados por ano, Polo Ativo, Processos de Parceiros, Fiscal, Sinistros).
2. Normalizar valores contra as listas oficiais (ex.: "E-SAJ" → eSaj, "PROUJDI" → Projudi, "DOMICILIO" → Domicílio).
3. Extrair os códigos de contrato do campo de detalhamento (regra 7).
4. Detectar inconsistências: ano futuro, ATIVO × ENCERRADO, número duplicado entre abas, valores não numéricos (ex.: "FAZER OS CÁLCULOS NA IA").
5. Gerar `relatorio-excecoes.xlsx` para o Jurídico validar. Nada com exceção grave entra sem decisão.
6. Mapear as advogadas por nome para usuários; nomes sem correspondência viram texto em `external_firm` ou ficam sem responsável e entram no relatório.

### 9.3 Migração do Planner

> **Colunas (24/11/2026):** cada bucket do Planner vira uma coluna do quadro (lista oficial `task_bucket`). A tarefa importada entra na coluna de mesmo nome (sem acento/caixa); bucket que ainda não existe é criado com o nome do Planner, e o Jurídico renomeia ou desativa depois em Listas oficiais. O tipo da tarefa continua vindo do mapeamento bucket → tipo. A simulação (`--dry-run`) lista os buckets e quantas tarefas cada um tem.

1. Exportar o plano (Microsoft Graph ou exportação para Excel).
2. Extrair o número CNJ do título com regex e ligar ao processo.
3. Bucket → `task.type` (tabela de mapeamento a validar com o Jurídico).
4. Tarefas abertas viram `task` com `origin = migration`; concluídas viram linha de histórico na ficha.
5. Tarefas sem número de processo viram tarefas gerais. A confirmar com o Jurídico.

### 9.4 Robô de enriquecimento nos portais (opção C, etapa 1b)

**Objetivo:** completar os dados de um processo **já conhecido pelo número** (vindo do Projuris, do Domicílio, do DJEN ou de cadastro manual) direto no portal do tribunal, sem digitação. Não serve para descobrir processos novos; isso continua com o Projuris.

**Como funciona (híbrido):**

1. A caixa de entrada ou a advogada enfileira um `portal_fetch` com o número do processo.
2. O worker identifica o portal pelo número CNJ (segmento de justiça + tribunal) e escolhe o adaptador.
3. **Navegação por roteiro:** o adaptador (Playwright) abre a consulta pública do portal, pesquisa pelo número e abre o processo.
4. **Extração por IA:** a página é salva (HTML e captura de tela no storage, para auditoria), convertida em texto e enviada à tarefa `portal_extraction`. O retorno é validado com Zod.
5. Os dados vão para o `inbox_item.parsed` ou, na ficha, para uma proposta de atualização que a advogada confirma.
6. **Plano B de navegação por IA (opcional, desligado por padrão):** se o roteiro falhar porque a tela mudou, a IA tenta navegar a partir da árvore de acessibilidade da página. Fica registrado como `navigation = ai_fallback` e só é ligado depois do piloto, se os números justificarem.

**Regras obrigatórias:**

- Só consulta pública, sem certificado digital no piloto. Processo em segredo de justiça ou não público = `not_public` e preenchimento manual.
- **Captcha nunca é contornado.** Se aparecer, o status vira `blocked_captcha` e o item segue para preenchimento manual (RF-18).
- No máximo 1 requisição a cada 5 segundos por portal, apenas em horário comercial, com identificação do robô no user-agent.
- Os termos de uso de cada portal são avaliados pelo Jurídico antes de ligar o adaptador.
- O que vem do robô nunca sobrescreve dado digitado pela advogada sem confirmação.

**Interface do adaptador:**

```ts
interface PortalAdapter {
  portal: string;                                   // 'eproc-tjrs', 'pje-tjpe'...
  matches(caseNumber: string): boolean;             // pelo segmento/tribunal do número CNJ
  open(page: Page, caseNumber: string): Promise<'ok' | 'not_found' | 'not_public' | 'captcha'>;
  pageText(page: Page): Promise<string>;            // texto limpo para a IA
}
```

**Piloto (07/04 a 12/04/2027):** eProc e PJe de 1 tribunal (a escolher com o Jurídico), 50 processos reais já conferidos.

| Métrica | Meta para expandir |
|---|---|
| Processos com dados de capa completos e corretos | ≥ 90% |
| Tempo médio por processo | ≤ 60 s |
| Custo médio de IA por processo | Registrado (sem meta; referência para o orçamento) |
| Bloqueios por captcha ou acesso restrito | Registrado por portal |

Se o piloto atingir as metas, a expansão para os outros portais é estimada à parte (um adaptador por sistema e tribunal). Se não atingir, a alternativa é a extensão no navegador da advogada (opção D), avaliada no mesmo momento.

---

## 10. Requisitos não funcionais

| Tema | Requisito |
|---|---|
| Segurança | RBAC no servidor (nunca só na UI); toda Server Action valida sessão e perfil; senhas com hash do Better Auth; cookies `httpOnly` e `secure` |
| LGPD | Dados pessoais só para quem tem perfil; logs sem dados sensíveis; política de dados na IA (8.3) |
| Desempenho | Listas e buscas em < 1 s com 10 mil processos e 100 mil movimentações; índices em `case.number`, `case.status_id`, `task.due_date`, `task.owner_id`, `movement.case_id`, `ai_call.at` |
| Disponibilidade | Horário comercial; jobs com nova tentativa automática |
| Backup | Diário, com retenção de 30 dias (AWS) |
| Observabilidade | Logs estruturados (JSON); tela simples de status dos conectores para admin |
| Acessibilidade | Contraste AA, navegação por teclado, rótulos em todos os campos |
| Responsividade | Funciona a partir de 360 px de largura (menu vira gaveta) |
| Ambientes | `local` (Docker) e `production` (AWS); toda configuração por variável de ambiente |

### 10.1 Variáveis de ambiente (`.env.example`)

```
DATABASE_URL=postgres://focojur:focojur@localhost:5432/focojur
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM="FocoJur <nao-responda@exemplo.com.br>"
STORAGE_DRIVER=local            # local | s3
S3_BUCKET=
OPENROUTER_API_KEY=
OPENROUTER_APP_NAME=FocoJur
AI_DEFAULT_TIMEOUT_MS=30000
TZ_APP=America/Sao_Paulo
```

---

## 11. Plano de implementação (para o Claude Code)

Cada marco termina com testes passando, migração aplicada e demonstração possível. Datas em `docs/cronograma.md`.

| Marco | Entregas | Pronto quando |
|---|---|---|
| **M0. Fundação** (etapa 0) | Next.js + Tailwind + shadcn/ui; Docker com Postgres e Mailpit; Drizzle configurado; Better Auth com cadastro público desligado; criação de usuário com senha temporária e primeiro acesso (RF-60 a RF-64a); layout com menu lateral conforme `Main.dc.html`; RBAC; `audit_log` | Admin semeado cria uma advogada; ela entra com a senha temporária, cria a senha definitiva e vê o layout vazio |
| **M1. Cadastro** | Schema da seção 5.1 a 5.3; listas oficiais + admin de listas (RF-66); ficha do processo (RF-40 a RF-48); lista e busca (RF-30 a RF-33) | Cadastrar, editar, encerrar e buscar processos das três carteiras, com auditoria |
| **M2. Tarefas** | `task`, `holiday`; quadro, lista e edição (RF-20 a RF-28); Início (RF-01 a RF-03) | A equipe trabalha as tarefas sem o Planner |
| **M3. Financeiro e usuários** | `financial_entry` (RF-45); telas de usuários completas | |
| **M4. Migração** | Scripts da seção 9.2 e 9.3, relatório de exceções | Base local com o histórico completo e relatório validado pelo Jurídico |
| **M5. Produção** | Deploy na AWS, backup, e-mail via SES, homologação e virada | Planilha e Planner em modo somente leitura |
| **M6. Captura e monitoramento** (etapa 1b) | `inbox_item`, `import_batch`, conectores (9.1), caixa de entrada (RF-10 a RF-19b), triagem e andamentos (RF-100 a RF-112), monitoramento e carteira parada (RF-34, RF-35), termos e intervalo (RF-67 a RF-69), movimentações (RF-43); camada OpenRouter (8.2 a 8.4) com registro em `ai_call`; robô de portais e piloto (9.4); vínculo com o sistema de locação | Processos novos e movimentações chegam sozinhos; relatório do piloto com as métricas da seção 9.4 |
| **M7. IA** (etapa 1c) | Tarefas da seção 8.1 nas telas; RF-04, RF-13; admin de modelos (RF-80 a RF-84); custos (RF-90 a RF-95) | Sugestões no Início e na caixa de entrada, com custo registrado por chamada |
| **M8. Painéis** | RF-50 a RF-55 | Indicadores conferidos com a planilha de outubro/2026 |

**Ordem obrigatória dentro de cada marco:** schema e migration → services em `src/server` com testes → telas → testes Playwright do fluxo principal.

---

## 12. Questões em aberto

| # | Questão | Dono | Precisa até |
|---|---|---|---|
| 1 | Projuris: o contrato inclui API oficial? Enquanto não confirmado, a captura usa a rota interna do site (26/11/2026, ver RF-19); se não houver API, permite exportar os processos capturados em Excel/CSV (e com quais colunas)? | Jurídico | 19/02/2027 |
| 1a | Lista de termos monitorados no DJEN (CNPJs do grupo, nomes usados nos diários, OAB das advogadas) | Jurídico | 17/03/2027 |
| 2 | Significado da coluna ATIVO e regra de status | Jurídico | 03/12/2026 |
| 3 | Listas oficiais (objeto, pedido, motivo de encerramento) aprovadas | Jurídico | 03/12/2026 |
| 4 | Mapeamento dos buckets do Planner para tipos de tarefa; destino das tarefas sem processo | Jurídico | 22/01/2027 |
| 5 | Ao atingir 100% do limite de IA: só alertar ou suspender | DUO | 08/04/2027 |
| 6 | Tailwind + shadcn/ui e pg-boss (recomendados nesta versão) | DUO | 23/11/2026 |
| 7 | Credencial do Domicílio Judicial Eletrônico e forma de acesso por sistema | Jurídico | 26/02/2027 |
| 8 | Forma de consulta ao sistema de locação (API, banco réplica, outro) | Time do sistema de locação | 13/04/2027 |
| 9 | Termos de uso dos portais do piloto e escolha do tribunal PJe | Jurídico | 31/03/2027 |
| 10 | Ligar ou não o plano B de navegação por IA após o piloto | DUO | 12/04/2027 |

---

## 13. Referência das telas

| Tela | Arquivo | Etapa |
|---|---|---|
| Início | `docs/design/Main.dc.html` | 1a (IA na 1c) |
| Caixa de entrada | `docs/design/CaixaEntrada.dc.html` | 1b |
| Triagem de publicações e movimentações | `docs/design/Triagem.dc.html` | 1b |
| Tarefas e prazos | `docs/design/Tarefas.dc.html` | 1a |
| Processos | `docs/design/Processos.dc.html` | 1a |
| Ficha do processo | `docs/design/FichaProcesso.dc.html` | 1a |
| Painéis | `docs/design/Paineis.dc.html` | 1c |
| Usuários | `docs/design/AdminUsuarios.dc.html` | 0 / 1a |
| Modelos de IA | `docs/design/AdminIA.dc.html` | 1c |
| Custos de IA | `docs/design/CustosIA.dc.html` | 1c |
| Login e criação de senha definitiva | `docs/design/Login.dc.html` | 0 |

Os arquivos `.dc.html` são HTML com marcação de componente (`<x-dc>`, `<sc-for>`, `<sc-if>`) e dados de exemplo no script final. Use-os para estrutura, hierarquia, textos e estados; os dados são fictícios. Para ver navegando, abra o canvas pelo link no topo deste documento.
