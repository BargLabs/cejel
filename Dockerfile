# The build stage runs once, on the builder's own platform, for every target platform (#421).
# dist/ is platform-independent JavaScript, byte-identical across platforms
# (docs/experiments/dist-determinism-2026-10-07), so each platform's image copies the same native
# build. Nothing here runs under emulation: an emulated arm64 `pnpm install` hung 2 of 20
# release-shape builds with a QEMU SIGILL, and a second, separate build is what let the SBOM's
# dist/ and the image's dist/ differ (#418).
FROM --platform=$BUILDPLATFORM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS build

WORKDIR /src
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY package.json pnpm-lock.yaml .npmrc ./
COPY scripts/assert-dev-environment.mjs ./scripts/assert-dev-environment.mjs
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsup.config.ts ./
COPY scripts/sbom/metafile-plugin.mjs ./scripts/sbom/metafile-plugin.mjs
COPY src ./src
RUN pnpm run build

# Prepare the runtime image's executable bits, bin links and /workspace here, natively, so the
# runtime stage has no RUN: for a foreign platform every RUN would execute under emulation.
RUN chmod +x dist/index.js dist/mcp/index.js \
  && mkdir -p /stage/usr/local/bin /stage/workspace \
  && ln -s /opt/cejel/dist/index.js /stage/usr/local/bin/cejel \
  && ln -s /opt/cejel/dist/mcp/index.js /stage/usr/local/bin/cejel-mcp

FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS runtime

ARG VERSION=0.6.2
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

# Copied, never run: this stage must stay free of RUN (CI builds it with no emulator installed).
COPY --from=build /stage/usr/local/bin/ /usr/local/bin/
COPY --from=build --chown=node:node /stage/workspace /workspace

USER node
WORKDIR /workspace

ENTRYPOINT ["cejel-entrypoint"]
