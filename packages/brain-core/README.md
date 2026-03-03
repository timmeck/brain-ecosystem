# Brain Core

[![npm version](https://img.shields.io/npm/v/@timmeck/brain-core)](https://www.npmjs.com/package/@timmeck/brain-core)
[![npm downloads](https://img.shields.io/npm/dm/@timmeck/brain-core)](https://www.npmjs.com/package/@timmeck/brain-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)

**Shared infrastructure for the Brain Ecosystem — 30+ autonomous engines, synapses, IPC, MCP, dream mode, consciousness, prediction, reasoning, emotions, evolution, self-modification, and more.**

Brain Core is the nervous system that powers all three Brain MCP servers ([Brain](https://github.com/timmeck/brain-ecosystem/tree/main/packages/brain), [Trading Brain](https://github.com/timmeck/brain-ecosystem/tree/main/packages/trading-brain), [Marketing Brain](https://github.com/timmeck/brain-ecosystem/tree/main/packages/marketing-brain)). A 40-step feedback orchestrator runs 30+ engines in autonomic cycles — the brain observes itself, forms hypotheses, runs experiments, dreams, debates, reasons in chains, feels emotions, evolves strategies genetically, and modifies its own source code. All packages live in the [brain-ecosystem](https://github.com/timmeck/brain-ecosystem) monorepo.

## What's Included

### Communication & API

| Module | Description |
|--------|-------------|
| **IPC Protocol** | Length-prefixed JSON frames over named pipes / Unix sockets |
| **IPC Server** | Named pipe server with auto-recovery of stale pipes |
| **IPC Client** | Request/response with timeouts and notification support |
| **MCP Server** | Stdio transport for Claude Code with auto-daemon-start |
| **MCP HTTP Server** | SSE transport for Cursor, Windsurf, Cline, Continue |
| **REST API Server** | HTTP server with CORS, auth, SSE events, batch RPC |
| **IPC Validation** | Parameter validation (string 10KB, array 1000, depth 10) |
| **IPC Errors** | Structured errors: IpcError, ValidationError, NotFoundError, TimeoutError |
| **Security Middleware** | RateLimiter (token bucket), body size limits, security headers |

### Synapse Network & Learning

| Module | Description |
|--------|-------------|
| **Hebbian Learning** | Weighted graph — "neurons that fire together wire together" |
| **Synapse Decay** | Exponential half-life decay for freshness |
| **Spreading Activation** | BFS-based energy propagation through the graph |
| **A* Pathfinding** | Find shortest paths between nodes |
| **BaseSynapseManager** | Abstract manager with strengthen/weaken/activate/findPath/decay |
| **BaseLearningEngine** | Abstract timer-managed learning engine |
| **BaseResearchEngine** | Abstract timer-managed research engine |
| **BaseMemoryEngine** | Abstract memory engine for expiry/consolidation/decay |
| **Wilson Score** | Statistical confidence intervals for win rates |
| **Time Decay** | Exponential half-life decay for rule freshness |

### 30+ Autonomous Engines

#### Core Research (9 engines)

| Engine | Description |
|--------|-------------|
| **SelfObserver** | Brain observes its own performance metrics and generates insights |
| **AnomalyDetective** | Detects statistical outliers using Z-scores and drift analysis |
| **CrossDomainEngine** | Finds correlations between events across different brains |
| **AdaptiveStrategy** | Adjusts strategies based on outcomes, reverts if performance drops |
| **ExperimentEngine** | Designs and runs A/B tests on brain parameters |
| **KnowledgeDistiller** | Extracts principles from confirmed hypotheses |
| **ResearchAgenda** | Prioritizes what should be researched next |
| **CounterfactualEngine** | "What if" analysis — estimates impact of hypothetical interventions |
| **ResearchJournal** | Logs all discoveries, experiments, and breakthroughs |

#### Intelligence & Awareness

| Engine | Description |
|--------|-------------|
| **AttentionEngine** | Dynamic focus, context detection, burst detection, engine weight allocation |
| **TransferEngine** | Cross-brain knowledge transfer, analogies, cross-domain rules |
| **NarrativeEngine** | Brain explains itself in natural language, finds contradictions, generates digests |
| **CuriosityEngine** | Knowledge gap detection, UCB1 explore/exploit, blind spot detection |
| **EmergenceEngine** | Emergent behavior detection, complexity metrics (entropy, phi), phase transitions |
| **DebateEngine** | Multi-agent debates, advocatus diaboli, consensus synthesis |
| **ReasoningEngine** | Forward chaining, abductive reasoning, temporal inference, counterfactuals |
| **EmotionalModel** | 8 emotion dimensions, 6 moods, mood-based behavior recommendations |

#### Meta-Cognition & Optimization

| Engine | Description |
|--------|-------------|
| **ParameterRegistry** | Central tunable parameter store with 30+ parameters, bounds, snapshots |
| **MetaCognitionLayer** | Engine performance grading (A-F), frequency adjustment |
| **AutoExperimentEngine** | Autonomous parameter tuning with snapshot/rollback |
| **EvolutionEngine** | Genetic algorithm — tournament selection, crossover, mutation, elitism |
| **GoalEngine** | Goal planning with progress tracking, linear regression forecasting |
| **MemoryPalace** | Knowledge graph with BFS pathfinding and auto-connection building |

#### Autonomy & Self-Improvement

| Engine | Description |
|--------|-------------|
| **SelfTestEngine** | Tests if brain truly understands its principles vs memorization |
| **TeachEngine** | Generates teaching packages for other brains |
| **DataScout** | External data acquisition from GitHub/npm/HN |
| **SimulationEngine** | What-if scenarios via CausalGraph + PredictionEngine |
| **SelfScanner** | Indexes own TypeScript source code with SHA256 change detection |
| **SelfModificationEngine** | Generates and tests code changes autonomously via Claude API |
| **BootstrapService** | Cold-start fix: seeds data so engines produce output from cycle 1 |

### Orchestration & Core

| Module | Description |
|--------|-------------|
| **ResearchOrchestrator** | 40-step feedback cycle orchestrating all engines every 5 minutes |
| **DataMiner** | Bootstraps historical DB data into engines with adapter pattern |
| **AutonomousResearchScheduler** | Self-directed research cycle execution |
| **MetaLearningEngine** | Hyper-parameter optimization with Bayesian exploration |
| **CausalGraph** | Granger causality analysis for event relationships |
| **HypothesisEngine** | Forms and tests hypotheses (temporal, correlation, threshold, creative) |
| **AutoResponder** | Anomaly → automatic parameter adjustment, escalation, resolution |
| **PredictionEngine** | Holt-Winters + EWMA forecasting with auto-calibration |

### Dream Mode & Consciousness

| Module | Description |
|--------|-------------|
| **DreamEngine** | Offline memory consolidation — replay, prune, compress, decay |
| **DreamConsolidator** | 4 phases: Memory Replay, Synapse Pruning, Compression, Importance Decay |
| **ThoughtStream** | Circular buffer capturing every engine's thoughts in real-time |
| **ConsciousnessServer** | HTTP + SSE server with live neural dashboard (legacy — now part of Mission Control) |

### Code Generation & Mining

| Module | Description |
|--------|-------------|
| **CodeGenerator** | Claude API integration — generates code using brain knowledge as context |
| **ContextBuilder** | Builds system prompts from principles, anti-patterns, strategies, patterns |
| **CodeMiner** | Mines GitHub repos: README, package.json, directory structures |
| **PatternExtractor** | Extracts dependency, tech stack, structure, and README patterns |
| **CodegenServer** | HTTP + SSE dashboard for code review (legacy — now part of Mission Control) |
| **SignalScanner** | GitHub trending repos, Hacker News, crypto signal tracking |

### Dashboards

| Dashboard | Port | Description |
|-----------|------|-------------|
| **Mission Control** | 7788 | Unified 7-tab dashboard: Overview, Neural Graph, Thoughts, CodeGen, Self-Mod, Engines, Intelligence |

### Cross-Brain & Services

| Module | Description |
|--------|-------------|
| **CrossBrainClient** | Discover and query peer brains over IPC |
| **CrossBrainNotifier** | Push event notifications to peers |
| **CrossBrainCorrelator** | Correlate events across brains (error-trade-loss, publish-during-errors) |
| **EcosystemService** | Aggregated status, health score 0–100, analytics |
| **WebhookService** | HMAC-SHA256 signed webhooks with exponential retry |
| **ExportService** | JSON/CSV export with date range and column filters |
| **BackupService** | Timestamped SQLite backups with integrity verification |

### Utilities

| Module | Description |
|--------|-------------|
| **DB Connection** | SQLite (better-sqlite3) with WAL mode, foreign keys, caching |
| **Logger** | Winston-based structured logging with file rotation |
| **Event Bus** | Generic typed event emitter |
| **CLI Colors** | Shared color palette, formatting helpers (header, table, badges) |
| **Config Loader** | `deepMerge()` + `loadConfigFile()` for layered config |
| **Embedding Engine** | Local vector embeddings with @huggingface/transformers |
| **Memory Types** | Shared types for Memory, Session, Remember/Recall interfaces |

## Installation

```bash
npm install @timmeck/brain-core
```

## Usage

### Building a new Brain

```typescript
import {
  createConnection, IpcServer, startMcpServer,
  ResearchOrchestrator, DreamEngine, ThoughtStream,
  UnifiedDashboardServer, PredictionEngine,
} from '@timmeck/brain-core';

// 1. Database
const db = createConnection('~/.my-brain/my-brain.db');

// 2. Research Orchestrator (30+ engines, 40-step feedback cycle)
const orchestrator = new ResearchOrchestrator(db, { brainName: 'my-brain' });
orchestrator.start();

// 3. Dream Mode
const dreamEngine = new DreamEngine(db, { brainName: 'my-brain' });
orchestrator.setDreamEngine(dreamEngine);
dreamEngine.start();

// 4. Consciousness
const thoughtStream = new ThoughtStream();
orchestrator.setThoughtStream(thoughtStream);
// Unified Mission Control dashboard (includes Neural Graph, Thoughts, CodeGen, Self-Mod, Engines)
const dashboard = new UnifiedDashboardServer({ port: 7790, thoughtStream, ... });
dashboard.start();

// 5. Predictions
const prediction = new PredictionEngine(db, { brainName: 'my-brain' });
orchestrator.setPredictionEngine(prediction);
prediction.start();
```

## Architecture

```
@timmeck/brain-core
├── IPC ────────── protocol, server, client, validation, errors
├── MCP ────────── stdio server, HTTP/SSE server
├── API ────────── BaseApiServer, RateLimiter, security middleware
├── Synapses ───── Hebbian, Decay, Activation, Pathfinder, BaseSynapseManager
├── Research ───── ResearchOrchestrator (40 steps), DataMiner, BootstrapService
│   ├── Core ───── SelfObserver, AnomalyDetective, Experiment, Adaptive, Agenda
│   ├── Core ───── KnowledgeDistiller, Counterfactual, CrossDomain, Journal
│   └── AutoResp ─ AutoResponder (anomaly → action)
├── Intelligence ─ Attention, Transfer, Narrative, Curiosity, Emergence, Debate
├── Reasoning ──── ReasoningEngine (forward chain, abduction, temporal, counterfactual)
├── Emotional ──── EmotionalModel (8 dimensions, 6 moods)
├── MetaCog ────── ParameterRegistry, MetaCognitionLayer, AutoExperimentEngine
├── Evolution ──── EvolutionEngine (genetic algorithm)
├── Goals ─────── GoalEngine (planning, progress, forecasting)
├── MemoryPalace ─ Knowledge graph, BFS pathfinding
├── SelfAware ──── SelfTest, Teach, DataScout, Simulation
├── SelfMod ────── SelfScanner, SelfModificationEngine
├── Dream ──────── DreamEngine, DreamConsolidator
├── Consciousness  ThoughtStream, ConsciousnessServer
├── Prediction ─── PredictionEngine, Holt-Winters, EWMA, Calibration
├── CodeGen ────── CodeGenerator, CodeMiner, PatternExtractor, CodegenServer
├── Scanner ────── SignalScanner, GitHubCollector, HnCollector, CryptoCollector
├── Causal ─────── CausalGraph (Granger causality), HypothesisEngine
├── Cross-Brain ── Client, Notifier, Correlator, Subscriptions
├── Dashboard ──── Mission Control (Unified), Consciousness*, CodeGen*, Hub*, Research*
├── Services ───── Webhook, Export, Backup, Ecosystem
├── Memory ─────── BaseMemoryEngine, types
├── DB ─────────── SQLite connection (WAL mode)
└── Utils ─────── hash, logger, paths, events, math, config, CLI
```

## Brain Ecosystem

| Brain | Version | Purpose | Ports |
|-------|---------|---------|-------|
| [Brain](../brain) | v3.34.0 | Error memory, code intelligence, full autonomy & self-modification | 7777/7778/7788 |
| [Trading Brain](../trading-brain) | v2.29.0 | Adaptive trading intelligence with signal learning & backtesting | 7779/7780 |
| [Marketing Brain](../marketing-brain) | v1.30.0 | Content strategy, engagement & cross-platform optimization | 7781/7782/7783 |
| **Brain Core** | v2.34.0 | Shared infrastructure — 30+ engines (this package) | — |

## Support

[![Star this repo](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)
[![Sponsor](https://img.shields.io/badge/Sponsor-Support%20Development-ea4aaa)](https://github.com/sponsors/timmeck)

## License

[MIT](LICENSE)
