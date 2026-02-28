# Brain MCP Tools Reference

Brain exposes 28 MCP tools through both stdio (Claude Code) and HTTP/SSE (Cursor, Windsurf, etc.) transports. All tools are prefixed with `brain_`.

## Error Tools

### `brain_report_error`

Report an error that occurred. Brain stores it, matches against known errors, and returns solutions if available.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `error_output` | string | Yes | The raw error output from the terminal |
| `command` | string | No | The command that caused the error |
| `task_context` | string | No | What the user was trying to accomplish |
| `working_directory` | string | No | Working directory when the error occurred |
| `project` | string | No | Project name |

**Returns**: Error ID, whether it is new or seen before, matching errors with confidence scores, and cross-project matches.

---

### `brain_query_error`

Search for similar errors and their solutions in the Brain database.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Error message or description to search for |
| `project_only` | boolean | No | Only search in the current project |

**Returns**: List of matching errors with ID, type, message, and resolution status.

---

### `brain_report_solution`

Report a successful solution for an error. Brain will learn from this and create/strengthen synapses.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `error_id` | number | Yes | The error ID this solution fixes |
| `description` | string | Yes | What was done to fix the error |
| `commands` | string | No | Commands used to fix |
| `code_change` | string | No | Code changes or diff |

**Returns**: Solution ID confirmation.

---

### `brain_report_attempt`

Report a failed solution attempt. Brain learns what does NOT work and weakens the relevant synapse.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `error_id` | number | Yes | The error ID |
| `solution_id` | number | Yes | The solution ID that was attempted |
| `description` | string | No | What was tried |
| `output` | string | No | Output of the failed attempt |

**Returns**: Confirmation of the failed attempt recording.

## Code Tools

### `brain_find_reusable_code`

Search for reusable code modules from other projects. Use when starting new functionality to avoid reinventing the wheel.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `purpose` | string | Yes | What the code should do (e.g., "retry with backoff", "JWT authentication") |
| `language` | string | No | Programming language filter |

**Returns**: List of matching modules with ID, language, name, description, and reusability score.

---

### `brain_register_code`

Register a code module as reusable. Brain analyzes it for structure, complexity, and reusability.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source_code` | string | Yes | The source code |
| `file_path` | string | Yes | File path relative to project root |
| `project` | string | No | Project name |
| `name` | string | No | Module name (auto-detected if omitted) |
| `language` | string | No | Programming language (auto-detected from extension) |
| `description` | string | No | What this code does |

**Returns**: Module ID, whether new or updated, and reusability score.

---

### `brain_check_code_similarity`

Check if similar code already exists in other projects before writing new code.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source_code` | string | Yes | The code to check |
| `language` | string | No | Programming language |
| `file_path` | string | No | File path for context |

**Returns**: List of similar modules with match score and match type.

## Network Tools

### `brain_explore`

Explore what Brain knows about a topic. Uses spreading activation through the synapse network to find related knowledge.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_type` | string | Yes | Type: `error`, `solution`, `code_module`, `project` |
| `node_id` | number | Yes | ID of the node to explore from |
| `max_depth` | number | No | How many hops to follow (default: 3) |

**Returns**: Connected nodes with solution count, related errors, relevant modules, prevention rules, and insights.

---

### `brain_connections`

Find how two things are connected in Brain (e.g., how an error relates to a code module).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from_type` | string | Yes | Source type: `error`, `solution`, `code_module`, `project` |
| `from_id` | number | Yes | Source ID |
| `to_type` | string | Yes | Target type |
| `to_id` | number | Yes | Target ID |

**Returns**: Path between the two nodes with synapse details and total weight.

## Research Tools

### `brain_insights`

Get research insights: trends, gaps, synergies, template candidates, and project suggestions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | No | Filter by: `trend`, `pattern`, `gap`, `synergy`, `optimization`, `template_candidate`, `project_suggestion`, `warning` |
| `priority` | string | No | Minimum priority: `low`, `medium`, `high`, `critical` |

