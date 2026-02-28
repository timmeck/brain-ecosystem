FROM node:20-slim AS base
WORKDIR /app

# better-sqlite3 requires native compilation tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install dependencies (copy package files first for layer caching)
COPY package.json package-lock.json ./
COPY packages/brain-core/package.json ./packages/brain-core/
COPY packages/brain/package.json ./packages/brain/
COPY packages/trading-brain/package.json ./packages/trading-brain/
COPY packages/marketing-brain/package.json ./packages/marketing-brain/
RUN npm ci --production=false

# Build all packages
COPY tsconfig.base.json ./
COPY packages/ ./packages/
RUN npm run build

# ── Brain ──
FROM node:20-slim AS brain
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/brain-core/dist ./packages/brain-core/dist
COPY --from=base /app/packages/brain-core/package.json ./packages/brain-core/
COPY --from=base /app/packages/brain/dist ./packages/brain/dist
COPY --from=base /app/packages/brain/package.json ./packages/brain/
COPY package.json ./
ENV BRAIN_DATA_DIR=/data
EXPOSE 7777 7778
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "require('http').get('http://localhost:7777/api/stats', r => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1
CMD ["node", "packages/brain/dist/index.js", "daemon"]

# ── Trading Brain ──
FROM node:20-slim AS trading-brain
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/brain-core/dist ./packages/brain-core/dist
COPY --from=base /app/packages/brain-core/package.json ./packages/brain-core/
COPY --from=base /app/packages/trading-brain/dist ./packages/trading-brain/dist
COPY --from=base /app/packages/trading-brain/package.json ./packages/trading-brain/
COPY package.json ./
ENV TRADING_BRAIN_DATA_DIR=/data
EXPOSE 7779 7780
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "require('http').get('http://localhost:7779/api/stats', r => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1
CMD ["node", "packages/trading-brain/dist/index.js", "daemon"]

# ── Marketing Brain ──
FROM node:20-slim AS marketing-brain
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/brain-core/dist ./packages/brain-core/dist
COPY --from=base /app/packages/brain-core/package.json ./packages/brain-core/
COPY --from=base /app/packages/marketing-brain/dist ./packages/marketing-brain/dist
COPY --from=base /app/packages/marketing-brain/package.json ./packages/marketing-brain/
COPY package.json ./
ENV MARKETING_BRAIN_DATA_DIR=/data
EXPOSE 7781 7782 7783
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "require('http').get('http://localhost:7781/api/stats', r => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1
CMD ["node", "packages/marketing-brain/dist/index.js", "daemon"]
