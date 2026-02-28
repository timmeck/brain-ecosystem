# CLI Commands Reference

Each brain in the ecosystem provides a full CLI for lifecycle management, querying, and data operations. The CLIs are installed globally with their respective npm packages.

## Brain CLI

Installed with `npm install -g @timmeck/brain`. The binary is `brain`.

### Lifecycle Commands

#### `brain setup`

Interactive setup wizard. Configures MCP registration for your AI editor, installs git hooks for automatic error detection, and starts the daemon.

```bash
brain setup
```

The wizard:
1. Detects your editor (Claude Code, Cursor, Windsurf, etc.)
2. Registers Brain as an MCP server
3. Installs PostToolUse hook for automatic error catching
4. Starts the background daemon
5. Validates the configuration

---

#### `brain start`

Start the Brain daemon as a background process.

```bash
brain start
```

The daemon runs on:
- Port 7777 (REST API)
- Port 7778 (MCP HTTP/SSE)
- Named pipe `brain` (IPC)

---

#### `brain stop`

Stop the running Brain daemon.

```bash
brain stop
```

---

#### `brain status`

Show current daemon status, database statistics, and connection information.

```bash
brain status
```

Output includes: version, PID, uptime, database path, REST/MCP URLs, error/solution/synapse counts.

---

#### `brain doctor`

Diagnose common issues. Checks MCP registration, daemon health, database connectivity, hook configuration, and peer brain availability.

```bash
brain doctor
```

### Query Commands

#### `brain query <text>`

Search errors by text. Returns matching errors with similarity scores.

```bash
brain query "TypeError: Cannot read property"
brain query "module not found"
```

---

#### `brain modules`

List all registered reusable code modules.

```bash
brain modules
```

---

#### `brain insights`

Show active research insights (trends, gaps, synergies, optimization suggestions).

```bash
brain insights
```

---

#### `brain network`

Show synapse network statistics: total nodes, total synapses, average weight, distribution by type.

```bash
brain network
```

---

#### `brain dashboard`

Open the web dashboard in your default browser.

```bash
brain dashboard
```

### Learning Commands

#### `brain learn`

Trigger a manual learning cycle. Extracts patterns from recent data, generates rules, runs decay, and recalibrates parameters.

```bash
brain learn
```

---

#### `brain explain <id>`

Explain a specific learned rule in detail. Shows the pattern, action, confidence, occurrences, and synapse connections.

```bash
brain explain 5
```

### Data Commands

#### `brain export`

Export the entire database to JSON files.

```bash
brain export
```

Output directory: `~/.brain/export/`

---

#### `brain import <dir>`

Import data from a JSON export.

```bash
brain import ~/.brain/export/
brain import /path/to/backup/
```

---

#### `brain peers`

Show connected peer brains and their status.

```bash
brain peers
```

---

## Trading Brain CLI

Installed with `npm install -g @timmeck/trading-brain`. The binary is `trading`.

### Lifecycle Commands

#### `trading setup`

Interactive setup wizard. Same flow as `brain setup` but for Trading Brain.

```bash
trading setup
```

---

#### `trading start`

Start the Trading Brain daemon.

```bash
trading start
```

Runs on port 7779 (REST) and 7780 (MCP HTTP/SSE).

---

#### `trading stop`

Stop the Trading Brain daemon.

```bash
trading stop
```

---

#### `trading status`

Show Trading Brain status and statistics.

```bash
trading status
```

---

#### `trading doctor`

Diagnose Trading Brain issues.

```bash
trading doctor
```

### Query Commands

#### `trading query <text>`

Search trades and signals.

```bash
trading query "BTC/USDT"
trading query "oversold_bullish"
```

---

#### `trading insights`

Show active trading research insights.

```bash
trading insights
```

---

#### `trading rules`

Show all learned trading rules with confidence scores.

```bash
trading rules
```

---

#### `trading network`

Show synapse network statistics.

```bash
trading network
```

---

#### `trading dashboard`

Open the Trading Brain web dashboard.

```bash
trading dashboard
```

### Data Commands

#### `trading export`

Export Trading Brain data to JSON.

```bash
trading export
```

---

#### `trading import <file>`

Import Trading Brain data from a JSON file.

```bash
trading import /path/to/export.json
```

---

#### `trading peers`

Show connected peer brains.

```bash
trading peers
```

---

## Marketing Brain CLI

Installed with `npm install -g @timmeck/marketing-brain`. The binary is `marketing`.

### Lifecycle Commands

#### `marketing setup`

Interactive setup wizard for Marketing Brain.

```bash
marketing setup
```

---

#### `marketing start`

Start the Marketing Brain daemon.

```bash
marketing start
```

Runs on port 7781 (REST), 7782 (MCP HTTP/SSE), and 7783 (Dashboard).

---

#### `marketing stop`

Stop the Marketing Brain daemon.

```bash
marketing stop
```

---

#### `marketing status`

Show Marketing Brain status and statistics.

```bash
marketing status
```

---

#### `marketing doctor`

Diagnose Marketing Brain issues.

```bash
marketing doctor
```

### Content Commands

#### `marketing post <platform>`

Report a published post interactively.

```bash
marketing post x
marketing post linkedin
marketing post reddit
```

---

#### `marketing campaign create <name>`

Create a new marketing campaign.

```bash
marketing campaign create "Brain Launch"
marketing campaign create "Q1 Content"
```

---

#### `marketing campaign stats <id>`

Show campaign performance statistics.

```bash
marketing campaign stats 1
```

---

#### `marketing suggest <topic>`

Get content suggestions based on a topic.

```bash
marketing suggest "developer tools"
marketing suggest "AI coding assistants"
```

### Query Commands

#### `marketing insights`

Show active marketing insights.

```bash
marketing insights
```

---

#### `marketing rules`

Show learned marketing rules.

```bash
marketing rules
```

---

#### `marketing query <search>`

Search posts and strategies.

```bash
marketing query "thread engagement"
marketing query "linkedin"
```

---

#### `marketing network`

Show synapse network statistics.

```bash
marketing network
```

---

#### `marketing dashboard`

Open the Marketing Brain interactive dashboard in your browser. The dashboard features a neural canvas background, force-directed synapse graph, and live SSE updates.

```bash
marketing dashboard
```

### Data Commands

#### `marketing export`

Export Marketing Brain data to JSON.

```bash
marketing export
```

---

#### `marketing peers`

Show connected peer brains.

```bash
marketing peers
```

## Common Patterns

### Start the entire ecosystem

```bash
brain start
trading start
marketing start
```

### Check ecosystem health

```bash
brain peers
# Shows: trading-brain (online), marketing-brain (online)
```

### Stop everything

```bash
marketing stop
trading stop
brain stop
```

### Full reset (start fresh)

```bash
brain stop && rm ~/.brain/brain.db && brain start
trading stop && rm ~/.trading-brain/trading-brain.db && trading start
marketing stop && rm ~/.marketing-brain/marketing-brain.db && marketing start
```