**Returns**: List of insights with type, title, and description.

---

### `brain_rate_insight`

Rate an insight as useful or not useful. Helps Brain learn what insights matter.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `insight_id` | number | Yes | The insight ID to rate |
| `rating` | number | Yes | 1 (useful), 0 (neutral), -1 (not useful) |
| `comment` | string | No | Optional feedback comment |

---

### `brain_suggest`

Ask Brain for suggestions: what to build next, what to improve, what patterns to extract.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `context` | string | Yes | Current context or question |

**Returns**: Contextual suggestions based on Brain's knowledge.

## Status & Notifications

### `brain_status`

Get current Brain status: errors, solutions, code modules, synapse network, insights.

*No parameters.*

**Returns**: Summary counts for errors, solutions, rules, code modules, insights, and synapses.

---

### `brain_notifications`

Get pending notifications (new solutions, recurring errors, research insights).

*No parameters.*

**Returns**: List of notifications with type, title, and message.

## Memory Tools

### `brain_remember`

Store a memory. Use for user preferences, decisions, context, facts, goals, or lessons. Key-based memories auto-supersede old values.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | Yes | The memory content |
| `category` | enum | Yes | `preference`, `decision`, `context`, `fact`, `goal`, `lesson` |
| `key` | string | No | Unique key for upsert (e.g., `"preferred_test_framework"`) |
| `importance` | number | No | 1-10, default 5 |
| `tags` | string[] | No | Tags for organization |
| `project` | string | No | Project name |

**Returns**: Memory ID and superseded memory ID if applicable.

---

### `brain_recall`

Search memories. Use to recall preferences, past decisions, goals, lessons, or any stored context.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Natural language search |
| `category` | enum | No | Filter by category |
| `project` | string | No | Project name |
| `limit` | number | No | Max results, default 10 |

**Returns**: Matching memories with ID, category, key, content, and importance.

---

### `brain_session_start`

Start a Brain session to track what happens in this conversation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `goals` | string[] | No | Session goals |
| `project` | string | No | Project name |

**Returns**: Session ID.

---

### `brain_session_end`

End the current session with a summary of what was accomplished.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | number | Yes | The session ID to end |
| `summary` | string | Yes | Summary of what was accomplished |
| `outcome` | enum | No | `completed`, `paused`, `abandoned` |

---

### `brain_session_history`

Recall past sessions. Use when the user asks "what was I working on?"

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project` | string | No | Project name |
| `limit` | number | No | Max results, default 10 |

**Returns**: List of sessions with ID, outcome, goals, timestamps, and summaries.

## Decision & Changelog Tools

### `brain_record_decision`

Record an architecture/design decision with alternatives and rationale.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | Yes | Decision title (e.g., "Use Vitest over Jest") |
| `description` | string | Yes | Full description and rationale |
| `alternatives` | object[] | No | Alternatives considered (each with `option`, `pros`, `cons`, `rejected_reason`) |
| `category` | enum | No | `architecture`, `technology`, `pattern`, `convention`, `dependency`, `process`, `other` |
| `tags` | string[] | No | Tags |
| `project` | string | No | Project name |

**Returns**: Decision ID.

---

### `brain_query_decisions`

Search past decisions. Use when asked "why did we choose X?"

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | No | Natural language search |
| `category` | enum | No | Filter by category |
| `project` | string | No | Project name |
| `limit` | number | No | Max results |

**Returns**: Matching decisions with ID, category, title, and description.

---

### `brain_record_change`

Record a semantic file change (what changed and why).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_path` | string | Yes | File path that changed |
| `change_type` | enum | Yes | `created`, `modified`, `deleted`, `renamed`, `refactored` |
| `summary` | string | Yes | What changed |
| `reason` | string | No | Why it changed |
| `diff_snippet` | string | No | Key part of the diff |
| `related_error_id` | number | No | Error this change fixes |
| `related_decision_id` | number | No | Decision this implements |
| `commit_hash` | string | No | Git commit hash |
| `project` | string | No | Project name |

