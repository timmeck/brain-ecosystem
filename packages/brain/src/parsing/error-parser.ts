import { ErrorParserRegistry } from './types.js';
import { nodeParser } from './parsers/node.js';
import { pythonParser } from './parsers/python.js';
import { rustParser } from './parsers/rust.js';
import { goParser } from './parsers/go.js';
import { shellParser } from './parsers/shell.js';
import { compilerParser } from './parsers/compiler.js';
import { genericParser } from './parsers/generic.js';

let registryInstance: ErrorParserRegistry | null = null;

export function getParserRegistry(): ErrorParserRegistry {
  if (!registryInstance) {
    registryInstance = new ErrorParserRegistry();
    registryInstance.register(nodeParser);
    registryInstance.register(pythonParser);
    registryInstance.register(rustParser);
    registryInstance.register(goParser);
    registryInstance.register(shellParser);
    registryInstance.register(compilerParser);
    registryInstance.register(genericParser);
  }
  return registryInstance;
}

export function parseError(input: string) {
  return getParserRegistry().parse(input);
}
