# syntax=docker/dockerfile:1.7
# Contexto de build: la raíz del monorepo (ver docker-compose.yml).

FROM node:26-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    npm_config_store_dir=/pnpm/store
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate
WORKDIR /repo

# --- Dependencias: solo manifiestos para aprovechar la caché de capas ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@sirai/api..."

# --- Build: paquetes compartidos + API, luego árbol de producción aislado ---
FROM deps AS build
COPY . .
RUN pnpm turbo build --filter="@sirai/api..." \
 && pnpm --filter="@sirai/api" deploy --prod --legacy /out \
 && rm -rf /out/src /out/test /out/*.config.* /out/tsconfig*.json /out/nest-cli.json

# --- Runtime: sin pnpm, sin devDependencies, usuario sin privilegios ---
FROM node:26-alpine AS runtime
# Producción por defecto; docker-compose.yml lo cambia a development para la pila local por http.
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=10 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/main.js"]
