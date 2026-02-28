import type { CodeModuleRecord } from '../types/code.types.js';
import type { CodeModuleRepository } from '../db/repositories/code-module.repository.js';
import type { ProjectRepository } from '../db/repositories/project.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import { analyzeCode } from '../code/analyzer.js';
import { fingerprintCode } from '../code/fingerprint.js';
import { computeReusabilityScore } from '../code/scorer.js';
import { detectGranularity } from '../code/registry.js';
import { findExactMatches, findSemanticMatches, findStructuralMatches } from '../code/matcher.js';
import { sha256 } from '@timmeck/brain-core';
import { getEventBus } from '../utils/events.js';
import { getLogger } from '../utils/logger.js';
import type { EmbeddingEngine } from '../embeddings/engine.js';

export interface AnalyzeInput {
  project: string;
  name: string;
  filePath: string;
  language: string;
  source: string;
  description?: string;
}

export interface FindReusableInput {
  query?: string;
  language?: string;
  projectId?: number;
  limit?: number;
}

export class CodeService {
  private logger = getLogger();
  private eventBus = getEventBus();
  private embeddingEngine: EmbeddingEngine | null = null;

  constructor(
    private codeModuleRepo: CodeModuleRepository,
    private projectRepo: ProjectRepository,
    private synapseManager: SynapseManager,
  ) {}

  setEmbeddingEngine(engine: EmbeddingEngine): void {
    this.embeddingEngine = engine;
  }

  analyzeAndRegister(input: AnalyzeInput): { moduleId: number; isNew: boolean; reusabilityScore: number } {
    // Ensure project exists
    let project = this.projectRepo.findByName(input.project);
    if (!project) {
      const id = this.projectRepo.create({ name: input.project, path: null, language: input.language, framework: null });
      project = this.projectRepo.getById(id)!;
    }

    // Analyze the code
    const analysis = analyzeCode(input.source, input.language);
    const fingerprint = fingerprintCode(input.source, input.language);
    const sourceHash = sha256(input.source);

    // Check if module already exists (by fingerprint)
    const existing = this.codeModuleRepo.findByFingerprint(fingerprint);
    if (existing) {
      // Source Hash Change Detection: compare hash to decide if re-analysis needed
      if (existing.source_hash === sourceHash) {
        // Unchanged — skip re-analysis
        this.logger.debug(`Module ${existing.name} unchanged (hash match), skipping`);
        this.synapseManager.strengthen(
          { type: 'code_module', id: existing.id },
          { type: 'project', id: project.id },
          'uses_module',
        );
        return { moduleId: existing.id, isNew: false, reusabilityScore: existing.reusability_score };
      }

      // Hash changed — re-analyze
      this.logger.info(`Module ${existing.name} changed (hash drift), re-analyzing`);
      const reScore = computeReusabilityScore({
        source: input.source,
        filePath: input.filePath,
        exports: analysis.exports,
        internalDeps: analysis.internalDeps,
        hasTypeAnnotations: analysis.hasTypeAnnotations,
        complexity: analysis.complexity,
      });

      this.codeModuleRepo.update(existing.id, {
        source_hash: sourceHash,
        lines_of_code: analysis.linesOfCode,
        complexity: analysis.complexity,
        reusability_score: reScore,
        updated_at: new Date().toISOString(),
      });

      // Re-index dependency synapses on change
      this.indexDependencySynapses(existing.id, analysis.internalDeps, project.id);

      this.synapseManager.strengthen(
        { type: 'code_module', id: existing.id },
        { type: 'project', id: project.id },
        'uses_module',
      );

      this.eventBus.emit('module:updated', { moduleId: existing.id });

      return { moduleId: existing.id, isNew: false, reusabilityScore: reScore };
    }

    // Compute reusability score (with complexity)
    const reusabilityScore = computeReusabilityScore({
      source: input.source,
      filePath: input.filePath,
      exports: analysis.exports,
      internalDeps: analysis.internalDeps,
      hasTypeAnnotations: analysis.hasTypeAnnotations,
      complexity: analysis.complexity,
    });

    const granularity = detectGranularity(input.source, input.language);

    const moduleId = this.codeModuleRepo.create({
      project_id: project.id,
      name: input.name,
      file_path: input.filePath,
      language: input.language,
      fingerprint,
      description: input.description ?? null,
      source_hash: sourceHash,
      lines_of_code: analysis.linesOfCode,
      complexity: analysis.complexity,
      reusability_score: reusabilityScore,
    });

    // Create synapse: module ↔ project
    this.synapseManager.strengthen(
      { type: 'code_module', id: moduleId },
      { type: 'project', id: project.id },
      'uses_module',
    );

    // Create dependency synapses for internal imports
    this.indexDependencySynapses(moduleId, analysis.internalDeps, project.id);

    // Compute and store pairwise module similarities
    this.computeModuleSimilarities(moduleId, input.source, input.language);

    this.eventBus.emit('module:registered', { moduleId, projectId: project.id });
    this.logger.info(`Code module registered (id=${moduleId}, name=${input.name}, granularity=${granularity}, score=${reusabilityScore.toFixed(2)})`);

    return { moduleId, isNew: true, reusabilityScore };
  }

