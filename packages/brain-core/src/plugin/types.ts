export interface BrainPlugin {
  /** Unique plugin name (e.g. 'weather-brain'). */
  name: string;
  /** SemVer version string. */
  version: string;
  /** Human-readable description. */
  description?: string;

  /** Called when plugin is loaded. Return services/state. */
  onLoad?(context: PluginContext): Promise<void> | void;
  /** Called when plugin is unloaded. Clean up resources. */
  onUnload?(): Promise<void> | void;
  /** Called on each learning cycle. */
  onCycle?(cycleCount: number): Promise<void> | void;

  /** MCP tools to register. */
  tools?: PluginToolDefinition[];
  /** IPC routes to register. */
  routes?: PluginRouteDefinition[];
}

export interface PluginContext {
  /** Data directory for this plugin (e.g. ~/.brain/plugins/weather-brain/). */
  dataDir: string;
  /** Logger scoped to this plugin. */
  log: PluginLogger;
  /** IPC client to communicate with Brain. */
  callBrain(method: string, params?: unknown): Promise<unknown>;
  /** Notify other brains via cross-brain. */
  notify(event: string, data: unknown): Promise<void>;
}

export interface PluginLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}

export interface PluginToolDefinition {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface PluginRouteDefinition {
  method: string;
  handler: (params: unknown) => Promise<unknown> | unknown;
}

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  main: string;
  brainPlugin: true;
}

export interface PluginRecord {
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  loadedAt: string | null;
  error: string | null;
}
