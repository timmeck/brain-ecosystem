import { describe, it, expect, afterEach } from 'vitest';
import { encodeMessage, MessageDecoder } from '@timmeck/brain-core';
import type { IpcMessage } from '@timmeck/brain-core';

describe('IPC Protocol', () => {
  it('round-trips a request message', () => {
    const msg: IpcMessage = {
      id: 'test-123',
      type: 'request',
      method: 'error.report',
      params: { project: 'test', errorOutput: 'Error: something' },
    };

    const encoded = encodeMessage(msg);
    const decoder = new MessageDecoder();
    const decoded = decoder.feed(encoded);

    expect(decoded.length).toBe(1);
    expect(decoded[0].id).toBe('test-123');
    expect(decoded[0].type).toBe('request');
    expect(decoded[0].method).toBe('error.report');
    expect(decoded[0].params).toEqual(msg.params);
  });

  it('round-trips a response message', () => {
    const msg: IpcMessage = {
      id: 'test-456',
      type: 'response',
      result: { errorId: 42, isNew: true },
    };

    const encoded = encodeMessage(msg);
    const decoder = new MessageDecoder();
    const decoded = decoder.feed(encoded);

    expect(decoded.length).toBe(1);
    expect(decoded[0].result).toEqual({ errorId: 42, isNew: true });
  });

  it('round-trips an error response', () => {
    const msg: IpcMessage = {
      id: 'test-789',
      type: 'response',
      error: { code: -1, message: 'Unknown method' },
    };

    const encoded = encodeMessage(msg);
    const decoder = new MessageDecoder();
    const decoded = decoder.feed(encoded);

    expect(decoded[0].error?.code).toBe(-1);
    expect(decoded[0].error?.message).toBe('Unknown method');
  });

  it('handles multiple messages in one feed', () => {
    const msg1: IpcMessage = { id: '1', type: 'request', method: 'a' };
    const msg2: IpcMessage = { id: '2', type: 'request', method: 'b' };

    const buf = Buffer.concat([encodeMessage(msg1), encodeMessage(msg2)]);
    const decoder = new MessageDecoder();
    const decoded = decoder.feed(buf);

    expect(decoded.length).toBe(2);
    expect(decoded[0].id).toBe('1');
    expect(decoded[1].id).toBe('2');
  });

  it('handles partial messages across feeds', () => {
    const msg: IpcMessage = { id: 'partial', type: 'request', method: 'test' };
    const encoded = encodeMessage(msg);

    const decoder = new MessageDecoder();
    // Split buffer in half
    const mid = Math.floor(encoded.length / 2);
    const part1 = encoded.subarray(0, mid);
    const part2 = encoded.subarray(mid);

    const decoded1 = decoder.feed(part1);
    expect(decoded1.length).toBe(0); // incomplete

    const decoded2 = decoder.feed(part2);
    expect(decoded2.length).toBe(1);
    expect(decoded2[0].id).toBe('partial');
  });

  it('decoder reset clears buffer', () => {
    const msg: IpcMessage = { id: 'x', type: 'request', method: 'y' };
    const encoded = encodeMessage(msg);
    const partial = encoded.subarray(0, 5);

    const decoder = new MessageDecoder();
    decoder.feed(partial);
    decoder.reset();

    // After reset, feeding a complete message should work
    const decoded = decoder.feed(encodeMessage(msg));
    expect(decoded.length).toBe(1);
  });
});

describe('IPC Router', () => {
  it('routes methods to services', async () => {
    const { createTestDb } = await import('../helpers/setup-db.js');
    const { IpcRouter } = await import('../../src/ipc/router.js');
    const { ErrorService } = await import('../../src/services/error.service.js');
    const { SolutionService } = await import('../../src/services/solution.service.js');
    const { TerminalService } = await import('../../src/services/terminal.service.js');
    const { PreventionService } = await import('../../src/services/prevention.service.js');
    const { CodeService } = await import('../../src/services/code.service.js');
    const { SynapseService } = await import('../../src/services/synapse.service.js');
    const { ResearchService } = await import('../../src/services/research.service.js');
    const { NotificationService } = await import('../../src/services/notification.service.js');
    const { AnalyticsService } = await import('../../src/services/analytics.service.js');
    const { SynapseManager } = await import('../../src/synapses/synapse-manager.js');

    const testDb = createTestDb();
    const synapsesConfig = {
      initialWeight: 0.1, learningRate: 0.15, decayHalfLifeDays: 45,
      pruneThreshold: 0.05, decayAfterDays: 14, maxDepth: 3, minActivationWeight: 0.2,
    };
    const sm = new SynapseManager(testDb.repos.synapse, synapsesConfig);

    const services = {
      error: new ErrorService(testDb.repos.error, testDb.repos.project, sm),
      solution: new SolutionService(testDb.repos.solution, sm),
      terminal: new TerminalService(testDb.repos.terminal, 300000),
      prevention: new PreventionService(testDb.repos.rule, testDb.repos.antipattern, sm),
      code: new CodeService(testDb.repos.codeModule, testDb.repos.project, sm),
      synapse: new SynapseService(sm),
      research: new ResearchService(testDb.repos.insight, testDb.repos.error, sm),
      notification: new NotificationService(testDb.repos.notification),
      analytics: new AnalyticsService(
        testDb.repos.error, testDb.repos.solution, testDb.repos.codeModule,
        testDb.repos.rule, testDb.repos.antipattern, testDb.repos.insight, sm,
      ),
    };

    const router = new IpcRouter(services);

    // Test analytics.summary
    const summary = router.handle('analytics.summary', {});
    expect(summary).toBeTruthy();

    // Test synapse.stats
    const stats = router.handle('synapse.stats', {});
    expect(stats).toBeTruthy();

    // Test error.report
    const result = router.handle('error.report', {
      project: 'test',
      errorOutput: 'Error: test error',
    }) as any;
    expect(result.errorId).toBeTruthy();

    // Test unknown method throws
    expect(() => router.handle('nonexistent.method', {})).toThrow('Unknown method');

    // Test listMethods
    const methods = router.listMethods();
    expect(methods.length).toBeGreaterThan(20);
    expect(methods).toContain('error.report');
    expect(methods).toContain('analytics.summary');

    testDb.db.close();
  });
});
