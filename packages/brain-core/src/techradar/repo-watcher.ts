/**
 * Repo Watcher — Überwacht GitHub Repos auf neue Releases/Changelogs
 *
 * Einrichten:
 *   Braucht GITHUB_TOKEN in .env für höheres Rate Limit (optional, 60 req/h ohne).
 *   Repos hinzufügen:
 *     brain techradar repos add anthropics/claude-code
 *     brain techradar repos add modelcontextprotocol/servers
 */

import { getLogger } from '../utils/logger.js';
import type { WatchedRepo, RepoRelease } from './types.js';

const log = getLogger();

export class RepoWatcher {
  private readonly githubToken: string | null;

  constructor(githubToken?: string) {
    this.githubToken = githubToken ?? process.env.GITHUB_TOKEN ?? null;
  }

  /**
   * Check a repo for new releases since the last known tag.
   * Returns new releases (newest first).
   */
  async checkReleases(repo: WatchedRepo): Promise<RepoRelease[]> {
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'BrainEcosystem/1.0',
      };
      if (this.githubToken) {
        headers['Authorization'] = `Bearer ${this.githubToken}`;
      }

      const response = await fetch(
        `https://api.github.com/repos/${repo.full_name}/releases?per_page=10`,
        { headers },
      );

      if (!response.ok) {
        log.warn(`[RepoWatcher] GitHub API error for ${repo.full_name}: ${response.status}`);
        return [];
      }

      const data = await response.json() as Array<{
        tag_name: string;
        name: string;
        body: string;
        published_at: string;
        html_url: string;
        prerelease: boolean;
      }>;

      // Filter to only new releases (after last known tag)
      const releases: RepoRelease[] = [];
      for (const release of data) {
        if (repo.last_release_tag && release.tag_name === repo.last_release_tag) {
          break; // We've seen this one, stop
        }
        releases.push({
          tag: release.tag_name,
          name: release.name || release.tag_name,
          body: release.body || '',
          published_at: release.published_at,
          url: release.html_url,
          is_prerelease: release.prerelease,
        });
      }

      return releases;
    } catch (err) {
      log.warn(`[RepoWatcher] Error checking ${repo.full_name}: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Fetch the CHANGELOG.md or CHANGES.md from a repo.
   * Returns the content or null if not found.
   */
  async fetchChangelog(repoFullName: string): Promise<string | null> {
    const candidates = ['CHANGELOG.md', 'CHANGES.md', 'HISTORY.md', 'changelog.md'];

    for (const filename of candidates) {
      try {
        const headers: Record<string, string> = {
          'Accept': 'application/vnd.github.raw+json',
          'User-Agent': 'BrainEcosystem/1.0',
        };
        if (this.githubToken) {
          headers['Authorization'] = `Bearer ${this.githubToken}`;
        }

        const response = await fetch(
          `https://api.github.com/repos/${repoFullName}/contents/${filename}`,
          { headers },
        );

        if (response.ok) {
          const content = await response.text();
          // Truncate to first ~5000 chars (recent entries)
          return content.substring(0, 5000);
        }
      } catch {
        // Try next candidate
      }
    }

    return null;
  }
}
