FROM node:22-slim

# better-sqlite3 needs build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/ dist/
COPY dashboard.html ./
COPY package.json ./

# Data directory for marketing-brain.db
RUN mkdir -p /data
ENV MARKETING_BRAIN_DATA_DIR=/data

EXPOSE 7781 7782

ENTRYPOINT ["node", "dist/index.js"]
CMD ["mcp-server"]