**Returns**: Change ID.

---

### `brain_query_changes`

Search the semantic changelog. Use for "what changed in file X?" or "what did we change recently?"

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | No | Natural language search |
| `file_path` | string | No | Filter by file path |
| `project` | string | No | Project name |
| `limit` | number | No | Max results |

**Returns**: Matching changes with ID, type, file path, and summary.

## Task Tools

### `brain_add_task`

Add a task or goal for tracking work items, todos, and objectives.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | Yes | Task title |
| `description` | string | No | Detailed description |
| `priority` | number | No | 1-10, default 5 |
| `due_date` | string | No | Due date (ISO format) |
| `tags` | string[] | No | Tags |
| `parent_task_id` | number | No | Parent task ID for subtasks |
| `blocked_by` | number[] | No | Task IDs that block this one |
| `project` | string | No | Project name |

**Returns**: Task ID.

---

### `brain_update_task`

Update a task: change status, add notes, set priority.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | Task ID |
| `status` | enum | No | `pending`, `in_progress`, `completed`, `blocked`, `cancelled` |
| `note` | string | No | Add a note to the task |
| `priority` | number | No | 1-10 |
| `title` | string | No | Updated title |

---

### `brain_list_tasks`

List tasks. Filter by status, project, or parent task.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | enum | No | Filter by status |
| `project` | string | No | Filter by project |
| `limit` | number | No | Max results |

**Returns**: List of tasks with ID, status, priority, title, and due date.

---

### `brain_task_context`

Get full context for a task: related memories, decisions, and changes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | Task ID |

**Returns**: Task details, subtasks, related memories, decisions, and changes.

## Documentation Tools

### `brain_index_project`

Scan and index project documentation (README, CLAUDE.md, package.json, tsconfig.json).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_path` | string | Yes | Absolute path to project root |
| `project` | string | No | Project name |

**Returns**: Count of indexed and updated documents and project ID.

---

### `brain_query_docs`

Search indexed project documentation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query |
| `project` | string | No | Filter by project |
| `limit` | number | No | Max results |

---

### `brain_project_context`

Get full project context: docs, active tasks, recent decisions, and changes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | number | Yes | Project ID |

**Returns**: Counts of indexed docs, active tasks, recent decisions, and recent changes.

## Learning Explainability Tools

### `brain_explain_learning`

Show what Brain has learned -- active rules with confidence scores, the errors that generated them, and their success rates.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `rule_id` | number | No | Specific rule ID for detailed explanation. Omit to list all active rules. |

**Returns**: Rule details including pattern, action, confidence, occurrences, description, and synapse connections.

---

### `brain_override_rule`

Override a learned rule -- boost its confidence, suppress it, or delete it entirely.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `rule_id` | number | Yes | The rule ID to override |
| `action` | enum | Yes | `boost` (increase confidence), `suppress` (decrease confidence), `delete` (deactivate) |
| `reason` | string | No | Why this rule is being overridden |

## Ecosystem Tools

### `brain_ecosystem_status`

Get status of all brains in the ecosystem (brain, trading-brain, marketing-brain).

*No parameters.*

**Returns**: Version, PID, uptime, and method count for each running brain.

---

### `brain_query_peer`

Query another brain in the ecosystem. Call any method on trading-brain or marketing-brain.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `peer` | string | Yes | Peer brain name: `trading-brain` or `marketing-brain` |
| `method` | string | Yes | IPC method to call (e.g., `analytics.summary`, `trade.recent`) |
| `args` | object | No | Method arguments as key-value pairs |

**Returns**: Raw result from the peer brain.

---

### `brain_error_trading_context`

Correlate an error with trading outcomes. Asks trading-brain for recent trades around the time of an error.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `error_id` | number | Yes | The error ID to correlate |
| `pair` | string | No | Trading pair to filter (e.g., `BTC/USDT`) |

**Returns**: Error details and recent trades from Trading Brain.
