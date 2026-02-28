import chalk from 'chalk';

// Shared brand color palette — identical across all brains
export const c = {
  // Primary palette
  blue: chalk.hex('#5b9cff'),
  purple: chalk.hex('#b47aff'),
  cyan: chalk.hex('#47e5ff'),
  green: chalk.hex('#3dffa0'),
  red: chalk.hex('#ff5577'),
  orange: chalk.hex('#ffb347'),
  dim: chalk.hex('#8b8fb0'),
  dimmer: chalk.hex('#4a4d6e'),

  // Semantic
  label: chalk.hex('#8b8fb0'),
  value: chalk.white.bold,
  heading: chalk.hex('#5b9cff').bold,
  success: chalk.hex('#3dffa0').bold,
  error: chalk.hex('#ff5577').bold,
  warn: chalk.hex('#ffb347').bold,
  info: chalk.hex('#47e5ff'),
};

// Shared base icons — each brain extends with domain-specific icons
export const baseIcons = {
  check: '\u2713',
  cross: '\u2717',
  arrow: '\u2192',
  dot: '\u25CF',
  circle: '\u25CB',
  bar: '\u2588',
  barLight: '\u2591',
  dash: '\u2500',
  pipe: '\u2502',
  corner: '\u2514',
  tee: '\u251C',
  star: '\u2605',
  bolt: '\u26A1',
  gear: '\u2699',
  chart: '\uD83D\uDCCA',
  synapse: '\uD83D\uDD17',
  insight: '\uD83D\uDCA1',
  warn: '\u26A0',
  error: '\u274C',
  ok: '\u2705',
  clock: '\u23F1',
};

export function header(title: string, icon?: string): string {
  const prefix = icon ? `${icon}  ` : '';
  const line = c.dimmer(baseIcons.dash.repeat(40));
  return `\n${line}\n${prefix}${c.heading(title)}\n${line}`;
}

export function keyValue(key: string, value: string | number, indent = 2): string {
  const pad = ' '.repeat(indent);
  return `${pad}${c.label(key + ':')} ${c.value(String(value))}`;
}

export function statusBadge(status: string): string {
  switch (status.toLowerCase()) {
    case 'resolved':
    case 'active':
    case 'running':
      return c.green(`[${status.toUpperCase()}]`);
    case 'open':
    case 'unresolved':
      return c.red(`[${status.toUpperCase()}]`);
    case 'warning':
      return c.warn(`[${status.toUpperCase()}]`);
    default:
      return c.dim(`[${status.toUpperCase()}]`);
  }
}

export function progressBar(current: number, total: number, width = 20): string {
  const pct = Math.min(1, current / Math.max(1, total));
  const filled = Math.round(pct * width);
  const empty = width - filled;
  return c.cyan(baseIcons.bar.repeat(filled)) + c.dimmer(baseIcons.barLight.repeat(empty));
}

export function divider(width = 40): string {
  return c.dimmer(baseIcons.dash.repeat(width));
}

export function table(rows: string[][], colWidths?: number[]): string {
  if (rows.length === 0) return '';
  const widths = colWidths ?? rows[0].map((_, i) =>
    Math.max(...rows.map(r => stripAnsi(r[i] ?? '').length))
  );
  return rows.map(row =>
    row.map((cell, i) => {
      const stripped = stripAnsi(cell);
      const pad = Math.max(0, (widths[i] ?? stripped.length) - stripped.length);
      return cell + ' '.repeat(pad);
    }).join('  ')
  ).join('\n');
}

export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}
