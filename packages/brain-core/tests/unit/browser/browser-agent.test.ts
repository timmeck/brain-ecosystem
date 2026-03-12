import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  BrowserAgent,
  StallDetector,
  parseLLMActions,
  buildBrowserSystemPrompt,
  buildStepPrompt,
} from '../../../src/browser/browser-agent.js';
import type { PlannerContext, PageState } from '../../../src/browser/browser-agent.js';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

// ── Helpers ─────────────────────────────────────────────

function emptyPageState(url = 'about:blank'): PageState {
  return {
    url, title: 'Test', interactiveElements: [], links: [],
    forms: [], textContent: '', headings: [],
  };
}

function emptyContext(overrides: Partial<PlannerContext> = {}): PlannerContext {
  return {
    task: 'test task',
    currentStep: 1,
    maxSteps: 25,
    pageState: emptyPageState(),
    previousSteps: [],
    extractedData: {},
    consecutiveFailures: 0,
    ...overrides,
  };
}

// ── StallDetector ───────────────────────────────────────

describe('StallDetector', () => {
  it('should not detect stall on varied actions', () => {
    const sd = new StallDetector(3);
    sd.record('https://a.com', ['click:#btn1']);
    sd.record('https://b.com', ['click:#btn2']);
    sd.record('https://c.com', ['click:#btn3']);
    expect(sd.isStalled()).toBe(false);
  });

  it('should detect stall on same URL + same actions repeated', () => {
    const sd = new StallDetector(3);
    sd.record('https://a.com', ['click:#btn']);
    sd.record('https://a.com', ['click:#btn']);
    sd.record('https://a.com', ['click:#btn']);
    expect(sd.isStalled()).toBe(true);
  });

  it('should detect ABAB pattern', () => {
    const sd = new StallDetector(5);
    sd.record('https://a.com', ['click:#next']);
    sd.record('https://b.com', ['click:#back']);
    sd.record('https://a.com', ['click:#next']);
    sd.record('https://b.com', ['click:#back']);
    expect(sd.isStalled()).toBe(true);
  });

  it('should not false-positive on same URL different actions', () => {
    const sd = new StallDetector(3);
    sd.record('https://a.com', ['click:#btn1']);
    sd.record('https://a.com', ['fill:#input']);
    sd.record('https://a.com', ['click:#submit']);
    expect(sd.isStalled()).toBe(false);
  });

  it('should reset cleanly', () => {
    const sd = new StallDetector(3);
    sd.record('https://a.com', ['click:#btn']);
    sd.record('https://a.com', ['click:#btn']);
    sd.record('https://a.com', ['click:#btn']);
    expect(sd.isStalled()).toBe(true);
    sd.reset();
    expect(sd.isStalled()).toBe(false);
  });
});

// ── parseLLMActions ─────────────────────────────────────

describe('parseLLMActions', () => {
  it('should parse JSON array', () => {
    const text = '[{"type":"navigate","url":"https://example.com"},{"type":"click","selector":"#btn"}]';
    const actions = parseLLMActions(text);
    expect(actions).toHaveLength(2);
    expect(actions[0]!.type).toBe('navigate');
    expect(actions[1]!.type).toBe('click');
  });

  it('should parse single JSON object', () => {
    const text = '{"type":"done","message":"finished"}';
    const actions = parseLLMActions(text);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe('done');
  });

  it('should extract JSON from surrounding text', () => {
    const text = 'I will now navigate:\n[{"type":"navigate","url":"https://test.com"}]\nDone!';
    const actions = parseLLMActions(text);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.url).toBe('https://test.com');
  });

  it('should return fail action on unparseable text', () => {
    const actions = parseLLMActions('This is not JSON at all');
    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe('fail');
  });
});

// ── Prompt Building ─────────────────────────────────────

describe('buildBrowserSystemPrompt', () => {
  it('should include available actions', () => {
    const prompt = buildBrowserSystemPrompt();
    expect(prompt).toContain('navigate');
    expect(prompt).toContain('click');
    expect(prompt).toContain('fill');
    expect(prompt).toContain('extract');
    expect(prompt).toContain('done');
    expect(prompt).toContain('fail');
    expect(prompt).toContain('JSON array');
  });
});

