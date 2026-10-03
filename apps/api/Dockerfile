# Production image for the Express API (apps/api). Build from the repository root, since the
# API depends on the workspace package @noors/shared and the root lockfile:
#
#   docker build -f apps/api/Dockerfile -t noors-api .
#
# Database migrations are NOT run when the container starts. Railway runs them once per deploy,
# before traffic switches over, as the pre-deploy command in railway.json:
#
#   ./node_modules/.bin/prisma migrate deploy
#
# (run from this image's working directory, /app/apps/api). On another host, run that same
# command as a release step against the production DATABASE_URL before starting the new version.

FROM node:22-bookworm-slim AS base
# Prisma's migration engine checks the OpenSSL version; the slim image doesn't ship it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm \
  PATH=/pnpm:$PATH \
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# ─── Install: only the manifests, so this layer is cached until dependencies change ─────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# The API and what it depends on (the shared package); the web app's packages are skipped.
# Dev dependencies stay: the Prisma CLI runs the migrations from this image.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter "@noors/api..."

# ─── Build: shared package, Prisma client, API ───────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @noors/shared build \
  && pnpm --filter @noors/api build

# ─── Runtime ─────────────────────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/shared/node_modules packages/shared/node_modules
COPY --from=build /app/apps/api/package.json /app/apps/api/prisma.config.ts apps/api/
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/node_modules apps/api/node_modules

WORKDIR /app/apps/api
# The official image's unprivileged user. Nothing is written to disk in production
# (photos go to Cloudinary), so the app files can stay owned by root.
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
