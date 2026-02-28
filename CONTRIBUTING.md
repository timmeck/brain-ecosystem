# Contributing to Brain Ecosystem

Thank you for your interest in contributing to the Brain Ecosystem! This guide covers everything you need to get started.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Running Tests](#running-tests)
- [How to Create a New MCP Tool](#how-to-create-a-new-mcp-tool)
- [How to Create a New Brain](#how-to-create-a-new-brain)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [Commit Message Conventions](#commit-message-conventions)

---

## Development Setup

### Prerequisites

- **Node.js** >= 20
- **npm** >= 10 (ships with Node 20+)
- **Git**

### Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/timmeck/brain-ecosystem.git
cd brain-ecosystem

# 2. Install all dependencies (includes all workspace packages)
npm install

# 3. Build every package (brain-core must build first — workspaces handles ordering)
npm run build

# 4. Run the full test suite
npm test
```

### Building Individual Packages

```bash
npm run build:core       # packages/brain-core
npm run build:brain      # packages/brain
npm run build:trading    # packages/trading-brain
npm run build:marketing  # packages/marketing-brain
```

### Development Mode

Each package supports a `dev` script that uses `tsx` for on-the-fly TypeScript execution:

```bash
npm run dev -w packages/brain
npm run dev -w packages/trading-brain
npm run dev -w packages/marketing-brain
```

---

## Project Structure

This is an npm workspaces monorepo. The workspace root at `package.json` orchestrates builds, tests, and linting across all packages.

```
brain-ecosystem/
  packages/
    brain-core/          Shared infrastructure (IPC, MCP, DB, synapses, embeddings, dashboard)
    brain/               Error memory & code intelligence Brain (the original Brain)
    trading-brain/       Trading signal intelligence Brain
    marketing-brain/     Marketing content intelligence Brain
  docs/                  VitePress documentation site
  examples/              Setup examples (basic, trading, full ecosystem)
  .github/
    workflows/           CI and release automation
    ISSUE_TEMPLATE/      Bug report and feature request templates
  docker-compose.yml     Full ecosystem with Docker
  Dockerfile             Multi-stage build for all Brains
  tsconfig.base.json     Shared TypeScript configuration
```

### Package Dependency Graph

```
brain-core  <--  brain
            <--  trading-brain
            <--  marketing-brain
```

`brain-core` is the foundation. Every Brain depends on it and imports directly from its subpath exports (e.g., `@timmeck/brain-core/ipc/client`, `@timmeck/brain-core/mcp/server`).

### Anatomy of a Brain Package

Every Brain package follows the same internal layout:

```
packages/<brain-name>/
  src/
    index.ts             CLI entry point (commander-based)
    <name>-core.ts       Main class — wires up DB, repositories, services, engines
    config.ts            Configuration loading
    db/                  SQLite migrations and repositories
    services/            Business logic services
    ipc/                 IPC router (named pipe RPC handlers)
    mcp/                 MCP tool definitions (server.ts, tools.ts)
    api/                 REST API routes
    dashboard/           HTML dashboard
    learning/            Hebbian learning engine
    synapses/            Synapse network (if package-specific)
    types/               TypeScript type definitions
    utils/               Package-specific utilities
  tests/                 Vitest test files
  tsconfig.json          Extends ../../tsconfig.base.json
  vitest.config.ts       Vitest configuration
  eslint.config.js       ESLint flat config
  package.json           Package manifest with bin, scripts, dependencies
```

---

## Running Tests

```bash
# Run all tests across every package
npm test

# Run tests for a specific package
npm test -w packages/brain-core
npm test -w packages/brain
npm test -w packages/trading-brain
npm test -w packages/marketing-brain

# Run tests with coverage
npm run test:coverage -w packages/brain
```

All packages use **Vitest** as the test runner. Test files live in a `tests/` directory or alongside source files with a `.test.ts` suffix.

---

## How to Create a New MCP Tool

MCP (Model Context Protocol) tools are the primary interface between Claude Code (or other MCP clients) and a Brain. Here is a step-by-step guide using the existing patterns.

### Step 1: Define the IPC Route

Each MCP tool ultimately calls an IPC route. First, add your route handler in the Brain's IPC router.

In `packages/<brain>/src/ipc/router.ts`, add a new route:

```typescript
router.on('myfeature.action', async (params) => {
  const result = await services.myFeature.doSomething(params);
  return result;
});
```

### Step 2: Register the MCP Tool

In `packages/<brain>/src/mcp/tools.ts`, add your tool registration inside `registerToolsWithCaller()`:

```typescript
server.tool(
  'brain_my_tool',                              // Tool name (prefix with brain_)
  'Description of what this tool does.',         // Human-readable description
  {
    // Define parameters using Zod schemas
    query: z.string().describe('The search query'),
    limit: z.number().optional().describe('Max results to return'),
  },
  async (params) => {
    const result = await call('myfeature.action', {
      query: params.query,
      limit: params.limit ?? 10,
    });
    return textResult(result);
  },
);
```

### Step 3: Implement the Service

Create or update the service that backs your tool:

```typescript
// packages/<brain>/src/services/my-feature.service.ts
export class MyFeatureService {
  constructor(private db: Database) {}

  async doSomething(params: { query: string; limit: number }) {
    // Your business logic here
    return { results: [] };
  }
}
```

### Step 4: Wire it Up

In the Brain's core class (e.g., `brain.ts` or `trading-core.ts`), instantiate your service and pass it to the IPC router via the `Services` interface.

### Step 5: Test

Write a Vitest test for your service logic. Tool registration itself is validated by the existing MCP server infrastructure.

---

## How to Create a New Brain

A new Brain is a self-contained package that uses `brain-core` for shared infrastructure. Follow these steps.

### Step 1: Scaffold the Package

```bash
mkdir -p packages/my-brain/src/{db/migrations,db/repositories,services,ipc,mcp,api,types,utils,learning}
```

### Step 2: Create `package.json`

```json
{
  "name": "@timmeck/my-brain",
  "version": "0.1.0",
  "description": "Description of your Brain",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "mybrain": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@timmeck/brain-core": "*",
    "better-sqlite3": "^11.7.0",
    "chalk": "^5.6.2",
    "commander": "^13.0.0",
    "winston": "^3.17.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.0.0",
    "eslint": "^9.39.3",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "typescript-eslint": "^8.56.1",
    "vitest": "^3.0.0"
  }
}
```

### Step 3: Create `tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

### Step 4: Implement the Core Class

Create `src/my-brain-core.ts` following the pattern in `packages/brain/src/brain.ts`:

1. Load configuration
2. Open SQLite database via `createConnection()` from `@timmeck/brain-core`
3. Run migrations
4. Instantiate repositories, services, and engines
5. Start the IPC server, API server, and MCP HTTP server

### Step 5: Create the CLI Entry Point

Create `src/index.ts` using Commander:

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { startMcpServer } from '@timmeck/brain-core/mcp/server';
// ... setup commands: daemon, setup, status, mcp
```

### Step 6: Register with the Monorepo

Add the package to the root `package.json` workspaces array:

```json
"workspaces": [
  "packages/brain-core",
  "packages/brain",
  "packages/trading-brain",
  "packages/marketing-brain",
  "packages/my-brain"
]
```

### Step 7: Build and Test

```bash
npm install          # Re-link workspaces
npm run build        # Build all (brain-core first, then your package)
npm test             # Run all tests
```

---

## Code Style

### TypeScript

- Target **ES2022** with **NodeNext** module resolution (see `tsconfig.base.json`)
- **Strict mode** is enabled -- no implicit `any`, strict null checks, etc.
- Use **ESM** (`"type": "module"`) -- all imports must include `.js` extensions
- Prefer `interface` over `type` for object shapes unless a union or mapped type is needed

### ESLint

Every package uses ESLint with `typescript-eslint` via flat config (`eslint.config.js`). Run the linter:

```bash
npm run lint                         # Lint all packages
npm run lint -w packages/brain       # Lint a specific package
npm run lint:fix -w packages/brain   # Auto-fix
```

### Patterns and Conventions

- **Repository pattern**: Database access goes through repository classes (`db/repositories/`)
- **Service pattern**: Business logic lives in service classes (`services/`)
- **IPC routing**: All inter-process calls go through a typed router (`ipc/router.ts`)
- **Dependency injection via constructor**: Services receive their dependencies (DB, repositories, other services) through constructor parameters
- **Named pipes for IPC**: Brains communicate through Unix domain sockets / Windows named pipes
- **Subpath exports**: Import from `@timmeck/brain-core/<subpath>` rather than the package root where possible

### File Naming

- Use **kebab-case** for all files: `my-feature.service.ts`, `error.repository.ts`
- Suffix files with their role: `.service.ts`, `.repository.ts`, `.types.ts`
- Test files use the `.test.ts` suffix

---

## Pull Request Process

1. **Fork and branch**: Create a feature branch from `main` (e.g., `feat/my-new-tool`)
2. **Make your changes**: Follow the code style guidelines above
3. **Write tests**: All new features and bug fixes should include tests
4. **Build**: Run `npm run build` and ensure there are no TypeScript errors
5. **Lint**: Run `npm run lint` and fix any issues
6. **Test**: Run `npm test` and confirm all tests pass
7. **Open a PR**: Target the `main` branch with a clear title and description
8. **CI must pass**: The GitHub Actions CI pipeline runs build, lint, and test on Node 20 and 22

### PR Description Template

- **What** does this PR do?
- **Why** is this change needed?
- **How** was it tested?
- Link any related issues

### Review Expectations

- PRs require at least one approval before merging
- Address all review comments before merging
- Keep PRs focused -- one feature or fix per PR

---

## Commit Message Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

<optional body>

<optional footer>
```

### Types

| Type       | Description                                          |
| ---------- | ---------------------------------------------------- |
| `feat`     | A new feature                                        |
| `fix`      | A bug fix                                            |
| `docs`     | Documentation changes                                |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test`     | Adding or updating tests                             |
| `chore`    | Build process, CI, dependency updates                |
| `perf`     | Performance improvement                              |

### Scopes

Use the package name as the scope: `core`, `brain`, `trading`, `marketing`, `ci`, `docs`.

### Examples

```
feat(trading): add signal fingerprint comparison tool
fix(core): handle empty IPC messages without crashing
docs: update CONTRIBUTING.md with new tool creation steps
refactor(brain): extract error matching into dedicated service
test(marketing): add pattern extractor unit tests
chore(ci): add Node 22 to test matrix
```

---

## Questions?

If you have questions that are not covered here, please open a [Discussion](https://github.com/timmeck/brain-ecosystem/discussions) or file an issue. We are happy to help!
