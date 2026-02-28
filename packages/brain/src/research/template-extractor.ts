import type { ResearchConfig } from '../types/config.types.js';
import type { CodeModuleRepository } from '../db/repositories/code-module.repository.js';
import type { ProjectRepository } from '../db/repositories/project.repository.js';
import type { InsightRepository } from '../db/repositories/insight.repository.js';
import { getLogger } from '../utils/logger.js';

/**
 * Identifies code modules adapted across projects that can be generalized into templates.
 */
export class TemplateExtractor {
  private logger = getLogger();

  constructor(
    private codeModuleRepo: CodeModuleRepository,
    private projectRepo: ProjectRepository,
    private insightRepo: InsightRepository,
    private config: ResearchConfig,
  ) {}

  extract(): number {
    let insightsCreated = 0;

    insightsCreated += this.findReusableModules();
    insightsCreated += this.findTemplatingCandidates();

    this.logger.info(`Template extraction complete: ${insightsCreated} insights`);
    return insightsCreated;
  }

  private findReusableModules(): number {
    const projects = this.projectRepo.getAll();
    if (projects.length < 2) return 0;

    // Collect all modules grouped by fingerprint
    const byFingerprint = new Map<string, Array<{ projectId: number; projectName: string; moduleId: number; moduleName: string }>>();

    for (const project of projects) {
      const modules = this.codeModuleRepo.findByProject(project.id);
      for (const mod of modules) {
        const existing = byFingerprint.get(mod.fingerprint) ?? [];
        existing.push({
          projectId: project.id,
          projectName: project.name,
          moduleId: mod.id,
          moduleName: mod.name,
        });
        byFingerprint.set(mod.fingerprint, existing);
      }
    }

    let count = 0;
    const expiresAt = new Date(Date.now() + this.config.insightExpiryDays * 86400000).toISOString();

    for (const [fingerprint, usages] of byFingerprint) {
      const uniqueProjects = new Set(usages.map(u => u.projectId));
      if (uniqueProjects.size >= this.config.templateMinAdaptations) {
        const moduleName = usages[0]!.moduleName;
        this.insightRepo.create({
          type: 'pattern',
          title: `Shared module candidate: ${moduleName}`,
          description: `Module "${moduleName}" appears identically in ${uniqueProjects.size} projects. Extract as a shared library.`,
          evidence: JSON.stringify({
            fingerprint,
            projectCount: uniqueProjects.size,
            usages: usages.map(u => ({ project: u.projectName, moduleId: u.moduleId })),
          }),
          priority: Math.min(80, 30 + uniqueProjects.size * 15),
          project_id: null,
          active: 1,
          expires_at: expiresAt,
        });
        count++;
      }
    }

    return count;
  }

  private findTemplatingCandidates(): number {
    const projects = this.projectRepo.getAll();
    if (projects.length < 2) return 0;

    // Group modules by name across projects (same name, different fingerprint = adaptation)
    const byName = new Map<string, Array<{ projectId: number; projectName: string; moduleId: number; reusability: number }>>();

    for (const project of projects) {
      const modules = this.codeModuleRepo.findByProject(project.id);
      for (const mod of modules) {
        const existing = byName.get(mod.name) ?? [];
        existing.push({
          projectId: project.id,
          projectName: project.name,
          moduleId: mod.id,
          reusability: mod.reusability_score,
        });
        byName.set(mod.name, existing);
      }
    }

    let count = 0;
    const expiresAt = new Date(Date.now() + this.config.insightExpiryDays * 86400000).toISOString();

    for (const [name, usages] of byName) {
      const uniqueProjects = new Set(usages.map(u => u.projectId));
      if (uniqueProjects.size >= this.config.templateMinAdaptations) {
        const avgReusability = usages.reduce((sum, u) => sum + u.reusability, 0) / usages.length;
        if (avgReusability >= 0.5) {
          this.insightRepo.create({
            type: 'suggestion',
            title: `Template candidate: ${name}`,
            description: `"${name}" exists in ${uniqueProjects.size} projects as adaptations (avg reusability ${Math.round(avgReusability * 100)}%). Generalize into parameterized template.`,
            evidence: JSON.stringify({
              name,
              projectCount: uniqueProjects.size,
              avgReusability,
              usages: usages.map(u => ({ project: u.projectName, moduleId: u.moduleId })),
            }),
            priority: Math.min(75, 25 + uniqueProjects.size * 10 + Math.round(avgReusability * 20)),
            project_id: null,
            active: 1,
            expires_at: expiresAt,
          });
          count++;
        }
      }
    }

    return count;
  }
}
