import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve, basename, relative, extname } from 'path';
import { c, icons, header, divider, progressBar } from '../colors.js';

const DEFAULT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go',
  '.java', '.c', '.cpp', '.h', '.hpp', '.rb', '.sh',
  '.html', '.css', '.scss', '.json', '.yaml', '.yml', '.toml',
  '.md', '.sql', '.php', '.svelte', '.vue', '.astro',
]);

const EXCLUDE_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '.next',
  '__pycache__', 'vendor', 'coverage', '.cache', '.turbo',
  '.nuxt', '.output', 'target', 'out', 'venv', '.venv',
  'env', '.env', 'site-packages',
]);

const EXCLUDE_PATTERNS = [/\.min\./, /\.bundle\./, /\.d\.ts$/];

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', rs: 'rust', go: 'go', java: 'java',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  rb: 'ruby', sh: 'shell', bash: 'shell',
  html: 'html', css: 'css', scss: 'scss',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  md: 'markdown', sql: 'sql', php: 'php',
  svelte: 'svelte', vue: 'vue', astro: 'astro',
};

function detectLanguage(filePath: string): string {
  const ext = extname(filePath).slice(1).toLowerCase();
  return LANG_MAP[ext] ?? ext;
}

function findSourceFiles(dir: string, extensions: Set<string>, maxSizeBytes: number): string[] {
  const files: string[] = [];

  function walk(current: string): void {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return; // skip unreadable directories
    }

    for (const entry of entries) {
      const fullPath = resolve(current, entry.name);

      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) {
          walk(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = extname(entry.name).toLowerCase();
      if (!extensions.has(ext)) continue;
      if (EXCLUDE_PATTERNS.some(p => p.test(entry.name))) continue;

      try {
        const stat = statSync(fullPath);
        if (stat.size > maxSizeBytes) continue;
        files.push(fullPath);
      } catch {
        // skip unreadable files
      }
    }
  }

  walk(dir);
  return files.sort();
}