  findReusable(input: FindReusableInput): CodeModuleRecord[] {
    if (input.query) {
      return this.codeModuleRepo.search(input.query);
    }
    if (input.language) {
      return this.codeModuleRepo.findByLanguage(input.language, input.limit);
    }
    if (input.projectId) {
      return this.codeModuleRepo.findByProject(input.projectId);
    }
    return [];
  }

  checkSimilarity(source: string, language: string): Array<{ moduleId: number; score: number; matchType: string }> {
    const fingerprint = fingerprintCode(source, language);
    const allModules = this.codeModuleRepo.findByLanguage(language);

    const exact = findExactMatches(fingerprint, allModules);
    if (exact.length > 0) return exact;

    return findSemanticMatches(source, allModules, 0.5);
  }

  listModules(projectId?: number, language?: string, limit?: number): CodeModuleRecord[] {
    if (projectId) {
      return this.codeModuleRepo.findByProject(projectId);
    }
    if (language) {
      return this.codeModuleRepo.findByLanguage(language, limit);
    }
    return this.codeModuleRepo.findAll(limit);
  }

  getById(id: number): CodeModuleRecord | undefined {
    return this.codeModuleRepo.getById(id);
  }

  private computeModuleSimilarities(moduleId: number, source: string, language: string): void {
    const allModules = this.codeModuleRepo.findByLanguage(language, 100);
    const candidates = allModules.filter(m => m.id !== moduleId);
    if (candidates.length === 0) return;

    const matches = findStructuralMatches(source, language, candidates, 0.3);

    // Get vector similarity scores if embedding engine is ready
    const vectorScores = this.embeddingEngine?.isReady()
      ? this.embeddingEngine.computeModuleVectorScores(moduleId, language)
      : undefined;

    // Merge structural matches with vector boost
    const scoreMap = new Map<number, number>();
    for (const match of matches) {
      if (match.score >= 0.3 && match.moduleId !== moduleId) {
        scoreMap.set(match.moduleId, match.score);
      }
    }

    // Add vector-only matches that structural search missed
    if (vectorScores) {
      for (const [candId, vecScore] of vectorScores) {
        if (vecScore >= 0.5 && candId !== moduleId) {
          const existing = scoreMap.get(candId);
          if (existing) {
            // Boost structural score with vector similarity
            scoreMap.set(candId, Math.min(1.0, existing + vecScore * 0.15));
          } else {
            // Vector-only match
            scoreMap.set(candId, vecScore * 0.8);
          }
        }
      }
    }

    for (const [candId, score] of scoreMap) {
      this.codeModuleRepo.upsertSimilarity(moduleId, candId, score);

      // High similarity → create synapse
      if (score >= 0.7) {
        this.synapseManager.strengthen(
          { type: 'code_module', id: moduleId },
          { type: 'code_module', id: candId },
          'similar_to',
        );
      }
    }
  }

  private indexDependencySynapses(moduleId: number, internalDeps: string[], projectId: number): void {
    const projectModules = this.codeModuleRepo.findByProject(projectId);

    for (const dep of internalDeps) {
      // Normalize the dep path to match against registered modules
      const depName = dep.replace(/^\.\//, '').replace(/\.\w+$/, '');

      const target = projectModules.find(m => {
        const modulePath = m.file_path.replace(/\\/g, '/').replace(/\.\w+$/, '');
        return modulePath.endsWith(depName) || m.name === depName;
      });

      if (target && target.id !== moduleId) {
        this.synapseManager.strengthen(
          { type: 'code_module', id: moduleId },
          { type: 'code_module', id: target.id },
          'depends_on',
        );
      }
    }
  }

  listProjects(): Array<{ id: number; name: string; path: string | null; language: string | null; framework: string | null; moduleCount: number }> {
    const projects = this.projectRepo.getAll();
    return projects.map(p => ({
      id: p.id,
      name: p.name,
      path: p.path,
      language: p.language,
      framework: p.framework,
      moduleCount: this.codeModuleRepo.findByProject(p.id).length,
    }));
  }
}
