# Docker Deployment

The Brain ecosystem can be deployed as Docker containers using Docker Compose. This is useful for running Brain on a server, in CI/CD pipelines, or anywhere you want isolated, reproducible environments.

## Quick Start

```bash
docker-compose up -d
```

This starts all three brains with persistent data volumes, shared IPC sockets for cross-brain communication, and automatic restart on failure.

## docker-compose.yml

The project includes a `docker-compose.yml` at the repository root:

```yaml
services:
  brain:
    build:
      context: .
      target: brain
    volumes:
      - brain-data:/data
      - ipc-sockets:/tmp/brain-ipc
    ports:
      - "7777:7777"   # REST API
      - "7778:7778"   # MCP HTTP
    environment:
      - BRAIN_DATA_DIR=/data
      - BRAIN_IPC_DIR=/tmp/brain-ipc
    restart: unless-stopped

  trading-brain:
    build:
      context: .
      target: trading-brain
    volumes:
      - trading-data:/data
      - ipc-sockets:/tmp/brain-ipc
    ports:
      - "7779:7779"   # REST API
      - "7780:7780"   # MCP HTTP
    environment:
      - TRADING_BRAIN_DATA_DIR=/data
      - BRAIN_IPC_DIR=/tmp/brain-ipc
    depends_on:
      brain:
        condition: service_healthy
    restart: unless-stopped

  marketing-brain:
    build:
      context: .
      target: marketing-brain
    volumes:
      - marketing-data:/data
      - ipc-sockets:/tmp/brain-ipc
    ports:
      - "7781:7781"   # REST API
      - "7782:7782"   # MCP HTTP
      - "7783:7783"   # Dashboard
    environment:
      - MARKETING_BRAIN_DATA_DIR=/data
      - BRAIN_IPC_DIR=/tmp/brain-ipc
    depends_on:
      brain:
        condition: service_healthy
    restart: unless-stopped

volumes:
  brain-data:
  trading-data:
  marketing-data:
  ipc-sockets:
```

## Dockerfile

The repository uses a multi-stage Dockerfile that builds all three brains from a single build context:

1. **Base stage**: Installs Node.js 20 and sets up the workspace.
2. **Build stage**: Installs dependencies and builds all TypeScript packages.
3. **Brain stage**: Copies only the Brain package and its runtime dependencies.
4. **Trading Brain stage**: Same for Trading Brain.
5. **Marketing Brain stage**: Same for Marketing Brain.

Each stage produces a minimal image containing only what is needed to run that specific brain.

## Volume Management

### Data Volumes

Each brain stores its SQLite database in a named Docker volume:

| Volume | Container Path | Contains |
|--------|---------------|----------|
| `brain-data` | `/data` | `brain.db`, config, logs |
| `trading-data` | `/data` | `trading-brain.db`, config, logs |
| `marketing-data` | `/data` | `marketing-brain.db`, config, logs |

Data persists across container restarts and image updates. To inspect a volume:

```bash
docker volume inspect brain-ecosystem_brain-data
```

### IPC Socket Volume

The `ipc-sockets` volume is shared between all three containers and holds the Unix domain sockets used for cross-brain IPC communication. This allows brains to discover and query each other even inside containers.

```bash
docker volume inspect brain-ecosystem_ipc-sockets
```

## Port Mapping

| Host Port | Container Port | Service |
|-----------|---------------|---------|
| 7777 | 7777 | Brain REST API |
| 7778 | 7778 | Brain MCP HTTP/SSE |
| 7779 | 7779 | Trading Brain REST API |
| 7780 | 7780 | Trading Brain MCP HTTP/SSE |
| 7781 | 7781 | Marketing Brain REST API |
| 7782 | 7782 | Marketing Brain MCP HTTP/SSE |
| 7783 | 7783 | Marketing Brain Dashboard |

To connect an AI editor to Docker-hosted brains, use the MCP HTTP endpoints:

```json
{
  "brain": { "url": "http://localhost:7778/sse" },
  "trading-brain": { "url": "http://localhost:7780/sse" },
  "marketing-brain": { "url": "http://localhost:7782/sse" }
}
```

## Individual Services

You do not need to run all three brains. Start individual services:

```bash
# Only the main brain
docker-compose up brain -d

# Brain + Trading Brain
docker-compose up brain trading-brain -d

# View logs
docker-compose logs brain
docker-compose logs -f trading-brain   # follow mode

# Stop everything
docker-compose down

# Stop and remove volumes (WARNING: deletes all data)
docker-compose down -v
```

## Service Dependencies

- `trading-brain` depends on `brain` (waits for health check)
- `marketing-brain` depends on `brain` (waits for health check)
- `brain` has no dependencies

This ensures Brain starts first and is healthy before Trading Brain or Marketing Brain attempt to connect.

## Scaling Considerations

### Single-machine deployment

The default `docker-compose.yml` is designed for single-machine deployment. All three brains share the same `ipc-sockets` volume, which only works when containers run on the same Docker host.

### Multi-machine deployment

For multi-machine deployment, you would need to:

1. Replace IPC socket communication with network-based communication (the REST API or MCP HTTP endpoints can serve this purpose).
2. Use a shared filesystem or network volume for the IPC socket volume, or reconfigure cross-brain communication to use HTTP.
3. Update the peer discovery configuration to use network addresses instead of local pipe names.

### Resource usage

Each brain uses approximately:

- **Memory**: 50-150 MB (depends on database size and embedding model)
- **CPU**: Minimal (< 1% idle, spikes during learning cycles)
- **Disk**: 10-100 MB per database (depends on data volume)

Brain (the main one) uses more memory than the others because it loads the all-MiniLM-L6-v2 embedding model (~23 MB) for semantic search.

## Backup and Restore

### Backup

Copy the SQLite databases from the Docker volumes:

```bash
# Create backup directory
mkdir -p backups

# Backup each brain's database
docker cp $(docker-compose ps -q brain):/data/brain.db backups/
docker cp $(docker-compose ps -q trading-brain):/data/trading-brain.db backups/
docker cp $(docker-compose ps -q marketing-brain):/data/marketing-brain.db backups/
```

### Restore

Copy databases back into the volumes:

```bash
docker cp backups/brain.db $(docker-compose ps -q brain):/data/
docker-compose restart brain
```

### Export/Import

Each brain also supports JSON export/import:

```bash
# Export from a running container
docker-compose exec brain brain export

# Import
docker-compose exec brain brain import /data/export/
```
