# Build from monorepo root: docker build -f packages/trading-brain/Dockerfile .
FROM node:20-slim AS build

# better-sqlite3 needs build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (copy package files first for layer caching)
COPY package.json package-lock.json ./
COPY packages/brain-core/package.json ./packages/brain-core/
COPY packages/trading-brain/package.json ./packages/trading-brain/
RUN npm ci --production=false

# Build brain-core first (trading-brain depends on it)
COPY tsconfig.base.json ./
COPY packages/brain-core/ ./packages/brain-core/
RUN npm run build -w packages/brain-core

# Build trading-brain
COPY packages/trading-brain/ ./packages/trading-brain/
RUN npm run build -w packages/trading-brain

# Production stage
FROM node:20-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/brain-core/dist ./packages/brain-core/dist
COPY --from=build /app/packages/brain-core/package.json ./packages/brain-core/
COPY --from=build /app/packages/trading-brain/dist ./packages/trading-brain/dist
COPY --from=build /app/packages/trading-brain/package.json ./packages/trading-brain/
COPY package.json ./

# Data directory for trading-brain.db
RUN mkdir -p /data
ENV TRADING_BRAIN_DATA_DIR=/data

EXPOSE 7779 7780

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD node -e "require('http').get('http://localhost:7779/api/stats', r => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

ENTRYPOINT ["node", "packages/trading-brain/dist/index.js"]
CMD ["daemon"]
