# Brain Core

Shared infrastructure library for the Brain Ecosystem. Not an MCP server itself — provides the building blocks.

## Quick Reference

- **Package:** `@timmeck/brain-core` v2.36.93
- **Type:** Library (no CLI, no daemon)
- **Used by:** brain, trading-brain, marketing-brain

## Key Modules

| Module | Export Path | Purpose |
|--------|------------|---------|
| IPC | `@timmeck/brain-core` | IpcServer, IpcClient, protocol encoding |
| MCP | `@timmeck/brain-core` | startMcpServer, McpHttpServer (stdio + SSE) |
| REST API | `@timmeck/brain-core` | BaseApiServer with CORS, auth, RPC |
| CLI Colors | `@timmeck/brain-core` | c (palette), header, keyValue, divider, table |
| DB | `@timmeck/brain-core` | createConnection (better-sqlite3 with WAL) |
| Math | `@timmeck/brain-core` | wilsonScore, timeDecayFactor |
| Config | `@timmeck/brain-core` | deepMerge, loadConfigFile |
| Synapses | `@timmeck/brain-core` | strengthen, weaken, decayAll, spreadingActivation, findPath, BaseSynapseManager |
| Engines | `@timmeck/brain-core` | BaseLearningEngine, BaseResearchEngine |
| Cross-Brain | `@timmeck/brain-core` | CrossBrainClient, CrossBrainNotifier |
| Utils | `@timmeck/brain-core` | sha256, createLogger, normalizePath, getDataDir, getPipeName, TypedEventBus |
| Action | `@timmeck/brain-core` | ActionBridgeEngine: risk-assessed auto-execution |
| Content | `@timmeck/brain-core` | ContentForge: autonomous content pipeline |
| CodeForge | `@timmeck/brain-core` | CodeForge: pattern extraction, code generation |
| Strategy | `@timmeck/brain-core` | StrategyForge: autonomous strategy creation |
| ChatEngine | `@timmeck/brain-core` | NLU intent routing + IPC dispatch |
| SubAgent | `@timmeck/brain-core` | SubAgentFactory: specialized sub-agent creation |
| FeedbackRouter | `@timmeck/brain-core` | Dead-end data → ActionBridge proposals |
| StrategyMutator | `@timmeck/brain-core` | Strategy evolution: mutate, crossover, selection |
| SignalRouter | `@timmeck/brain-core` | CrossBrainSignalRouter: bidirectional cross-brain signals |
| AutoPublisher | `@timmeck/brain-core` | Autonomous content publishing pipeline |
| Governance | `@timmeck/brain-core` | EngineRegistry, RuntimeInfluenceTracker, LoopDetector, GovernanceLayer |

## Development

```bash
npm run build          # TypeScript compile
npm test               # Vitest (2,867 tests across 202 test files)
npm run lint           # ESLint
```

## Creating a New Brain

Extend the base classes from brain-core. See `src/index.ts` for all exports. Pattern: create IPC router, register MCP tools, extend BaseLearningEngine + BaseResearchEngine, use BaseSynapseManager for the graph.
