# Deploy na AWS (marco M5)

O app já roda em container (`Dockerfile`, `docker compose --profile app up -d --build`). O que falta é **provisionar a infraestrutura**, que depende da equipe de infraestrutura (caminho crítico da virada: ambiente pronto até **27/01/2027**).

## O que pedir à infraestrutura (abrir a solicitação já em novembro)

| Recurso | Para quê | Observação |
|---|---|---|
| Container do app (ECS/Fargate ou App Runner) | Next.js, porta 3100 | Imagem do `Dockerfile` da raiz |
| Container do worker | Rotinas agendadas (`pnpm worker`): alerta de prazos 7h, PTAX, catálogo de modelos, conectores, robô | Mesma base de código; comando `tsx worker/index.ts`. **Uma única instância** (o pg-boss garante execução única, mas evita duplicar o robô) |
| Container do robô de portais | Playwright + Chromium | Só quando um adaptador for liberado (piloto, abril/2027). Imagem com Chromium |
| RDS PostgreSQL 16 | Banco | Backup diário, retenção de 30 dias; acesso só de dentro da VPC |
| S3 | Arquivos (páginas salvas pelo robô, anexos) | `STORAGE_DRIVER=s3` + `S3_BUCKET` + `AWS_REGION`; driver pronto (`src/lib/storage`), credenciais pela IAM role do container |
| SES (SMTP) | Alertas por e-mail | `SMTP_HOST/PORT/USER/PASS`; remetente verificado |
| Secrets Manager | Segredos | `BETTER_AUTH_SECRET`, `OPENROUTER_API_KEY`, `DATABASE_URL` etc. |
| Domínio + HTTPS (ALB/CloudFront) | Acesso | `BETTER_AUTH_URL` = URL pública; cookies `secure` |

## Variáveis de ambiente

Ver `.env.example`. Em produção: `NODE_ENV=production`, `BETTER_AUTH_SECRET` aleatório (32+ bytes), `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` (o seed **recusa** a senha padrão em produção).

## Sequência de publicação

1. `pnpm db:migrate` (rodar como tarefa única antes de subir a nova versão; as migrations são versionadas em `src/db/migrations`).
2. `pnpm db:seed` na primeira vez (cria o admin, listas oficiais e feriados nacionais; é idempotente).
3. Subir app e worker.
4. Conferir `/admin/monitoramento` (situação dos conectores) e `/login`.
5. Criar as contas das advogadas em `Administração > Usuários` e configurar o rodízio.

## Pendências técnicas para a produção

- [x] Driver S3 (`src/lib/storage`), testado com cliente simulado; falta testar contra o bucket real (permissão `s3:PutObject`/`GetObject` na IAM role).
- [ ] Executar a migração em ambiente de homologação: `pnpm migrar:planilha -- <arquivo> --dry-run`, validar o relatório de exceções com o Jurídico, depois sem `--dry-run`; idem `pnpm migrar:planner`.
- [ ] Operação em paralelo (1 semana) e então planilha e Planner em modo somente leitura (semana de 22/02/2027).
- [ ] Rate limit / WAF no ALB e rotação dos segredos.
- [ ] Health check (`/login` responde 200) e alarmes (falha do worker, e-mail dos admins após 3 falhas de conector).

## Backup e restauração

RDS com snapshot diário (30 dias). Testar a restauração antes da virada. Os arquivos do S3 usam versionamento.
