# Trading Brain

Adaptive trading intelligence MCP server. Learns from trade outcomes, strengthens signal combinations that win.

## Quick Reference

- **Package:** `@timmeck/trading-brain` v2.31.82
- **Binary:** `trading`
- **Ports:** 7779 (REST API), 7780 (MCP HTTP/SSE)
- **Data:** `~/.trading-brain/` (SQLite, PID file, logs)
- **Config:** env vars (`TRADING_BRAIN_DATA_DIR`, `TRADING_BRAIN_API_PORT`, etc.)

## CLI Commands

```
trading start            Start daemon (background, with watchdog)
trading stop             Stop daemon
trading status           Stats: trades, rules, chains, insights, synapses
trading doctor           Health check: daemon, DB, IPC, ports
trading query <text>     Search trades by fingerprint, pair, or bot type
trading insights         Research insights (trends, gaps, synergies, regime shifts)
trading rules            Learned trading rules with confidence and win rate
trading network          Explore synapse network
trading dashboard        HTML dashboard in browser
trading peers            Ecosystem peer status
trading config           View/set configuration
trading export           Export all data as JSON
trading import <file>    Import trades from JSON array
```

## MCP Tools (181)

`trading_record_outcome`, `trading_signal_weights`, `trading_signal_confidence`,
`trading_dca_multiplier`, `trading_grid_params`, `trading_explore`, `trading_connections`,
`trading_rules`, `trading_insights`, `trading_chains`, `trading_query`, `trading_status`,
`trading_calibration`, `trading_learn`, `trading_reset`,
`trading_ecosystem_status`, `trading_query_peer`, `trading_error_context`

## Architecture

```
Claude Code → MCP Server (stdio) → TradingCore → Services → SQLite
                                       ├── Trade Memory (signal fingerprints)
                                       ├── Signal Brain (weighted strengths)
                                       ├── Synapse Network (Hebbian: "win together → wire together")
                                       ├── Strategy Brain (DCA multiplier, grid params)
                                       ├── Learning Engine (patterns, chains, calibration)
                                       ├── Research Engine (trends, gaps, synergies, regime shifts)
                                       ├── ActionBridge (risk-assessed auto-execution)
                                       ├── ContentForge (autonomous content pipeline)
                                       ├── CodeForge (pattern extraction, code generation)
                                       ├── StrategyForge (autonomous strategy creation)
                                       ├── PortfolioOptimizer (Kelly criterion sizing, HHI diversification)
                                       └── StrategyMutator (strategy evolution: mutate, crossover, selection)
```

## Development

```bash
npm run build          # TypeScript compile
npm test               # Vitest (518 tests across 35 test files)
npm run lint           # ESLint
npm run dev            # Run via tsx
```
