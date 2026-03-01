# Build from monorepo root: docker build -f packages/brain/Dockerfile .
FROM node:20-slim AS build

# better-sqlite3 needs build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (copy package files first for layer caching)
COPY package.json package-lock.json ./
COPY packages/brain-core/package.json ./packages/brain-core/
COPY packages/brain/package.json ./packages/brain/
RUN npm ci --production=false

# Build brain-core first (brain depends on it)
COPY tsconfig.base.json ./
COPY packages/brain-core/ ./packages/brain-core/
RUN npm run build -w packages/brain-core

# Build brain
COPY packages/brain/ ./packages/brain/
RUN npm run build -w packages/brain

# Production stage
FROM node:20-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/brain-core/dist ./packages/brain-core/dist
COPY --from=build /app/packages/brain-core/package.json ./packages/brain-core/
COPY --from=build /app/packages/brain/dist ./packages/brain/dist
COPY --from=build /app/packages/brain/package.json ./packages/brain/
COPY package.json ./

# Data directory for brain.db
RUN mkdir -p /data
ENV BRAIN_DATA_DIR=/data

EXPOSE 7777 7778

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD node -e "require('http').get('http://localhost:7777/api/stats', r => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

ENTRYPOINT ["node", "packages/brain/dist/index.js"]
CMD ["daemon"]
