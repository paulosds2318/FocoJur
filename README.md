# FocoJur

Plataforma de gestão do contencioso da Foco Aluguel de Carros (Cível, Trabalhista e Procon). Substitui a planilha Contencioso e o Planner "Rotina Jurídico".

## O que faz

- **Processos**: cadastro único de Cível, Trabalhista e Procon, com partes, risco, contratos e histórico.
- **Tarefas e prazos**: quadro por bucket (padrão Planner), grade e calendário; vários responsáveis; prazo limite e prazo interno; prazos calculados pelo sistema (dias úteis e feriados).
- **Captura automática**: consulta ao DJEN por nome da parte, advogado e OAB, e ao DataJud por número; o que vem do DJEN entra direto em Processos.
- **Alertas**: cada atualização de processo monitorado vira alerta; a advogada decide criar tarefa ou ignorar com motivo.
- **Triagem**: processos novos (Projuris, Domicílio, manual) são classificados antes de entrar em Processos.
- **IA como apoio**: resume e sugere; nunca decide. O texto original fica sempre visível.
- **Painéis, fórmula do valor de risco (com histórico de versões), importação da base, auditoria e custos de IA.**

## Stack

TypeScript · Next.js (App Router) · Tailwind · PostgreSQL 16 · Drizzle ORM · Better Auth · Zod · pg-boss · Nodemailer · OpenRouter · Playwright · Vitest · pnpm.

## Rodando localmente

Requisitos: Node 20+, pnpm e Docker.

```bash
cp .env.example .env          # preencha BETTER_AUTH_SECRET e as chaves que for usar
docker compose up -d          # Postgres (porta 5440) e Mailpit (http://localhost:8025)
pnpm install
pnpm db:migrate
pnpm db:seed                  # admin@focojur.local / Trocar12345 (troca obrigatória no primeiro acesso)
pnpm dev                      # http://localhost:3100
```

Rotinas em segundo plano: `pnpm worker`. Alerta de prazos manual: `pnpm digest`.

## Testes

```bash
pnpm test                     # unitários + integração (usa o Postgres local)
npx playwright test           # e2e
```

## Documentação

- `docs/PRD.md`: requisitos (fonte da verdade)
- `docs/ROADMAP.md` e `docs/cronograma.md`: marcos e cronograma
- `docs/design/`: telas de referência
- `CLAUDE.md`: convenções e regras do projeto

## Regras que não podem ser quebradas

1. A IA nunca decide: sugestão só vira dado após ação de uma advogada.
2. Prazos são calculados pelo sistema; a IA só identifica ato, dias e forma de contagem.
3. Dados enviados à IA são mascarados (CPF, RG, dados bancários) e sem coleta pelo provedor.
4. Robô de portais: só consulta pública, sem contornar captcha, com limite de requisições.
5. Sem cadastro público: contas só pelo administrador.

Projeto interno. Não publique dados reais de processos neste repositório.
