# Marketing Brain

[![npm version](https://img.shields.io/npm/v/@timmeck/marketing-brain)](https://www.npmjs.com/package/@timmeck/marketing-brain)
[![npm downloads](https://img.shields.io/npm/dm/@timmeck/marketing-brain)](https://www.npmjs.com/package/@timmeck/marketing-brain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)

**Self-Learning Marketing Intelligence System for Claude Code**

Marketing Brain is an MCP server that gives Claude Code a persistent marketing memory. It tracks every post you publish, learns what works across platforms, and builds a Hebbian synapse network connecting posts, campaigns, strategies, templates, and insights. Over time, it learns your best-performing patterns and proactively suggests what to post, when, and where.

## Why Marketing Brain?

Without Marketing Brain, your marketing knowledge lives in your head. With it:

- **Posts are tracked** — Every post on X, Reddit, LinkedIn, Bluesky is stored with engagement metrics
- **Patterns emerge** — The learning engine finds your best posting times, formats, and platforms automatically
- **Strategies compound** — Successful strategies are recorded and suggested for similar future contexts
- **Rules are learned** — "Posts at 15:00 CET perform 2x better" — discovered and enforced automatically
- **Templates are extracted** — High-performing post structures become reusable templates
- **Gaps are detected** — "You never post on LinkedIn — potential?" — the research engine spots blind spots
- **Campaigns are connected** — Cross-promotion synergies between brands surface through the synapse network
- **Knowledge persists** — Every session builds on everything before it

## Features

### Core Intelligence
- **Post Tracking** — Store posts with platform, format, hashtags, URL, and full engagement history
- **Campaign Management** — Group posts into campaigns, track aggregate performance
- **Hebbian Synapse Network** — Weighted graph connecting posts, campaigns, strategies, templates, rules, audiences, and insights
- **Spreading Activation** — Explore related content by activating nodes in the network
- **Full-Text Search** — FTS5 indexes on posts, strategies, and templates

### Learning Engine (runs every 15 min)
- **Timing Patterns** — Discovers best/worst posting hours from engagement data
- **Format Patterns** — Finds which formats (text, image, video, thread) perform best
- **Platform Patterns** — Identifies your top-performing platform with Wilson Score confidence
- **Strategy Confidence** — Updates strategy scores based on real engagement
- **Rule Confidence** — Prunes low-confidence rules, promotes high-confidence ones
- **Similar Post Wiring** — Automatically connects similar posts in the synapse network

### Research Engine (runs every hour)
- **Trend Detection** — "Engagement on X is up 30% this week"
- **Gap Analysis** — "You haven't posted on LinkedIn yet — consider expanding"
- **Synergy Detection** — "Video + Monday = your best combo on Reddit"
- **Template Suggestions** — "Post #42 has high engagement — extract as template"
- **Optimization Ideas** — "Cross-post your top tweet as a LinkedIn article"

### Dashboard
- **HTML Dashboard** — Neural canvas background, glassmorphism UI, animated stats
- **Force-Directed Synapse Graph** — Interactive network visualization with drag, hover, tooltips
- **Platform Charts** — Color-coded distribution bars
- **Top Posts** — Engagement-scored post cards
- **Research Insights** — Tabbed view: Trends, Gaps, Synergies, Templates, Optimizations
- **Real-Time Updates** — SSE-powered live stats refresh every 30 seconds

### Never Forget — Memory & Sessions
- **Persistent Memory** — Store preferences, decisions, context, facts, goals, and lessons learned
- **Key-Based Upsert** — Update existing memories by unique key, auto-superseding old values
- **Full-Text Search** — Natural language recall with FTS5-powered search
- **Session Tracking** — Track conversation goals, summaries, and outcomes
- **Importance Scoring** — 1–10 importance scale with category-based organization
- **Synapse-Wired** — Memories and sessions connect to the Hebbian network via 'remembers' edges

### MCP Tools (22 tools for Claude Code)
- **Draft Checking** — Check a post against learned rules before publishing
- **Post Reporting** — Track published posts with one command
- **Engagement Updates** — Feed in likes, shares, impressions as they come
- **Strategy Memory** — Report what worked, get suggestions for what's next
- **Template Library** — Find and reuse high-performing post structures
- **Memory & Sessions** — Store and recall memories, track session goals and outcomes
- **Analytics** — Full dashboard data accessible from Claude Code

## Quick Start

### Installation

```bash
npm install -g @timmeck/marketing-brain
marketing setup
```

That's it. One command configures MCP and starts the daemon.

Or install globally and configure manually:

```bash
npm install -g @timmeck/marketing-brain
```

### Setup with Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "marketing-brain": {
      "command": "marketing",
      "args": ["mcp-server"]
    }
  }
}
```

### Setup with Cursor / Windsurf / Cline / Continue

Marketing Brain supports MCP over HTTP with SSE transport:

```json
{
  "marketing-brain": {
    "url": "http://localhost:7782/sse"
  }
}
```

Make sure the daemon is running (`marketing start`).

### Start the Daemon

```bash
marketing start
marketing status
marketing doctor    # verify everything works (5/5 green)
```

## CLI Commands

### Daemon Management
```
marketing setup                  One-command setup: MCP + daemon
marketing start                  Start the daemon
marketing stop                   Stop the daemon
marketing status                 Show stats (posts, campaigns, synapses, insights)
marketing doctor                 Health check (daemon, DB, MCP, data dir)
```

### Content Management
```
marketing post <platform> [url]  Report a published post
marketing campaign create <name> Create a campaign
marketing campaign list          List all campaigns
marketing campaign stats <id>    Show campaign performance
marketing import <file.json>     Bulk import posts from JSON
```

### Intelligence
```
marketing insights               Show current marketing insights
marketing rules                  Show learned marketing rules
marketing suggest <topic>        Get content suggestions for a topic
marketing learn                  Trigger a learning cycle manually
marketing query <search>         Search posts, strategies, and insights
```

### Visualization & Export
```
marketing dashboard              Open interactive HTML dashboard in browser
marketing network                Show synapse network overview
marketing network --node post:42 Explore a specific node's connections
marketing export                 Export all data as JSON
```

### Ecosystem
```
marketing peers                  Show status of peer brains in the ecosystem
```

### Configuration
```
marketing config show            Show current configuration
marketing config set <key> <val> Set a config value (e.g., learning.intervalMs 600000)
marketing config delete <key>    Revert a config key to default
marketing config path            Show config file location
```

### Example Workflow

```bash
# Track a new post
marketing post x --content "Just shipped v2.0!" --campaign "Product Launch" --hashtags "#launch,#dev"

# Update engagement later
# (via MCP tool or API: marketing_post_engagement)

# See what the brain learned
marketing insights
marketing rules
marketing learn

# Open the visual dashboard
marketing dashboard

# Explore the synapse network
marketing network
marketing network --node post:1

# Search across everything
marketing query "developer tools"

# Export your data
marketing export > marketing-data.json

# Get suggestions before your next post
marketing suggest "developer tools"
```

## MCP Tools

These tools are available to Claude Code when Marketing Brain is configured:

| Tool | Description |
|------|-------------|
| `marketing_post_draft` | Check a post draft against learned rules |
| `marketing_post_report` | Report a published post |
| `marketing_post_engagement` | Update engagement metrics (likes, shares, etc.) |
| `marketing_post_similar` | Find similar posts via synapse network |
| `marketing_campaign_create` | Create a new campaign |
| `marketing_campaign_stats` | Get campaign performance stats |
| `marketing_strategy_report` | Report a strategy that worked |
| `marketing_strategy_suggest` | Get strategy suggestions for a context |
| `marketing_template_find` | Find reusable content templates |
| `marketing_rule_check` | Check content against all learned rules |
| `marketing_insight_list` | Get active insights (trends, gaps, synergies) |
| `marketing_analytics_summary` | Full analytics overview |
| `marketing_analytics_best` | Top performing posts and strategies |
| `marketing_extract_patterns` | Extract timing, format, platform & content patterns (new in v1.1) |
| `marketing_track_ab_test` | Create A/B test with statistical significance tracking (new in v1.1) |
| `marketing_ab_test_result` | Record data point for A/B test variant (new in v1.1) |
| `marketing_content_calendar` | Get optimal posting schedule from learned patterns (new in v1.1) |
| `marketing_ecosystem_status` | Get status of all brains in the ecosystem |
| `marketing_query_peer` | Query another brain in the ecosystem (method + params) |
| `marketing_remember` | Store a memory (preference, decision, context, fact, goal, lesson) |
| `marketing_recall` | Search memories by natural language query |
| `marketing_session_start` | Start a session with optional goals |
| `marketing_session_end` | End a session with summary and outcome |
| `marketing_session_history` | List past sessions with summaries |
| `marketing_cross_promote` | Pull Brain insights as content ideas for cross-promotion |
| `marketing_trading_performance` | Pull Trading Brain stats for performance-related posts |

## REST API

Marketing Brain includes a REST API on port 7781 (default).

```bash
# Health check
curl http://localhost:7781/api/v1/health

# List all available methods
curl http://localhost:7781/api/v1/methods

# Call any method via RPC
curl -X POST http://localhost:7781/api/v1/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "analytics.summary", "params": {}}'
```

## Dashboard Server

The daemon starts a live dashboard server on port 7783 (default).

```bash
# Open the dashboard in your browser
marketing dashboard

# Or visit directly while the daemon is running
open http://localhost:7783
```

Features:
- Real-time stats updates via Server-Sent Events (SSE)
- Interactive force-directed synapse network graph
- Platform distribution charts
- Top performing posts with engagement scores
- Research insights organized by type
- Neural canvas background with mouse interaction

## Architecture

```
+------------------+     +------------------+     +------------------+     +------------------+
|   Claude Code    |     |  Cursor/Windsurf |     |  Browser/CI/CD   |     |  Dashboard       |
|   (MCP stdio)    |     |  (MCP HTTP/SSE)  |     |  (REST API)      |     |  (SSE live)      |
+--------+---------+     +--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |                        |
         v                        v                        v                        v
+--------+---------+     +--------+---------+     +--------+---------+     +--------+---------+
|   MCP Server     |     |   MCP HTTP/SSE   |     |    REST API      |     | Dashboard Server |
|   (stdio)        |     |   (port 7782)    |     |   (port 7781)    |     |   (port 7783)    |
+--------+---------+     +--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         +----------+-------------+----------+-------------+----------+
                    |
                    v
         +----------+-----------+
         |    MarketingCore     |
         |  (Daemon / Services) |
         +----------+-----------+
                    |
    +-------+-------+--------+-------+
    |       |       |        |       |
    v       v       v        v       v
+---+--+ +--+---+ +-+-----+ +-+--+ +-+------+
|Post  | |Camp- | |Synapse| |Rule| |Template|
|Track | |aigns | |Network| |Eng.| |Library |
+---+--+ +--+---+ +-+-----+ +-+--+ +-+------+
    |       |       |        |       |
    v       v       v        v       v
+---+--+ +--+---+ +-+-----+ +-+--+ +-+------+
|Learn | |Strat-| |Hebbian| |Ins-| |Audience|
|Engine| |egies | |Learn  | |ight| |Segments|
+------+ +------+ +-------+ +----+ +--------+
                    |
                    v
         +----------+-----------+
         |     SQLite (DB)      |
         |  better-sqlite3      |
         +----------------------+
```

### Synapse Types

```
post → campaign        (belongs_to)
post → post            (similar_to)
post → audience        (engages_with)
strategy → post        (improves)
rule → post            (prevents / recommends)
template → post        (generated_from)
campaign → campaign    (cross_promotes)
insight → campaign     (informs)
session → memory       (remembers)
```

## How It Learns

1. **Post Reported** — You publish a post and report it via CLI or MCP tool
2. **Engagement Tracked** — Likes, shares, impressions are updated over time
3. **Synapses Form** — Post ↔ Campaign, Post ↔ Post (similar), Strategy ↔ Post connections are created
4. **Patterns Extracted** — Learning engine finds timing, format, and platform patterns
5. **Rules Generated** — High-confidence patterns become rules with Wilson Score confidence
6. **Research Runs** — Trends, gaps, and synergies are surfaced as actionable insights
7. **Next Time** — When you draft a new post, Marketing Brain checks it against rules and suggests proven strategies

## Configuration

Configure via environment variables, CLI, or `~/.marketing-brain/config.json`:

```bash
# View current config
marketing config show

# Set a value
marketing config set learning.intervalMs 600000
marketing config set research.trendWindowDays 14

# Revert to default
marketing config delete learning.intervalMs
```

### Environment Variables

| Env Variable | Default | Description |
|---|---|---|
| `MARKETING_BRAIN_DATA_DIR` | `~/.marketing-brain` | Data directory |
| `MARKETING_BRAIN_LOG_LEVEL` | `info` | Log level |
| `MARKETING_BRAIN_API_PORT` | `7781` | REST API port |
| `MARKETING_BRAIN_API_KEY` | — | API authentication key |
| `MARKETING_BRAIN_DB_PATH` | `~/.marketing-brain/marketing-brain.db` | Database path |

### Ports

| Service | Default Port | Description |
|---|---|---|
| REST API | 7781 | JSON-RPC endpoint for integrations |
| MCP HTTP | 7782 | MCP HTTP transport (optional) |
| Dashboard | 7783 | Live dashboard with SSE |

## Tech Stack

- **TypeScript** — Full type safety, ES2022, ESM modules
- **better-sqlite3** — Embedded SQLite with WAL mode
- **MCP SDK** — Model Context Protocol integration (stdio + HTTP/SSE transports)
- **Commander** — CLI framework
- **Chalk** — Colored terminal output
- **Winston** — Structured logging

## Brain Ecosystem

Marketing Brain is part of the **[Brain Ecosystem](https://github.com/timmeck/brain-ecosystem)** — a monorepo of MCP servers that give Claude Code persistent, self-learning memory.

| Brain | Purpose | Ports |
|-------|---------|-------|
| [Brain](https://github.com/timmeck/brain-ecosystem/tree/main/packages/brain) v3.0.0 | Error memory, code intelligence & persistent context | 7777 / 7778 |
| [Trading Brain](https://github.com/timmeck/brain-ecosystem/tree/main/packages/trading-brain) v2.0.0 | Adaptive trading intelligence with memory & sessions | 7779 / 7780 |
| **Marketing Brain** v1.1.0 | Content strategy & engagement with memory & sessions | **7781** / 7782 / 7783 |
| [Brain Core](https://github.com/timmeck/brain-ecosystem/tree/main/packages/brain-core) v2.0.0 | Shared infrastructure (IPC, MCP, REST, CLI, math, synapses, memory) | — |
| [Brain Hub](https://timmeck.github.io/brain-hub/) | Ecosystem landing page | — |

All packages live in the [brain-ecosystem](https://github.com/timmeck/brain-ecosystem) monorepo with npm workspaces. [Brain Core](https://www.npmjs.com/package/@timmeck/brain-core) provides shared infrastructure (IPC, MCP, REST API, CLI, math, synapse algorithms) used by all brains, eliminating ~2,800 lines of duplicated code.

### Cross-Brain Communication

Brains discover and query each other at runtime via IPC named pipes. Use `marketing peers` to see online peers, or the `marketing_query_peer` / `marketing_ecosystem_status` MCP tools to access peer data from Claude Code. Use `marketing_cross_promote` to pull Brain insights as content ideas, or `marketing_trading_performance` to pull Trading Brain stats for performance posts. Brains also push event notifications — when Marketing Brain publishes a post or creates a campaign, peers are notified automatically.

### Ecosystem Dashboard

The interactive HTML dashboard (`marketing dashboard`) includes an Ecosystem Peers section showing the live status of all connected brains.

## Support

If Marketing Brain helps you, consider giving it a star — it helps others discover the project and keeps development going.

[![Star this repo](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)
[![Sponsor](https://img.shields.io/badge/Sponsor-Support%20Development-ea4aaa)](https://github.com/sponsors/timmeck)

## License

[MIT](LICENSE)
