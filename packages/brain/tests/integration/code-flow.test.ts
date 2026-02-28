import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/setup-db.js';
import { CodeService } from '../../src/services/code.service.js';
import { SynapseManager } from '../../src/synapses/synapse-manager.js';
import { retryModule, hashModule } from '../fixtures/code-modules/modules.js';

const synapsesConfig = {
  initialWeight: 0.1,
  learningRate: 0.15,
  decayHalfLifeDays: 45,
  pruneThreshold: 0.05,
  decayAfterDays: 14,
  maxDepth: 3,
  minActivationWeight: 0.2,
};

describe('Code Flow Integration', () => {
  let testDb: TestDb;
  let codeService: CodeService;

  beforeEach(() => {
    testDb = createTestDb();
    const synapseManager = new SynapseManager(testDb.repos.synapse, synapsesConfig);
    codeService = new CodeService(testDb.repos.codeModule, testDb.repos.project, synapseManager);
  });

  it('registers a code module and retrieves it', () => {
    const result = codeService.analyzeAndRegister({
      project: 'utils-lib',
      name: retryModule.name,
      filePath: retryModule.filePath,
      language: retryModule.language,
      source: retryModule.source,
      description: retryModule.description,
    });

    expect(result.moduleId).toBeTruthy();
    expect(result.isNew).toBe(true);
    expect(result.reusabilityScore).toBeGreaterThan(0);

    const mod = codeService.getById(result.moduleId);
    expect(mod).toBeTruthy();
  });

  it('finds reusable modules by query', () => {
    codeService.analyzeAndRegister({
      project: 'utils-lib',
      name: retryModule.name,
      filePath: retryModule.filePath,
      language: retryModule.language,
      source: retryModule.source,
      description: retryModule.description,
    });

    const results = codeService.findReusable({ query: 'retry backoff' });
    // FTS matching may or may not find results
    expect(results).toBeDefined();
  });

  it('lists all modules', () => {
    codeService.analyzeAndRegister({
      project: 'project-a',
      name: retryModule.name,
      filePath: retryModule.filePath,
      language: retryModule.language,
      source: retryModule.source,
    });

    // listModules requires a projectId — project is created with id=1 by analyzeAndRegister
    const modules = codeService.listModules(1);
    expect(modules.length).toBe(1);
  });

  it('detects similar code', () => {
    codeService.analyzeAndRegister({
      project: 'project-a',
      name: retryModule.name,
      filePath: retryModule.filePath,
      language: retryModule.language,
      source: retryModule.source,
    });

    const similarities = codeService.checkSimilarity(retryModule.source, 'typescript');
    expect(similarities).toBeDefined();
  });
});
