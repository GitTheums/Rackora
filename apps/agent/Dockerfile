# syntax=docker/dockerfile:1

# Rackora Agent — multi-stage build from monorepo root.
# Build: docker compose -f deploy/compose/dev-agent/compose.yml build

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.13.1 --activate
WORKDIR /app

FROM base AS build
# Workspace manifests (lockfile-aware install)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/config/package.json ./packages/config/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/agent/package.json ./apps/agent/package.json
# Stub other workspace package.json files so the lockfile resolves
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile --filter @rackora/agent...

# Sources required to compile shared + agent
COPY packages/config ./packages/config
COPY packages/shared ./packages/shared
COPY apps/agent ./apps/agent

RUN pnpm --filter @rackora/shared build \
  && pnpm --filter @rackora/agent build \
  && pnpm --filter @rackora/agent deploy --prod --legacy /out

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG DOCKER_GID=999
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/* \
  && (getent group "${DOCKER_GID}" >/dev/null \
      || groupadd --gid "${DOCKER_GID}" docker) \
  && useradd \
      --uid 10001 \
      --gid "${DOCKER_GID}" \
      --create-home \
      --home-dir /home/rackora \
      --shell /usr/sbin/nologin \
      rackora \
  && mkdir -p /data \
  && chown 10001:"${DOCKER_GID}" /data

WORKDIR /app
COPY --from=build --chown=10001:${DOCKER_GID} /out/ ./

ENV NODE_ENV=production \
    DATA_DIR=/data \
    AGENT_DATA_DIR=/data \
    DOCKER_SOCKET=/var/run/docker.sock

USER 10001
VOLUME ["/data"]
# Outbound-only agent — no ports published
STOPSIGNAL SIGTERM
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
