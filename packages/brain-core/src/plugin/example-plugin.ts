/**
 * Example Brain Plugin — Reference implementation for community plugins.
 *
 * To create your own plugin:
 *
 * 1. Create a directory in ~/.brain/plugins/my-plugin/
 * 2. Add a package.json with "brainPlugin": true
 * 3. Export a default BrainPlugin object from your entry point
 *
 * Directory structure:
 *   ~/.brain/plugins/my-plugin/
 *   ├── package.json     ← must have "brainPlugin": true and "main" field
 *   └── index.js         ← default export: BrainPlugin
 *
 * package.json:
 *   {
 *     "name": "my-plugin",
 *     "version": "1.0.0",
 *     "description": "My awesome Brain plugin",
 *     "main": "index.js",
 *     "brainPlugin": true
 *   }
 *
 * The plugin receives a PluginContext with:
 *   - dataDir: dedicated data directory for this plugin
 *   - log: scoped logger (info, warn, error, debug)
 *   - callBrain(method, params): call any Brain IPC method
 *   - notify(event, data): send cross-brain notifications
 */

import type { BrainPlugin, PluginContext } from './types.js';

/**
 * Example: Hello Brain Plugin
 *
 * Demonstrates all plugin capabilities:
 * - Lifecycle hooks (onLoad, onUnload, onCycle)
 * - MCP tools (exposed to Claude Code)
 * - IPC routes (callable by other brains)
 */
const helloBrainPlugin: BrainPlugin = {
  name: 'hello-brain',
  version: '1.0.0',
  description: 'Example plugin — says hello, tracks greetings',

  // ── Lifecycle ──────────────────────────────────────────

  async onLoad(context: PluginContext) {
    context.log.info('Hello Brain plugin loaded!');
    // You can initialize state, open files, create DB tables, etc.
    // context.dataDir is a writable directory just for this plugin
  },

  async onUnload() {
    // Clean up resources: close connections, flush buffers, etc.
  },

  async onCycle(cycleCount: number) {
    // Called on each learning cycle (~5 min).
    // Good for periodic tasks: check feeds, update stats, etc.
    if (cycleCount % 10 === 0) {
      // Every 10th cycle, do something special
    }
  },

  // ── MCP Tools ──────────────────────────────────────────
  // These are exposed as MCP tools to Claude Code / Cursor / etc.
  // Tool names are auto-prefixed with plugin name: hello-brain_greet

  tools: [
    {
      name: 'greet',
      description: 'Say hello from the plugin',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name to greet' },
        },
        required: ['name'],
      },
      handler: (params) => {
        const name = (params as { name: string }).name;
        return { message: `Hello, ${name}! Greetings from the Hello Brain plugin.` };
      },
    },
  ],

  // ── IPC Routes ─────────────────────────────────────────
  // These are callable via IPC: plugin.hello-brain.stats
  // Other brains can call these too via cross-brain queries.

  routes: [
    {
      method: 'stats',
      handler: () => {
        return { greetings: 0, lastGreeting: null };
      },
    },
  ],
};

export default helloBrainPlugin;
