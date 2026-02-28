# Brain Core

[![npm version](https://img.shields.io/npm/v/@timmeck/brain-core)](https://www.npmjs.com/package/@timmeck/brain-core)
[![npm downloads](https://img.shields.io/npm/dm/@timmeck/brain-core)](https://www.npmjs.com/package/@timmeck/brain-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/timmeck/brain-core?style=social)](https://github.com/timmeck/brain-core)

**Shared infrastructure for the Brain ecosystem — IPC, MCP, CLI, DB, math, synapses, and utilities.**

Brain Core extracts the common infrastructure used across all Brain MCP servers ([Brain](https://github.com/timmeck/brain), [Trading Brain](https://github.com/timmeck/trading-brain), [Marketing Brain](https://github.com/timmeck/marketing-brain)) into a single, reusable package.

## What's Included

| Module | Description |
|--------|-------------|
| **IPC Protocol** | Length-prefixed JSON frames over named pipes (Windows) / Unix sockets |
| **IPC Server** | Named pipe server with auto-recovery of stale pipes |
| **IPC Client** | Client with request/response, timeouts, and notification support |
| **MCP Server** | Stdio transport for Claude Code with auto-daemon-start |
| **MCP HTTP Server** | SSE transport for Cursor, Windsurf, Cline, Continue |
| **REST API Server** | Base HTTP server with CORS, auth, SSE events, batch RPC |
| **DB Connection** | SQLite (better-sqlite3) with WAL mode, foreign keys, caching |
| **CLI Colors** | Shared color palette, formatting helpers (header, table, badges) |
| **Logger** | Winston-based structured logging with file rotation |
| **Event Bus** | Generic typed event emitter |
| **Cross-Brain Client** | Discover and query peer brains over IPC named pipes |
| **Cross-Brain Notifier** | Push event notifications to peer brains (new in v1.5) |
| **Math — Wilson Score** | Statistical confidence intervals for win rates / rule confidence |
| **Math — Time Decay** | Exponential half-life decay for synapse and rule freshness |
| **Config Loader** | `deepMerge()` + `loadConfigFile()` for layered config |
| **Synapse Algorithms** | Hebbian learning, decay, spreading activation, A* pathfinding |
| **BaseSynapseManager** | Abstract synapse manager with strengthen/weaken/activate/findPath/decay |
| **BaseLearningEngine** | Abstract timer-managed learning engine with error handling |
| **BaseResearchEngine** | Abstract timer-managed research engine with optional initial delay |
| **BaseMemoryEngine** | Abstract timer-managed memory engine for expiry/consolidation/decay (new in v1.6) |
| **Memory Types** | Shared types for Memory, Session, Remember/Recall/Session interfaces (new in v1.6) |
| **Utils** | Path normalization, data dir resolution, SHA-256 hashing |

## Installation

```bash
npm install @timmeck/brain-core
```

## Usage

### Building a new Brain

```typescript
import {
  createLogger,
  getDataDir,
  getPipeName,
  createConnection,
  IpcServer,
  IpcClient,
  startMcpServer,
  McpHttpServer,
  BaseApiServer,
  TypedEventBus,
  c, header, keyValue,
} from '@timmeck/brain-core';

// 1. Configure for your brain
const dataDir = getDataDir('MY_BRAIN_DATA_DIR', '.my-brain');
createLogger({ envVar: 'MY_BRAIN_LOG_LEVEL', dataDir, defaultFilename: 'my-brain.log' });

// 2. Database
const db = createConnection(`${dataDir}/my-brain.db`);

// 3. Typed events
interface MyBrainEvents {
  'item:created': { itemId: number };
  'item:updated': { itemId: number };
}
const bus = new TypedEventBus<MyBrainEvents>();
bus.on('item:created', ({ itemId }) => console.log(`Item ${itemId} created`));

// 4. IPC Server
const router = new MyRouter(services); // implements IpcRouter interface
const ipcServer = new IpcServer(router, getPipeName('my-brain'), 'my-brain');
ipcServer.start();

// 5. REST API (extend BaseApiServer for custom routes)
class MyApiServer extends BaseApiServer {
  protected buildRoutes() {
    return [
      { method: 'GET', pattern: /^\/api\/v1\/items$/, ipcMethod: 'item.list',
        extractParams: () => ({}) },
    ];
  }
}

// 6. MCP Server (stdio)
await startMcpServer({
  name: 'my-brain',
  version: '1.0.0',
  entryPoint: import.meta.filename,
  registerTools: (server, ipc) => { /* register MCP tools */ },
});

// 7. CLI output
console.log(header('My Brain Status'));
console.log(keyValue('Items', 42));
console.log(c.success('All systems operational'));
```

### IPC Router Interface

Your brain must implement the `IpcRouter` interface:

```typescript
import type { IpcRouter } from '@timmeck/brain-core';

class MyRouter implements IpcRouter {
  handle(method: string, params: unknown): unknown {
    switch (method) {
      case 'item.list': return this.itemService.list();
      case 'item.get': return this.itemService.get(params);
      default: throw new Error(`Unknown method: ${method}`);
    }
  }

  listMethods(): string[] {
    return ['item.list', 'item.get'];
  }
}
```

## Architecture

```
@timmeck/brain-core
├── Types ──────── IpcMessage, SynapseRecord, NodeRef, NetworkStats
├── Utils ──────── hash, logger, paths, events
├── DB ─────────── SQLite connection (WAL mode)
├── IPC ────────── protocol, server, client
├── MCP ────────── stdio server, HTTP/SSE server
├── CLI ────────── colors, formatting helpers
├── API ────────── BaseApiServer (CORS, auth, RPC, SSE)
├── Math ───────── Wilson Score, Time Decay
├── Config ─────── deepMerge, loadConfigFile
├── Synapses ───── Hebbian, Decay, Activation, Pathfinder, BaseSynapseManager
├── Learning ───── BaseLearningEngine (abstract, timer-managed)
├── Research ───── BaseResearchEngine (abstract, timer-managed)
├── Memory ────── BaseMemoryEngine, MemoryRecord, SessionRecord, shared interfaces
└── Cross-Brain ── CrossBrainClient, CrossBrainNotifier
```

## Brain Ecosystem

| Brain | Version | Purpose | Ports |
|-------|---------|---------|-------|
| [Brain](https://github.com/timmeck/brain) | v2.2.0 | Error memory, code intelligence & persistent context | 7777/7778 |
| [Trading Brain](https://github.com/timmeck/trading-brain) | v1.3.0 | Adaptive trading intelligence with memory & sessions | 7779/7780 |
| [Marketing Brain](https://github.com/timmeck/marketing-brain) | v0.5.0 | Content strategy & engagement with memory & sessions | 7781/7782/7783 |
| [Brain Core](https://github.com/timmeck/brain-core) | v1.6.0 | Shared infrastructure (this package) | — |

All three brains are standalone — brain-core is an **optional** shared dependency that eliminates ~600 lines of duplicated code across the ecosystem.

## Cross-Brain Communication

`CrossBrainClient` lets brains discover and query each other over IPC named pipes. Each brain exposes a `status` IPC method returning its name, version, uptime, pid, and method count — enabling automatic peer discovery without central coordination.

```typescript
import { CrossBrainClient, CrossBrainNotifier } from '@timmeck/brain-core';

// Query peers
const cross = new CrossBrainClient('brain');
const peers = await cross.getAvailablePeers();
// → [{ name: 'trading-brain', version: '1.3.0', uptime: 3600, pid: 12345, methods: 18 }, ...]

// Push event notifications to peers (v1.5+)
const notifier = new CrossBrainNotifier(cross, 'brain');
notifier.notify('error:reported', { errorId: 42, fingerprint: 'ENOENT' });
notifier.notifyPeer('trading-brain', 'insight:created', { insightId: 7 });
```

### Base Engines

Abstract base classes eliminate timer boilerplate from learning and research engines:

```typescript
import { BaseLearningEngine, BaseResearchEngine, BaseMemoryEngine } from '@timmeck/brain-core';

class MyLearningEngine extends BaseLearningEngine {
  runCycle() { /* your learning logic */ }
}

class MyResearchEngine extends BaseResearchEngine {
  runCycle() { /* your research logic */ }
}

class MyMemoryEngine extends BaseMemoryEngine {
  runCycle() { /* expiry checks, consolidation, importance decay */ }
}
```

Visit the [Brain Hub](https://timmeck.github.io/brain-hub/) for the full ecosystem overview.

## Support

If Brain Core helps you, consider giving it a star — it helps others discover the project and keeps development going.

[![Star this repo](https://img.shields.io/github/stars/timmeck/brain-core?style=social)](https://github.com/timmeck/brain-core)
[![Sponsor](https://img.shields.io/badge/Sponsor-Support%20Development-ea4aaa)](https://github.com/sponsors/timmeck)

## License

[MIT](LICENSE)
