# How It Works

Brain is a background daemon that runs alongside your AI code editor. It uses MCP (Model Context Protocol) to expose tools that the AI can call, and a Hebbian synapse network to learn which solutions actually work.

## Architecture Overview

```
+------------------+     +------------------+     +------------------+
|   Claude Code    |     |  Cursor/Windsurf |     |  Browser/CI/CD   |
|   (MCP stdio)    |     |  (MCP HTTP/SSE)  |     |  (REST API)      |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         +----------+-------------+------------------------+
                    |
         +----------+-----------+
         |     Brain Core       |
         |  IPC · MCP · REST    |
         +----------+-----------+
                    |
    +---------------+---------------+
    |               |               |
    v               v               v
+--------+    +-----------+   +--------------+
|  Brain |    |  Trading  |   |  Marketing   |
| :7777  |<-->|  Brain    |<->|  Brain       |
| :7778  |    |  :7779    |   |  :7781       |
+--------+    |  :7780    |   |  :7782       |
    |         +-----------+   |  :7783       |
    |               |         +--------------+
    v               v               v
+--------+    +-----------+   +--------------+
| SQLite |    |   SQLite  |   |   SQLite     |
+--------+    +-----------+   +--------------+

Cross-brain peering via IPC named pipes
```

## Communication Layers

Brain supports three communication protocols, each serving a different client:

| Protocol | Transport | Used By | Port |
|----------|-----------|---------|------|
| **MCP stdio** | Standard I/O pipes | Claude Code | -- |
| **MCP HTTP/SSE** | Server-Sent Events over HTTP | Cursor, Windsurf, Cline, Continue | 7778 |
| **REST API** | Standard HTTP with JSON | Browsers, CI/CD, scripts | 7777 |
| **IPC** | Named pipes (Windows) / Unix sockets | Cross-brain communication | -- |

### MCP Tool Flow

When Claude Code decides to call a Brain tool, here is what happens:

1. Claude Code sends an MCP `tool/call` request via stdio to the Brain MCP server process.
2. The MCP server process forwards the call over IPC to the Brain daemon.
3. The daemon processes the request (database queries, synapse lookups, pattern matching).
4. The result flows back: daemon -> IPC -> MCP server -> Claude Code.

For HTTP clients (Cursor, Windsurf), the flow is similar but the MCP HTTP server runs inside the daemon itself, eliminating the IPC hop.

## Hebbian Learning

Brain uses a simplified model of Hebbian learning -- "neurons that fire together, wire together." In Brain's context:

- **Nodes** are errors, solutions, code modules, projects, rules, and insights.
- **Synapses** are weighted connections between nodes.
- When an error is fixed by a solution, the synapse between them **strengthens**.
- When a solution fails, the synapse **weakens**.
- Unused synapses **decay** over time and are eventually **pruned**.

This means Brain's confidence in a solution is not hardcoded -- it is learned from real outcomes. A solution that works across multiple projects will have strong synapses and high confidence. A solution that only worked once in unusual circumstances will have weak synapses and low confidence.

See [Hebbian Learning](/guide/hebbian-learning) for the full technical deep dive.

## Synapse Network

The synapse network is a weighted directed graph stored in SQLite. It connects all knowledge nodes:

```
error:42 --solved_by--> solution:7 --uses--> code_module:15
   |                                              |
   +--related_to--> error:38                      |
                       |                           |
                       +--in_project--> project:2 <+
```

Brain uses two key algorithms on this graph:

- **Spreading Activation** -- BFS traversal from a starting node, propagating energy through weighted connections. Used when you call `brain_explore` to find related knowledge.
- **Pathfinding** -- Finds the highest-weight path between two nodes. Used by `brain_connections` to show how things relate.

See [Synapse Networks](/guide/synapses) for details.

## Memory Persistence

All data is stored in SQLite with WAL (Write-Ahead Logging) mode enabled for fast concurrent reads. Each brain maintains its own database:

| Brain | Default Location |
|-------|-----------------|
| Brain | `~/.brain/brain.db` |
| Trading Brain | `~/.trading-brain/trading-brain.db` |
| Marketing Brain | `~/.marketing-brain/marketing-brain.db` |

The databases use:
- **FTS5** (Full-Text Search) for fast text matching
- **Foreign keys** for referential integrity
- **Migrations** for schema versioning (automatic on startup)
- **Indexes** on frequently queried columns

## Shared Infrastructure (Brain Core)

All three brains are built on `@timmeck/brain-core`, a shared package that provides:

| Component | Description |
|-----------|-------------|
| **IPC Protocol** | Length-prefixed JSON frames over named pipes / Unix sockets |
| **MCP Server** | Stdio transport with auto-daemon-start |
| **MCP HTTP Server** | SSE transport for HTTP-based editors |
| **REST API** | HTTP server with CORS, auth, SSE events, batch RPC |
| **Hebbian Synapse Network** | Weighted graph with strengthen, weaken, decay, activation, pathfinding |
| **Learning Engine** | Pattern extraction, rule generation with adaptive thresholds |
| **Research Engine** | Trend analysis, gap detection, synergy mapping |
| **Memory System** | Persistent memory with categories, importance, FTS5 search |
| **Cross-Brain Client** | Discover and query peer brains at runtime |
| **Cross-Brain Notifier** | Push event notifications to peers |
| **Wilson Score** | Statistical confidence intervals |
| **Time Decay** | Exponential half-life decay for freshness |
| **Embedding Engine** | Local all-MiniLM-L6-v2 ONNX embeddings for semantic search |

## The Learning Loop

Brain follows a continuous learning loop:

1. **Observe** -- Errors are caught, trade outcomes are recorded, posts are tracked.
2. **Store** -- Raw data goes into SQLite with full context.
3. **Connect** -- Synapses form between related entities.
4. **Learn** -- The learning engine extracts patterns and generates rules.
5. **Apply** -- When similar situations arise, Brain applies learned knowledge.
6. **Feedback** -- Success strengthens synapses; failure weakens them.
7. **Decay** -- Unused knowledge fades; actively used knowledge stays strong.

This loop runs continuously and automatically. No manual training is needed.
