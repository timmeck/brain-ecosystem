import { c, baseIcons, header, keyValue, statusBadge, progressBar, divider, table, stripAnsi } from '@timmeck/brain-core';

export { c, header, keyValue, statusBadge, progressBar, divider, table, stripAnsi };

export const icons = {
  ...baseIcons,
  brain: '🧠',
  search: '🔍',
  module: '📦',
};

export function priorityBadge(priority: number | string): string {
  const p = typeof priority === 'string' ? priority.toLowerCase() : '';
  const n = typeof priority === 'number' ? priority : 0;
  if (p === 'critical' || n >= 9) return c.red.bold(`[CRITICAL]`);
  if (p === 'high' || n >= 7) return c.orange.bold(`[HIGH]`);
  if (p === 'medium' || n >= 4) return c.blue(`[MEDIUM]`);
  return c.dim(`[LOW]`);
}
