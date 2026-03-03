# Stage 1: Build
FROM node:20 AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./

# Copy package manifests
COPY packages/shared/package.json packages/shared/
COPY packages/daemon/package.json packages/daemon/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared/ packages/shared/
COPY packages/daemon/ packages/daemon/

# Build shared first, then daemon (turbo handles ordering)
RUN pnpm turbo build --filter=@merry/daemon

# Stage 2: Runtime
FROM node:20-slim

WORKDIR /app

# Copy built output and production dependencies
COPY --from=builder /app/packages/daemon/dist ./packages/daemon/dist
COPY --from=builder /app/packages/daemon/package.json ./packages/daemon/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/

# Copy node_modules (pnpm hoists to root; package-level dirs may not exist)
COPY --from=builder /app/node_modules ./node_modules
RUN --mount=from=builder,source=/app/packages,target=/tmp/pkgs \
    cp -r /tmp/pkgs/daemon/node_modules ./packages/daemon/node_modules 2>/dev/null || true && \
    cp -r /tmp/pkgs/shared/node_modules ./packages/shared/node_modules 2>/dev/null || true

# Copy workspace config for module resolution
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./

# Copy agent definitions
COPY agents/ ./agents/

# Create data directory mount point
RUN mkdir -p /app/data/memory

ENV NODE_ENV=production
ENV MERRY_PORT=3141
ENV MERRY_ROOT=/app
# ANTHROPIC_API_KEY is injected at runtime via docker-compose env_file

EXPOSE 3141

WORKDIR /app/packages/daemon

CMD ["node", "dist/index.js"]
