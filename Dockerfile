FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS build

WORKDIR /src
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN pnpm run build

FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS runtime

ARG VERSION=0.1.7
LABEL org.opencontainers.image.title="Cejel" \
      org.opencontainers.image.description="Offline deterministic engineering-trust certificates for repositories" \
      org.opencontainers.image.url="https://cejel.dev" \
      org.opencontainers.image.source="https://github.com/BargLabs/cejel" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      io.modelcontextprotocol.server.name="io.github.BargLabs/cejel"

WORKDIR /opt/cejel
COPY --from=build --chown=node:node /src/dist ./dist
COPY --chown=node:node package.json LICENSE ./
COPY --chown=root:root --chmod=0755 scripts/docker-entrypoint.sh /usr/local/bin/cejel-entrypoint

RUN chmod +x /opt/cejel/dist/index.js /opt/cejel/dist/mcp/index.js \
  && ln -s /opt/cejel/dist/index.js /usr/local/bin/cejel \
  && ln -s /opt/cejel/dist/mcp/index.js /usr/local/bin/cejel-mcp \
  && mkdir -p /workspace \
  && chown node:node /workspace

USER node
WORKDIR /workspace

ENTRYPOINT ["cejel-entrypoint"]
