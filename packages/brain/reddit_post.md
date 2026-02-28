# Reddit Post for r/ClaudeAI

## Title:
I built a persistent memory system for Claude Code — it remembers every error, solution, and code module across all your projects

## Body:

Claude Code starts fresh every session. After months of hitting the same errors and rewriting the same code, I built **Brain** — an MCP server that gives Claude Code a persistent memory.

### What it does

- **Error Memory** — Brain remembers every error you've encountered and every solution that worked. Next time you hit the same bug, it suggests the fix with a confidence score.
- **Cross-Project Learning** — Fixed a bug in project A? Brain suggests the same fix when a similar error appears in project B.
- **Code Intelligence** — Before writing new code, Brain checks if similar modules already exist across your 36 projects. No more reinventing the wheel.
- **Hebbian Synapse Network** — 37,000+ weighted connections between errors, solutions, and code modules. Connections strengthen with use, like biological synapses.
- **Proactive Prevention** — Post-write hooks check your code against known antipatterns *before* errors occur.
- **Auto-Detect** — Hooks catch errors in real-time from Bash output and report them to Brain automatically. You don't have to do anything.

### The stack

- TypeScript, better-sqlite3, MCP SDK
- 13 MCP tools for Claude Code
- REST API (30+ endpoints) + MCP over HTTP/SSE (works with Cursor, Windsurf, Cline)
- Local embeddings (all-MiniLM-L6-v2) for hybrid search — no cloud, no API keys
- Interactive dashboard with live synapse network visualization
- Full CLI: `brain status`, `brain query`, `brain explain`, `brain dashboard`

### Real numbers from my setup

- 18,160 code modules indexed across 36 projects
- 37,277 synapse connections
- 4,902 research insights generated automatically
- 139 tests, all passing

### Install

```
npm install -g @timmeck/brain
```

Setup takes 2 minutes — add the MCP server + hooks to your Claude Code settings and run `brain start`. That's it.

GitHub: https://github.com/timmeck/brain

MIT licensed, open source. Would love feedback — especially on what MCP tools would be most useful to add next.