export function importCommand(): Command {
  return new Command('import')
    .description('Import source files from a project directory into Brain')
    .argument('<directory>', 'Project directory to scan')
    .option('-p, --project <name>', 'Project name (default: directory basename)')
    .option('-e, --extensions <list>', 'Comma-separated extensions (default: ts,tsx,js,jsx,py,rs,go,java,c,cpp,h,hpp,rb,sh,html,css,scss,json,yaml,yml,toml,md,sql,php,svelte,vue,astro)')
    .option('--dry-run', 'List files that would be imported without importing')
    .option('--max-size <kb>', 'Skip files larger than N KB', '100')
    .option('--smart', 'Smart import: scan Git history, log files, and build output for errors + solutions')
    .option('--no-build', 'Skip build scan (use with --smart)')
    .option('--git-depth <n>', 'Number of git commits to scan (default: 200)', '200')
    .action(async (directory: string, opts) => {
      const dir = resolve(directory);
      const projectName = opts.project ?? basename(dir);
      const maxSizeKb = parseInt(opts.maxSize, 10) || 100;
      const maxSizeBytes = maxSizeKb * 1024;

      // Verify directory exists
      try {
        const stat = statSync(dir);
        if (!stat.isDirectory()) {
          console.error(`Not a directory: ${dir}`);
          process.exit(1);
        }
      } catch {
        console.error(`Directory not found: ${dir}`);
        process.exit(1);
      }

      // Smart Import Mode
      if (opts.smart) {
        console.log(`${icons.brain}  ${c.info('Smart Import')} ${c.value(dir)} as ${c.cyan(`"${projectName}"`)}`);
        console.log(divider());

        // Smart import can take a while (git log + build), so use 120s timeout
        await withIpc(async (client) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result: any = await client.request('scan.project', {
            directory: dir,
            project: projectName,
            options: {
              gitDepth: parseInt(opts.gitDepth, 10) || 200,
              skipBuild: opts.build === false,
            },
          });

          // Git results
          if (result.git) {
            const g = result.git;
            console.log(`\n  ${icons.ok} ${c.label('Git History:')}`);
            console.log(`    Commits scanned: ${c.value(g.commitsScanned)}`);
            console.log(`    Fix commits:     ${c.value(g.fixCommits)}`);
            console.log(`    Errors created:  ${c.green(g.errorsCreated)}`);
            console.log(`    Solutions:       ${c.green(g.solutionsCreated)}`);
            if (g.duplicates > 0) console.log(`    Duplicates:      ${c.dim(g.duplicates)}`);
          }

          // Log results
          if (result.logs) {
            const l = result.logs;
            console.log(`\n  ${icons.ok} ${c.label('Log Files:')}`);
            console.log(`    Files scanned:   ${c.value(l.filesScanned)}`);
            console.log(`    Errors created:  ${c.green(l.errorsCreated)}`);
            if (l.duplicates > 0) console.log(`    Duplicates:      ${c.dim(l.duplicates)}`);
          }

          // Build results
          if (result.build && result.build.buildSystem !== 'unknown') {
            const b = result.build;
            const exitColor = b.exitCode === 0 ? c.green : c.red;
            console.log(`\n  ${icons.ok} ${c.label(`Build (${b.buildSystem}):`)}`);
            console.log(`    Command:         ${c.dim(b.command)}`);
            console.log(`    Exit code:       ${exitColor(b.exitCode)}`);
            console.log(`    Errors created:  ${c.green(b.errorsCreated)}`);
          } else if (result.build?.buildSystem === 'unknown') {
            console.log(`\n  ${c.dim('No build system detected.')}`);
          }

          // Totals
          const t = result.totals;
          console.log(header('Smart Import Summary', icons.brain));
          console.log(`  ${c.label('Project:')}    ${c.cyan(projectName)}`);
          console.log(`  ${c.label('Errors:')}     ${c.value(t.errors)}`);
          console.log(`  ${c.label('Solutions:')}  ${c.value(t.solutions)}`);
          console.log(`  ${c.label('Duplicates:')} ${c.dim(t.duplicates)}`);
          console.log(`  ${c.label('Duration:')}   ${c.dim(`${result.duration}ms`)}`);
          console.log(divider());
        }, 120_000);
        return;
      }

      // Regular Import Mode (existing behavior)
      // Parse extensions
      let extensions = DEFAULT_EXTENSIONS;
      if (opts.extensions) {
        extensions = new Set(
          opts.extensions.split(',').map((e: string) => {
            const trimmed = e.trim();
            return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
          })
        );
      }

      console.log(`${icons.search}  ${c.info('Scanning')} ${c.value(dir)} ...`);
      const files = findSourceFiles(dir, extensions, maxSizeBytes);

      if (files.length === 0) {
        console.log(`${c.dim('No source files found.')}`);
        return;
      }

      console.log(`${icons.ok}  Found ${c.value(files.length)} source files.\n`);

      if (opts.dryRun) {
        for (const f of files) {
          const rel = relative(dir, f);
          const lang = detectLanguage(f);
          console.log(`  ${c.cyan(`[${lang}]`)} ${c.dim(rel)}`);
        }
        console.log(`\n${c.value(files.length)} files would be imported as project ${c.cyan(`"${projectName}"`)}.`);
        return;
      }

      // Import via IPC
      await withIpc(async (client) => {
        let imported = 0;
        let newCount = 0;
        let existingCount = 0;
        let failedCount = 0;
        let totalScore = 0;

        for (let i = 0; i < files.length; i++) {
          const filePath = files[i];
          const rel = relative(dir, filePath);
          const fileName = basename(filePath);
          const language = detectLanguage(filePath);

          let source: string;
          try {
            source = readFileSync(filePath, 'utf-8');
          } catch {
            failedCount++;
            process.stdout.write(`  ${c.dim(`[${i + 1}/${files.length}]`)} ${c.dim(rel)} ${c.red('— read error')}\n`);
            continue;
          }

          // Skip empty files
          if (!source.trim()) continue;

          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result: any = await client.request('code.analyze', {
              project: projectName,
              name: fileName,
              filePath: rel,
              language,
              source,
            });

            const score = result.reusabilityScore ?? 0;
            const scoreColor = score >= 0.7 ? c.green : score >= 0.4 ? c.orange : c.red;
            const statusTag = result.isNew ? c.green('new') : c.dim('existing');
            totalScore += score;
            imported++;

            if (result.isNew) newCount++;
            else existingCount++;

            process.stdout.write(`  ${c.dim(`[${i + 1}/${files.length}]`)} ${c.dim(rel)} ${c.dim(icons.arrow)} ${scoreColor(score.toFixed(2))} (${statusTag})\n`);
          } catch (err) {
            failedCount++;
            const msg = err instanceof Error ? err.message : String(err);
            process.stdout.write(`  ${c.dim(`[${i + 1}/${files.length}]`)} ${c.dim(rel)} ${c.red(`— ${msg.slice(0, 80)}`)}\n`);
          }
        }

        const avgScore = imported > 0 ? (totalScore / imported).toFixed(2) : '0';
        console.log(header('Import Summary', icons.module));
        console.log(`  ${c.label('Project:')}  ${c.cyan(projectName)}`);
        console.log(`  ${c.label('Imported:')} ${c.value(imported)} (${c.green(`${newCount} new`)}, ${c.dim(`${existingCount} existing`)})`);
        if (failedCount > 0) console.log(`  ${c.label('Failed:')}   ${c.red(failedCount)}`);
        console.log(`  ${c.label('Avg score:')} ${c.value(avgScore)}  ${progressBar(parseFloat(avgScore), 1)}`);
        console.log(divider());
      });
    });
}
