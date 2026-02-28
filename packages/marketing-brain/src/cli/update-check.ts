import https from 'node:https';
import { c, icons } from './colors.js';

// Read current version from package.json at build time
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pkg = require('../../package.json');
const CURRENT_VERSION: string = pkg.version;

export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}

function fetchLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 3000);

    const req = https.get(
      'https://registry.npmjs.org/@timmeck/marketing-brain/latest',
      { headers: { Accept: 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          clearTimeout(timeout);
          try {
            const json = JSON.parse(data);
            resolve(json.version ?? null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

function isNewer(latest: string, current: string): boolean {
  const l = latest.split('.').map(Number);
  const cur = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] ?? 0) > (cur[i] ?? 0)) return true;
    if ((l[i] ?? 0) < (cur[i] ?? 0)) return false;
  }
  return false;
}

export async function checkForUpdate(): Promise<void> {
  try {
    const latest = await fetchLatestVersion();
    if (latest && isNewer(latest, CURRENT_VERSION)) {
      console.log();
      console.log(`  ${icons.star}  ${c.orange.bold(`Update available: v${CURRENT_VERSION} → v${latest}`)}`);
      console.log(`     Run: ${c.cyan('npm update -g @timmeck/marketing-brain')}`);
    }
  } catch {
    // silently ignore — update check is best-effort
  }
}
