# =========================================================================
# SettleMate AI — Production Container Dockerfile (Multi-Stage)
# Base Image: Node.js 22 (Debian / glibc / official build toolchain)
# =========================================================================

# --- STAGE 1: Dependency Installation ---
FROM node:22 AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Configure target provider for production PostgreSQL
ENV PRISMA_TARGET_PROVIDER=postgresql

RUN npm ci

# --- STAGE 2: Build Application ---
FROM node:22 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Explicitly configure PostgreSQL Prisma generation for the production container
ENV PRISMA_TARGET_PROVIDER=postgresql

# Generate both Prisma Clients (SQLite types for TS build & PostgreSQL for production runtime)
RUN npx prisma generate --schema=prisma/schema.prisma && npx prisma generate --schema=prisma/schema.postgresql.prisma
RUN npx next build

# Compile production migration runner into pure Node.js JavaScript
RUN npx esbuild scripts/init-postgres.ts --bundle --platform=node --target=node22 --outfile=scripts/init-postgres.js --external:pg --external:dotenv

# --- STAGE 3: Production Runner ---
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Security: Create non-root system user and group
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 -g nodejs nextjs

# Create persistent storage volume mount point with non-root ownership
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# Copy static assets and standalone server bundle
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma-client-postgres ./node_modules/@prisma-client-postgres
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy compiled migration runner and startup entrypoint
COPY --from=builder --chown=nextjs:nodejs /app/scripts/init-postgres.js ./scripts/init-postgres.js
COPY --chown=nextjs:nodejs scripts/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER nextjs

EXPOSE 3000

# Healthcheck configuration: probe real database health via /api/v1/health using native Node.js fetch
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
