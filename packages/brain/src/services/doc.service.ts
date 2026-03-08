import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { DocRepository } from '../db/repositories/doc.repository.js';
import type { ProjectRepository } from '../db/repositories/project.repository.js';
import type { DecisionRepository } from '../db/repositories/decision.repository.js';
import type { ChangelogRepository } from '../db/repositories/changelog.repository.js';
import type { TaskRepository } from '../db/repositories/task.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { ProjectDocRecord, IndexProjectInput, QueryDocsInput, DocType } from '../types/doc.types.js';
import { getEventBus } from '../utils/events.js';
import { getLogger } from '../utils/logger.js';

const DOC_FILE_MAP: Record<string, DocType> = {
  'README.md': 'readme',
  'readme.md': 'readme',
  'CLAUDE.md': 'claude_md',
  'claude.md': 'claude_md',
  'package.json': 'package_json',
  'tsconfig.json': 'tsconfig',
  'ARCHITECTURE.md': 'architecture',
  'architecture.md': 'architecture',
  'API.md': 'api',
  'api.md': 'api',
};

export class DocService {
  private logger = getLogger();

  constructor(
    private docRepo: DocRepository,
    private projectRepo: ProjectRepository,
    private decisionRepo: DecisionRepository,
    private changelogRepo: ChangelogRepository,
    private taskRepo: TaskRepository,
    private synapseManager: SynapseManager,
  ) {}

  indexProject(input: IndexProjectInput): { indexed: number; updated: number; projectId: number } {
    const bus = getEventBus();

    let projectId = input.projectId ?? 0;
    if (!input.projectId && input.project) {
      let project = this.projectRepo.findByName(input.project);
      if (!project) {
        const id = this.projectRepo.create({ name: input.project, path: input.projectPath, language: null, framework: null });
        project = this.projectRepo.getById(id);
      }
      if (project) projectId = project.id;
    }

    let indexed = 0;
    let updated = 0;

    for (const [fileName, docType] of Object.entries(DOC_FILE_MAP)) {
      const filePath = path.join(input.projectPath, fileName);
      if (!fs.existsSync(filePath)) continue;

      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const contentHash = crypto.createHash('sha256').update(content).digest('hex');

        // Check if already indexed with same hash
        const existing = this.docRepo.findByPath(projectId, fileName);
        if (existing && existing.content_hash === contentHash) continue;

        // Parse metadata for package.json and tsconfig.json
        let parsedMetadata: string | null = null;
        if (docType === 'package_json') {
          try {
            const pkg = JSON.parse(content);
            parsedMetadata = JSON.stringify({
              name: pkg.name,
              version: pkg.version,
              description: pkg.description,
              dependencies: Object.keys(pkg.dependencies ?? {}),
              devDependencies: Object.keys(pkg.devDependencies ?? {}),
              scripts: Object.keys(pkg.scripts ?? {}),
            });
          } catch (err) { this.logger.debug(`Failed to parse package.json for ${filePath}: ${(err as Error).message}`); }
        } else if (docType === 'tsconfig') {
          try {
            const tsconfig = JSON.parse(content);
            parsedMetadata = JSON.stringify({
              target: tsconfig.compilerOptions?.target,
              module: tsconfig.compilerOptions?.module,
              strict: tsconfig.compilerOptions?.strict,
              outDir: tsconfig.compilerOptions?.outDir,
            });
          } catch (err) { this.logger.debug(`Failed to parse tsconfig.json for ${filePath}: ${(err as Error).message}`); }
        }

        this.docRepo.upsert({
          project_id: projectId,
          file_path: fileName,
          doc_type: docType,
          content,
          content_hash: contentHash,
          parsed_metadata: parsedMetadata,
          embedding: null,
        });

        if (existing) {
          updated++;
        } else {
          indexed++;
          bus.emit('doc:indexed', { docId: 0, projectId, docType });
        }
      } catch (err) {
        this.logger.warn(`Failed to index ${filePath}: ${err}`);
      }
    }

    this.logger.info(`Indexed project docs: ${indexed} new, ${updated} updated`);
    return { indexed, updated, projectId };
  }

  queryDocs(input: QueryDocsInput): ProjectDocRecord[] {
    if (input.query) {
      try {
        return this.docRepo.search(input.query, input.projectId, input.limit ?? 20);
      } catch (err) {
        this.logger.debug(`[doc] FTS query error: ${(err as Error).message}`);
      }
    }

    if (input.projectId && input.docType) {
      return this.docRepo.findByType(input.projectId, input.docType);
    }

    if (input.projectId) {
      return this.docRepo.findByProject(input.projectId);
    }

    return [];
  }

  getById(id: number): ProjectDocRecord | undefined {
    return this.docRepo.getById(id);
  }

  getProjectContext(projectId: number): {
    docs: ProjectDocRecord[];
    activeTasks: unknown[];
    recentDecisions: unknown[];
    recentChanges: unknown[];
  } {
    const docs = this.docRepo.findByProject(projectId);
    const activeTasks = this.taskRepo.findByStatus('pending', projectId, 10)
      .concat(this.taskRepo.findByStatus('in_progress', projectId, 10));
    const recentDecisions = this.decisionRepo.findActive(projectId, 10);
    const recentChanges = this.changelogRepo.findByProject(projectId, 10);

    return { docs, activeTasks, recentDecisions, recentChanges };
  }
}