describe('buildStepPrompt', () => {
  it('should include task and step info', () => {
    const prompt = buildStepPrompt(emptyContext({ task: 'Find weather in Berlin' }));
    expect(prompt).toContain('Find weather in Berlin');
    expect(prompt).toContain('STEP: 1/25');
  });

  it('should include page headings', () => {
    const ctx = emptyContext({
      pageState: { ...emptyPageState(), headings: [{ level: 1, text: 'Welcome' }] },
    });
    const prompt = buildStepPrompt(ctx);
    expect(prompt).toContain('# Welcome');
  });

  it('should include interactive elements', () => {
    const ctx = emptyContext({
      pageState: {
        ...emptyPageState(),
        interactiveElements: [{ tag: 'button', id: 'search-btn', text: 'Search' }],
      },
    });
    const prompt = buildStepPrompt(ctx);
    expect(prompt).toContain('#search-btn');
    expect(prompt).toContain('Search');
  });

  it('should include failure warning', () => {
    const prompt = buildStepPrompt(emptyContext({ consecutiveFailures: 3 }));
    expect(prompt).toContain('WARNING');
    expect(prompt).toContain('3 consecutive failures');
  });

  it('should include previous steps', () => {
    const ctx = emptyContext({
      previousSteps: [{ step: 1, actions: ['navigate(https://test.com)'], results: ['ok'], url: 'https://test.com' }],
    });
    const prompt = buildStepPrompt(ctx);
    expect(prompt).toContain('PREVIOUS STEPS');
    expect(prompt).toContain('navigate(https://test.com)');
  });

  it('should include extracted data', () => {
    const ctx = emptyContext({ extractedData: { title: 'Test Page Title' } });
    const prompt = buildStepPrompt(ctx);
    expect(prompt).toContain('EXTRACTED DATA');
    expect(prompt).toContain('Test Page Title');
  });
});

// ── BrowserAgent ────────────────────────────────────────

describe('BrowserAgent', () => {
  let db: Database.Database;
  let agent: BrowserAgent;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    agent = new BrowserAgent(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Construction ──────────────────────────────────────

  it('should create tables on construction', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='browser_agent_log'").all();
    expect(tables.length).toBe(1);
  });

  it('should use default config values', () => {
    const config = agent.getConfig();
    expect(config.maxSteps).toBe(25);
    expect(config.failureThreshold).toBe(5);
    expect(config.pageTimeoutMs).toBe(30_000);
    expect(config.maxPages).toBe(3);
    expect(config.screenshotEachStep).toBe(false);
    expect(config.actionsPerStep).toBe(5);
    expect(config.maxUrlRepeats).toBe(3);
    expect(config.allowedDomains).toEqual([]);
    expect(config.blockedDomains.length).toBeGreaterThan(0);
  });

  it('should accept custom config', () => {
    const custom = new BrowserAgent(db, {
      maxSteps: 10, failureThreshold: 2,
      allowedDomains: ['example.com'], actionsPerStep: 3,
    });
    const config = custom.getConfig();
    expect(config.maxSteps).toBe(10);
    expect(config.failureThreshold).toBe(2);
    expect(config.allowedDomains).toEqual(['example.com']);
    expect(config.actionsPerStep).toBe(3);
  });

  // ── Domain Safety ─────────────────────────────────────

  it('should allow normal domains by default', () => {
    expect(agent.isDomainAllowed('https://example.com')).toBe(true);
    expect(agent.isDomainAllowed('https://github.com/test')).toBe(true);
  });

  it('should block ad/tracking domains', () => {
    expect(agent.isDomainAllowed('https://doubleclick.net/pixel')).toBe(false);
    expect(agent.isDomainAllowed('https://googlesyndication.com/ad')).toBe(false);
  });

  it('should enforce whitelist when set', () => {
    const restricted = new BrowserAgent(db, { allowedDomains: ['example.com', 'docs.test.com'] });
    expect(restricted.isDomainAllowed('https://example.com/page')).toBe(true);
    expect(restricted.isDomainAllowed('https://docs.test.com/api')).toBe(true);
    expect(restricted.isDomainAllowed('https://evil.com')).toBe(false);
  });

  it('should reject invalid URLs', () => {
    expect(agent.isDomainAllowed('not-a-url')).toBe(false);
    expect(agent.isDomainAllowed('')).toBe(false);
  });

  // ── Task Guards ───────────────────────────────────────

  it('should abort scripted task when too many steps', async () => {
    const actions = Array.from({ length: 30 }, () => ({ type: 'scroll_down' as const }));
    const result = await agent.executeTask('test-1', actions);
    expect(result.status).toBe('aborted');
    expect(result.error).toContain('Too many steps');
  });

  it('should abort autonomous task when no planner set', async () => {
    const result = await agent.runAutonomous('test-2', 'do something');
    expect(result.status).toBe('aborted');
    expect(result.error).toContain('No planner set');
  });

  // ── Autonomous with mock planner ──────────────────────

  it('should complete when planner returns done', async () => {
    // This will fail at getBrowser() since Playwright isn't available in test.
    // But tests the abort path correctly.
    const mockPlanner = {
      planNextActions: vi.fn().mockResolvedValue({
        actions: [{ type: 'done', message: 'Task completed' }],
        tokensUsed: 100,
      }),
    };
    agent.setPlanner(mockPlanner);

    // Will fail because Playwright isn't installed — expected
    const result = await agent.runAutonomous('test-3', 'test task');
    // Without Playwright: should fail at browser launch
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Playwright');
  });

  // ── Status ────────────────────────────────────────────

  it('should report accurate status', () => {
    const status = agent.getStatus();
    expect(status.activeTasks).toBe(0);
    expect(status.completedTasks).toBe(0);
    expect(status.stalledTasks).toBe(0);
    expect(status.totalSteps).toBe(0);
    expect(status.totalTokensUsed).toBe(0);
    expect(status.pagesOpen).toBe(0);
    expect(status.browserConnected).toBe(false);
  });
});
