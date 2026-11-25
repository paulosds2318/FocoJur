# syntax=docker/dockerfile:1
FROM node:24-slim AS base
RUN npm install -g pnpm@12.21.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# --ignore-scripts: o pnpm recente aborta quando há scripts de instalação não aprovados (esbuild/sharp não precisam deles aqui)
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production PORT=3100 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# migrations versionadas (aplique com `pnpm db:migrate` como tarefa única antes de subir a versão)
COPY --from=build /app/src/db/migrations ./src/db/migrations
EXPOSE 3100
CMD ["node", "server.js"]

# Worker (rotinas agendadas e robô): docker build --target worker -t focojur-worker .
FROM base AS worker
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["pnpm", "worker"]
