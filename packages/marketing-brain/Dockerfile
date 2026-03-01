# Build from monorepo root: docker build -f packages/marketing-brain/Dockerfile .
FROM node:20-slim AS build

# better-sqlite3 needs build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (copy package files first for layer caching)
COPY package.json package-lock.json ./
COPY packages/brain-core/package.json ./packages/brain-core/
COPY packages/marketing-brain/package.json ./packages/marketing-brain/
RUN npm ci --production=false

# Build brain-core first (marketing-brain depends on it)
COPY tsconfig.base.json ./
COPY packages/brain-core/ ./packages/brain-core/
RUN npm run build -w packages/brain-core

# Build marketing-brain
COPY packages/marketing-brain/ ./packages/marketing-brain/
RUN npm run build -w packages/marketing-brain

# Production stage
FROM node:20-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/brain-core/dist ./packages/brain-core/dist
COPY --from=build /app/packages/brain-core/package.json ./packages/brain-core/
COPY --from=build /app/packages/marketing-brain/dist ./packages/marketing-brain/dist
COPY --from=build /app/packages/marketing-brain/package.json ./packages/marketing-brain/
COPY --from=build /app/packages/marketing-brain/dashboard.html ./packages/marketing-brain/
COPY package.json ./

# Data directory for marketing-brain.db
RUN mkdir -p /data
ENV MARKETING_BRAIN_DATA_DIR=/data

EXPOSE 7781 7782 7783

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD node -e "require('http').get('http://localhost:7781/api/stats', r => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

ENTRYPOINT ["node", "packages/marketing-brain/dist/index.js"]
CMD ["daemon"]
