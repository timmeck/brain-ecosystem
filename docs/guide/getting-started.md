# Getting Started

Get Brain up and running in under 5 minutes. By the end of this guide, Brain will be watching every error you encounter and building a memory that gets smarter over time.

## Prerequisites

- **Node.js 20+** (LTS recommended)
- **One of the following AI code editors:**
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (recommended, native MCP via stdio)
  - [Cursor](https://cursor.sh/) (MCP via HTTP/SSE)
  - [Windsurf](https://codeium.com/windsurf) (MCP via HTTP/SSE)
  - [Cline](https://github.com/cline/cline) (MCP via HTTP/SSE)
  - [Continue](https://continue.dev/) (MCP via HTTP/SSE)

## Installation

Install Brain globally from npm:

```bash
npm install -g @timmeck/brain
```

## Setup

Run the setup wizard. It configures MCP registration, git hooks for automatic error detection, and starts the background daemon:

```bash
brain setup
```

That's it. Brain is now:

1. **Running as a background daemon** on ports 7777 (REST API) and 7778 (MCP HTTP/SSE)
2. **Registered as an MCP server** so Claude Code can call Brain tools automatically
3. **Watching your git hooks** to catch errors in real-time via `PostToolUse`

## Verify Installation

Check that everything is running:

```bash
brain status
```

You should see output like:

```
Brain v1.x.x
  Status:    running (PID 12345)
  Uptime:    5s
  Database:  ~/.brain/brain.db
  REST API:  http://localhost:7777
  MCP HTTP:  http://localhost:7778/sse
  Errors:    0 total, 0 unresolved
  Solutions: 0
  Synapses:  0 connections
```

## Your First Error

Brain learns by watching. Here is what happens when you encounter your first error:

1. **An error occurs** in your terminal (e.g., a failing test, a TypeScript compilation error, a runtime crash).
2. **The PostToolUse hook** catches the error output automatically and sends it to Brain via IPC.
3. **Brain stores the error**, hashes it, and searches for similar errors it has seen before.
4. **No matches yet** (this is the first error), so Brain just records it.

Now fix the error manually as you normally would. When the fix works:

1. **Brain detects the resolution** and records the solution, linking it to the error.
2. **A synapse forms** between the error and the solution, with an initial weight.

The next time a similar error occurs -- in this project or any other project -- Brain will instantly suggest the proven fix with a confidence score.

## 5-Minute Quickstart

Here is the fastest path from install to a working Brain:

```bash
# 1. Install
npm install -g @timmeck/brain

# 2. Setup (configures MCP, hooks, starts daemon)
brain setup

# 3. Verify it's running
brain status

# 4. Start a Claude Code session — Brain is already active
# Try causing an error on purpose:
claude "run tsc on this project and fix any errors"

# 5. Check what Brain learned
brain query "TypeError"
brain insights
```

## Setup with Cursor / Windsurf / Cline / Continue

If you are not using Claude Code, you connect via HTTP/SSE instead of stdio. Add the following to your editor's MCP configuration:

```json
{
  "brain": {
    "url": "http://localhost:7778/sse"
  }
}
```

Make sure the daemon is running first:

```bash
brain start
```

## Optional: Add More Brains

The ecosystem includes two additional specialized brains:

### Trading Brain

Tracks trade outcomes, learns which signal patterns predict success, and recommends position sizes.

```bash
npm install -g @timmeck/trading-brain
trading setup
```

### Marketing Brain

Learns which content performs best, extracts posting patterns, and manages campaigns with A/B testing.

```bash
npm install -g @timmeck/marketing-brain
marketing setup
```

Each brain runs its own daemon and registers as a separate MCP server. When multiple brains are running, they discover each other automatically and share context through cross-brain IPC communication.

## Next Steps

- [How It Works](/guide/how-it-works) -- Understand the architecture and learning mechanics
- [Brain (Error Memory)](/guide/brain) -- Deep dive into the flagship brain
- [Hebbian Learning](/guide/hebbian-learning) -- How synapses form and strengthen
- [API Reference](/api/) -- Full list of MCP tools and parameters
