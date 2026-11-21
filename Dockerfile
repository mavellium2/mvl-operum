# ── Base: Node 22 Alpine + pnpm via corepack ──────────────────────────────────
# corepack is bundled with Node 18+; no npm install -g pnpm needed.
FROM node:22-alpine AS base
RUN for attempt in 1 2 3; do \
      if apk update && apk upgrade --no-cache libcrypto3 libssl3 && apk add --no-cache libc6-compat; then exit 0; fi; \
      sleep 2; \
    done; exit 1
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PNPM_HOME/bin:$PATH"
RUN corepack enable

# ── Stage: Download Prisma schema-engine ──────────────────────────────────────
# Plain Alpine Node (no corepack shims) so npm runs unmodified.
# npm writes to /usr/local/lib — always writable, unlike pnpm's content store.
# The @prisma/engines postinstall downloads the musl binary here.
# test -f at the end makes the build fail loudly if the download was skipped.
FROM node:22-alpine AS engine-dl
RUN for attempt in 1 2 3; do \
      if apk update && apk upgrade --no-cache libcrypto3 libssl3; then exit 0; fi; \
      sleep 2; \
    done; exit 1
RUN npm install -g prisma@7.7.0 \
 && find /usr/local/lib/node_modules -name "schema-engine-linux-musl-openssl-3.0.x" -type f \
    | head -1 \
    | xargs cp -t /tmp/ \
 && test -f /tmp/schema-engine-linux-musl-openssl-3.0.x

# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
# Both files are required explicitly — no glob that silently skips the lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml pnpm.yaml ./
COPY patches ./patches
# --frozen-lockfile: fails loudly if lockfile is missing or out of sync.
# --ignore-scripts: skips postinstall (prisma generate) — we run it explicitly in builder.
RUN pnpm install --frozen-lockfile --ignore-scripts

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# Copy schema-engine binary from engine-dl stage so prisma generate doesn't
# need to download it (avoids network flakes in CI).
COPY --from=engine-dl /tmp/schema-engine-linux-musl-openssl-3.0.x /usr/local/bin/prisma-schema-engine
RUN chmod 755 /usr/local/bin/prisma-schema-engine
ENV PRISMA_SCHEMA_ENGINE_BINARY=/usr/local/bin/prisma-schema-engine
# Copy source after node_modules to maximise layer cache hits.
COPY . .
# Generate Prisma client into lib/generated/prisma (output defined in prisma.config.ts).
# DATABASE_URL is not needed for generation — only the schema is read.
# Set NODE_ENV before build so bundler tree-shakes dev code paths.
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm exec prisma generate
RUN pnpm build

# ── Stage 3: Runner ───────────────────────────────────────────────────────────
# node:22-alpine directly (not base) — base enables corepack which shims npm.
# The shim reads packageManager from the standalone package.json and refuses to
# run npm install, breaking the prisma CLI setup below. The runner doesn't use
# pnpm, so corepack is not needed here.
FROM node:22-alpine AS runner
RUN for attempt in 1 2 3; do \
      if apk update && apk upgrade --no-cache libcrypto3 libssl3 && apk add --no-cache libc6-compat; then exit 0; fi; \
      sleep 2; \
    done; exit 1
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Schema-engine binary baked in from the engine-dl stage (npm install to a
# writable dir). PRISMA_SCHEMA_ENGINE_BINARY overrides the default search paths
# so the prisma CLI uses this binary instead of trying to download one.
COPY --from=engine-dl /tmp/schema-engine-linux-musl-openssl-3.0.x /usr/local/bin/prisma-schema-engine
RUN chmod 750 /usr/local/bin/prisma-schema-engine \
 && chown nextjs:nodejs /usr/local/bin/prisma-schema-engine
ENV PRISMA_SCHEMA_ENGINE_BINARY=/usr/local/bin/prisma-schema-engine

# Next.js standalone output (includes a self-contained server.js + minimal node_modules).
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma client (generated) — required by server.js for all DB queries at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/lib/generated ./lib/generated

# Prisma schema + config — required by the migrate service at deploy time.
# chown so the nextjs user can read them without world-readable permissions.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

# Prisma CLI for the migrate service — installed LOCALLY into ./node_modules
# (not --global). prisma.config.ts does `import { defineConfig } from "prisma/config"`,
# a subpath of the `prisma` package; Node can only resolve that from /app/node_modules,
# never from a global pnpm store. Plain npm produces a flat node_modules (no pnpm
# symlinks), so it can be merged into the standalone bundle with a plain directory copy.
# Ownership is chowned on the source before copying (cp -a preserves it) and scoped
# to nextjs:nodejs — world-execute removed (750 vs 755) — same posture as before.
# Instala o Prisma isoladamente para evitar o merge destrutivo do `cp` no Alpine.
# O symlink garante que o Node resolva 'prisma/config' a partir do ./node_modules local.
# Overrides aplicados aqui porque prisma@7.7.0 pina "mysql2": "3.15.3" e usa
# effect 3.20.0 via @prisma/config, ambos vulneráveis (GHSA-3f6p-5ww8-9rcr e
# CVE-2026-121707). Este install isolado usa npm (não pnpm), então não herda o
# override do pnpm-workspace.yaml da raiz.
RUN mkdir -p /app/prisma-cli \
 && printf '{"name":"prisma-cli","private":true,"overrides":{"deepmerge-ts":">=8.0.0","mysql2":"3.24.2","effect":">=3.22.1 <4.0.0"}}' > /app/prisma-cli/package.json \
 && npm install prisma@7.7.0 --no-save --prefix /app/prisma-cli \
 && node -e "const v=require('/app/prisma-cli/node_modules/mysql2/package.json').version; if (v !== '3.24.2') { console.error('mysql2 override falhou: esperado 3.24.2, obtido ' + v); process.exit(1); }" \
 && node -e "const v=require('/app/prisma-cli/node_modules/effect/package.json').version; const [m,n,p]=v.split('.').map(Number); if (m!==3 || n<22 || (n===22 && p<1)) { console.error('effect override falhou: esperado >=3.22.1 <4, obtido ' + v); process.exit(1); }" \
 && chown -R nextjs:nodejs /app/prisma-cli \
 && chmod -R 750 /app/prisma-cli \
 && ln -s /app/prisma-cli/node_modules/prisma ./node_modules/prisma

ENV PATH="/app/prisma-cli/node_modules/.bin:/app/node_modules/.bin:$PATH"

# npm's own vendored dependencies (bundled with the node:22-alpine base image)
# carry known CVEs (brace-expansion, tar, ip-address, sigstore). npm already
# did its one job above (installing the prisma CLI) — nothing at runtime
# invokes npm/npx, so strip it to remove the vulnerable files from the image.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx



USER nextjs

# Declare the listening port — informational only, does not publish the port.
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
