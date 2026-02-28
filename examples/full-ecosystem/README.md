# Full Brain Ecosystem Setup (Docker)

This example runs the entire Brain Ecosystem using Docker Compose -- all three Brains with inter-process communication, shared volumes, and health checks.

## Architecture

```
                +------------------+
                |   brain (core)   |
                |  :7777 REST API  |
                |  :7778 MCP HTTP  |
                +--------+---------+
                         |
            +------------+------------+
            |                         |
  +---------+----------+   +----------+---------+
  |   trading-brain    |   |  marketing-brain   |
  |  :7779 REST API    |   |  :7781 REST API    |
  |  :7780 MCP HTTP    |   |  :7782 MCP HTTP    |
  +--------------------+   |  :7783 Dashboard   |
                           +--------------------+
```

All Brains communicate through shared IPC sockets and can exchange cross-brain events.

## Prerequisites

- Docker and Docker Compose
- At least 2 GB of available memory

## Quick Start

```bash
# Start all services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f

# Stop everything
docker compose down
```

## Services

| Service          | REST API | MCP HTTP | Dashboard | Description                        |
| ---------------- | -------- | -------- | --------- | ---------------------------------- |
| brain            | :7777    | :7778    |           | Error memory and code intelligence |
| trading-brain    | :7779    | :7780    |           | Trading signal intelligence        |
| marketing-brain  | :7781    | :7782    | :7783     | Marketing content intelligence     |

## Data Persistence

Each Brain stores data in a named Docker volume:

- `brain-data` -- Core Brain SQLite database
- `trading-data` -- Trading Brain SQLite database
- `marketing-data` -- Marketing Brain SQLite database
- `ipc-sockets` -- Shared IPC socket directory for cross-brain communication

Data persists across container restarts. To fully reset:

```bash
docker compose down -v   # -v removes volumes
```

## Connecting Claude Code

To use these Brains from Claude Code, point MCP configuration at the HTTP endpoints:

```json
{
  "mcpServers": {
    "brain": {
      "url": "http://localhost:7778"
    },
    "trading-brain": {
      "url": "http://localhost:7780"
    },
    "marketing-brain": {
      "url": "http://localhost:7782"
    }
  }
}
```

## Health Checks

The core Brain exposes a health endpoint. Trading Brain and Marketing Brain wait for the core Brain to be healthy before starting (via `depends_on` with `condition: service_healthy`).

## Environment Variables

| Variable                     | Default  | Description                           |
| ---------------------------- | -------- | ------------------------------------- |
| `BRAIN_DATA_DIR`             | `/data`  | Core Brain data directory             |
| `TRADING_BRAIN_DATA_DIR`     | `/data`  | Trading Brain data directory          |
| `MARKETING_BRAIN_DATA_DIR`   | `/data`  | Marketing Brain data directory        |
| `BRAIN_IPC_DIR`              | `/tmp/brain-ipc` | Shared IPC socket directory  |
