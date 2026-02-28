import path from 'node:path';
import { sha256 } from '../utils/hash.js';
import type { StackFrame } from '../parsing/types.js';

export function templateMessage(msg: string): string {
  return msg
    .replace(/[A-Z]:\\[\w\-.\\ ]+\.\w+/g, '<PATH>')
    .replace(/\/[\w\-./ ]+\.\w+/g, '<PATH>')
    .replace(/:(\d+):(\d+)/g, ':<LINE>:<COL>')
    .replace(/line \d+/gi, 'line <LINE>')
    .replace(/0x[0-9a-fA-F]+/g, '<ADDR>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/https?:\/\/[^\s]+/g, '<URL>')
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/g, '<TIMESTAMP>')
    // Normalize JS/TS property access patterns so "reading 'map'" ≈ "reading 'forEach'"
    .replace(/\(reading ['"][^'"]*['"]\)/g, "(reading '<PROP>')")
    .replace(/\(writing ['"][^'"]*['"]\)/g, "(writing '<PROP>')")
    // Normalize quoted identifiers (e.g., 'someVar', "someFunc")
    .replace(/['"][a-zA-Z_$][\w$]*['"]/g, "'<IDENT>'");
}

export function generateFingerprint(
  errorType: string,
  message: string,
  frames: StackFrame[],
): string {
  const template = templateMessage(message);
  const topFrames = frames
    .slice(0, 3)
    .map(f => `${f.function_name || '<anon>'}@${path.basename(f.file_path || '<unknown>')}`)
    .join('|');
  const input = `${errorType}::${template}::${topFrames}`;
  return sha256(input);
}
