# Brain

Adaptive error memory & code intelligence MCP server. Part of the Brain Ecosystem.

## Quick Reference

- **Package:** `@timmeck/brain` v2.1.0
- **Binary:** `brain`
- **Ports:** 7777 (REST API), 7778 (MCP HTTP/SSE)
- **Data:** `~/.brain/` (SQLite, PID file, logs)
- **Config:** `~/.brain/config.json` or env vars (`BRAIN_DATA_DIR`, `BRAIN_LOG_LEVEL`, etc.)

## CLI Commands

```
brain setup              One-command setup (MCP + hooks + daemon)
brain start              Start daemon (background, with watchdog)
brain stop               Stop daemon
brain status             Stats: errors, solutions, modules, synapses, insights
brain doctor             Health check: daemon, DB, MCP, hooks
brain query <text>       Search errors and solutions (hybrid: TF-IDF + vector + synapse)
brain modules            List registered code modules
brain insights           Research insights (trends, gaps, synergies)
brain learn              Trigger learning cycle manually
brain explain <id>       Full error report: solutions, chains, rules, insights
brain projects           List imported projects
brain import <dir>       Import project directory (scans for source files)
brain export             Export all data as JSON
brain network            Explore synapse network
brain dashboard          HTML dashboard (--live for SSE streaming)
brain config             View/set configuration
brain peers              Ecosystem peer status
brain guardrail          Guardrail status, health, rollback, circuit breaker reset
brain roadmap            Research roadmaps: list, show, ready, create
brain creative           Creative engine: status, insights, pollinate, analogies
brain action           Action queue, history, execute, stats
brain content          Content generate, publish, schedule, best
brain codeforge        CodeForge patterns, products, apply, status
brain strategy         Strategy list, create, performance, evolve
```

## MCP Tools (42)

`brain_report_error`, `brain_query_error`, `brain_report_solution`, `brain_report_attempt`,
`brain_find_reusable_code`, `brain_register_code`, `brain_check_code_similarity`,
`brain_explore`, `brain_connections`, `brain_insights`, `brain_rate_insight`,
`brain_suggest`, `brain_status`, `brain_notifications`,
`brain_ecosystem_status`, `brain_query_peer`, `brain_error_trading_context`,
`brain_guardrail_status`, `brain_guardrail_health`,
`brain_causal_diagnose`, `brain_causal_interventions`,
`brain_roadmap_list`, `brain_roadmap_progress`,
`brain_creative_pollinate`, `brain_creative_insights`, `brain_creative_analogies`,
`brain_action_queue`, `brain_action_execute`, `brain_action_history`, `brain_action_stats`,
`brain_content_generate`, `brain_content_publish`, `brain_content_schedule`, `brain_content_best`,
`brain_codeforge_patterns`, `brain_codeforge_generate`, `brain_codeforge_apply`, `brain_codeforge_products`,
`brain_strategy_create`, `brain_strategy_active`, `brain_strategy_performance`, `brain_strategy_evolve`

## Architecture

```
Claude Code → MCP Server (stdio) → BrainCore → Services → SQLite
                                       ├── Error Memory (fingerprint, hybrid match)
                                       ├── Code Module Registry
                                       ├── Synapse Network (Hebbian learning)
                                       ├── Learning Engine (patterns, rules, antipatterns)
                                       ├── Research Engine (trends, gaps, synergies)
                                       ├── Embedding Engine (all-MiniLM-L6-v2, local)
                                       ├── Git Intelligence (commit linking)
                                       ├── ActionBridge (risk-assessed auto-execution)
                                       ├── ContentForge (autonomous content pipeline)
                                       ├── CodeForge (pattern extraction, code generation)
                                       ├── StrategyForge (autonomous strategy creation)
                                       ├── ChatEngine (NLU routing + IPC dispatch)
                                       └── SubAgentFactory (specialized sub-agent creation)
```

Key directories: `src/cli/commands/`, `src/mcp/`, `src/db/`, `src/learning/`, `src/synapses/`, `src/code/`, `src/hooks/`

## Development

```bash
npm run build          # TypeScript compile
npm test               # Vitest (559 tests across 57 test files)
npm run lint           # ESLint
npm run dev            # Run via tsx (no build needed)
```

## Brain Ecosystem

| Package | Purpose | Ports |
|---------|---------|-------|
| **@timmeck/brain** (this) | Error memory & code intelligence | 7777/7778 |
| @timmeck/trading-brain | Trading intelligence & signal learning | 7779/7780 |
| @timmeck/marketing-brain | Marketing intelligence & content strategy | 7781/7782 |
| @timmeck/brain-core | Shared infrastructure (IPC, MCP, REST, CLI, math, synapses) | — |

Cross-brain communication via IPC named pipes. Events propagate automatically.
