# Marketing Brain

Self-learning marketing intelligence MCP server. Tracks posts, learns engagement patterns, suggests content strategy.

## Quick Reference

- **Package:** `@timmeck/marketing-brain` v0.4.0
- **Binary:** `marketing`
- **Ports:** 7781 (REST API), 7782 (MCP HTTP/SSE), 7783 (Dashboard SSE)
- **Data:** `~/.marketing-brain/` (SQLite, PID file, logs)
- **Config:** env vars (`MARKETING_BRAIN_DATA_DIR`, `MARKETING_BRAIN_API_PORT`, etc.)

## CLI Commands

```
marketing start          Start daemon (background, with watchdog)
marketing stop           Stop daemon
marketing status         Stats: posts, campaigns, synapses, insights
marketing doctor         Health check: daemon, DB, MCP, data dir
marketing post           Report published post for tracking
marketing campaign       Campaign management (create, list, stats)
marketing insights       Active marketing insights
marketing rules          Learned marketing rules
marketing suggest        Content suggestions for a topic
marketing dashboard      Interactive HTML dashboard (force-directed graph)
marketing learn          Trigger learning cycle manually
marketing network        Synapse network overview
marketing query          Search posts, strategies, insights
marketing config         View/set configuration
marketing export         Export all data as JSON
marketing import         Bulk import posts from JSON
marketing peers          Ecosystem peer status
```

## MCP Tools (17)

`marketing_post_draft`, `marketing_post_report`, `marketing_post_engagement`, `marketing_post_similar`,
`marketing_campaign_create`, `marketing_campaign_stats`,
`marketing_strategy_report`, `marketing_strategy_suggest`,
`marketing_template_find`, `marketing_rule_check`,
`marketing_insight_list`, `marketing_analytics_summary`, `marketing_analytics_best`,
`marketing_ecosystem_status`, `marketing_query_peer`, `marketing_cross_promote`, `marketing_trading_performance`

## Architecture

```
Claude Code → MCP Server (stdio) → MarketingCore → Services → SQLite
                                       ├── Post Tracker (engagement metrics)
                                       ├── Campaign Manager
                                       ├── Synapse Network (8 connection types)
                                       ├── Learning Engine (15-min cycles)
                                       ├── Research Engine (1-hr cycles)
                                       └── Template Extractor
```

## Development

```bash
npm run build          # TypeScript compile
npm test               # Vitest (85 tests)
npm run lint           # ESLint
npm run dev            # Run via tsx
```
