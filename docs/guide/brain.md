# Brain -- Error Memory & Code Intelligence

Brain is the flagship package of the ecosystem. It provides 28 MCP tools for error tracking, code reuse, persistent memory, session management, decision history, semantic changelogs, and task tracking.

## Key Features

### Error Memory

Brain tracks every error that occurs across all your projects. When a new error appears, Brain searches its database using hybrid matching:

- **TF-IDF** text similarity for error message matching
- **Vector embeddings** (local all-MiniLM-L6-v2, 23MB, no cloud calls) for semantic similarity
- **Synapse boost** to rank solutions that have proven track records

When a match is found, Brain returns the known solution with a confidence score based on how many times it has successfully resolved similar errors.

### Cross-Project Learning

Solutions are not scoped to a single project. An error you fixed in Project A can help solve the same error in Project B. Brain's cross-project matching means your entire development experience contributes to faster fixes everywhere.

### Code Intelligence

Register reusable code modules and discover them later. Brain analyzes source code for structure, complexity, and reusability, assigning a reusability score. Before writing new code, you can check if similar implementations already exist.

### Persistent Memory

Store and recall arbitrary memories organized by category:

| Category | Use Case |
|----------|----------|
| `preference` | "Always use Vitest for testing" |
| `decision` | "Chose SQLite over PostgreSQL for local-first" |
| `context` | "This project uses ESM modules exclusively" |
| `fact` | "The production database is on us-east-1" |
| `goal` | "Migrate all tests to Vitest by end of sprint" |
| `lesson` | "Never run migrations without a backup" |

Memories support key-based upsert. Setting the same key again supersedes the old value, so Brain always has the latest information.

### Session Tracking

Brain automatically tracks conversation sessions with goals, summaries, and outcomes. Ask "what was I working on?" and Brain can recall your last sessions with full context.

### Decision History

Record architecture and design decisions with alternatives considered, pros/cons, and rationale. Later, ask "why did we choose Vitest?" and Brain can recall the full decision context.

### Semantic Changelog

Track what changed in your codebase and why. Each change record links to the error it fixes or the decision it implements, creating a connected web of knowledge.

### Task/Goal Tracking

Manage tasks with priorities, due dates, subtasks, and blocking dependencies. Each task aggregates related context: memories, decisions, and changes.

### Proactive Prevention

Brain learns antipatterns -- code patterns that frequently lead to errors. When it detects you writing code that matches a known antipattern, it warns you before the error happens.

## CLI Commands

```bash
# Lifecycle
brain setup          # Configure MCP, hooks, start daemon
brain start          # Start the daemon
brain stop           # Stop the daemon
brain status         # Show daemon status and stats
brain doctor         # Diagnose issues

# Querying
brain query <text>   # Search errors by text
brain modules        # List registered code modules
brain insights       # Show active research insights
brain network        # Show synapse network stats
brain dashboard      # Open the web dashboard

# Learning
brain learn          # Trigger a manual learning cycle
brain explain <id>   # Explain a specific rule

# Data
brain export         # Export database to JSON
brain import <dir>   # Import from a JSON export
brain peers          # Show connected peer brains
```

## MCP Tools

Brain exposes 28 MCP tools organized into categories. See the [Brain MCP Tools Reference](/api/) for full parameter details.

### Error Tools
- `brain_report_error` -- Report an error for matching and storage
- `brain_query_error` -- Search for similar errors and solutions
- `brain_report_solution` -- Report a successful fix
- `brain_report_attempt` -- Report a failed fix attempt

### Code Tools
- `brain_find_reusable_code` -- Search for reusable code modules
- `brain_register_code` -- Register code as reusable
- `brain_check_code_similarity` -- Check if similar code exists

### Network Tools
- `brain_explore` -- Spreading activation through the synapse network
- `brain_connections` -- Find how two things are connected

### Research Tools
- `brain_insights` -- Get trends, gaps, synergies, and suggestions
- `brain_rate_insight` -- Rate an insight as useful or not
- `brain_suggest` -- Ask Brain for suggestions

### Memory Tools
- `brain_remember` -- Store a memory
- `brain_recall` -- Search memories
- `brain_session_start` -- Start a session
- `brain_session_end` -- End a session with summary
- `brain_session_history` -- Recall past sessions

### Decision & Changelog Tools
- `brain_record_decision` -- Record a design decision
- `brain_query_decisions` -- Search past decisions
- `brain_record_change` -- Record a semantic file change
- `brain_query_changes` -- Search the changelog

### Task Tools
- `brain_add_task` -- Create a task
- `brain_update_task` -- Update task status or details
- `brain_list_tasks` -- List tasks with filters
- `brain_task_context` -- Get full context for a task

### Documentation Tools
- `brain_index_project` -- Scan and index project docs
- `brain_query_docs` -- Search indexed documentation
- `brain_project_context` -- Get full project context

### Learning Explainability Tools
- `brain_explain_learning` -- Show learned rules with confidence
- `brain_override_rule` -- Boost, suppress, or delete a rule

### Ecosystem Tools
- `brain_status` -- Current Brain statistics
- `brain_notifications` -- Pending notifications
- `brain_ecosystem_status` -- Status of all brains
- `brain_query_peer` -- Query another brain
- `brain_error_trading_context` -- Correlate errors with trades

## Ports

| Service | Port | Protocol |
|---------|------|----------|
| REST API | 7777 | HTTP |
| MCP HTTP | 7778 | SSE |

## Data Location

By default, Brain stores its data in `~/.brain/`. Override with the `BRAIN_DATA_DIR` environment variable. The directory contains:

- `brain.db` -- SQLite database with all errors, solutions, synapses, memories, and more
- `config.json` -- Optional configuration overrides
- `logs/` -- Rotating log files
