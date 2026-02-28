import { describe, it, expect } from 'vitest';
import { parseError } from '../../../src/parsing/error-parser.js';
import { nodeTypeError, nodeModuleNotFound, nodeReferenceError, nodeSyntaxError } from '../../fixtures/errors/node.js';
import { pythonTraceback, pythonImportError, pythonTypeError } from '../../fixtures/errors/python.js';
import { rustCompilerError, rustBorrowError } from '../../fixtures/errors/rust.js';
import { goCompileError, goPanicError } from '../../fixtures/errors/go.js';
import { shellCommandNotFound, shellPermissionDenied, npmError } from '../../fixtures/errors/shell.js';

describe('Node.js Parser', () => {
  it('parses TypeError with stack trace', () => {
    const result = parseError(nodeTypeError);
    expect(result.errorType).toBe('TypeError');
    expect(result.message).toContain('Cannot read properties');
    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.language).toBe('javascript');
  });

  it('parses module not found error', () => {
    const result = parseError(nodeModuleNotFound);
    expect(result.errorType).toContain('Error');
    expect(result.message).toContain('Cannot find module');
  });

  it('parses ReferenceError', () => {
    const result = parseError(nodeReferenceError);
    expect(result.errorType).toBe('ReferenceError');
    expect(result.message).toContain('process is not defined');
  });

  it('parses SyntaxError', () => {
    const result = parseError(nodeSyntaxError);
    expect(result.errorType).toBe('SyntaxError');
  });
});

describe('Python Parser', () => {
  it('parses Python traceback with KeyError', () => {
    const result = parseError(pythonTraceback);
    expect(result.errorType).toBe('KeyError');
    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.language).toBe('python');
  });

  it('parses ModuleNotFoundError', () => {
    const result = parseError(pythonImportError);
    expect(result.errorType).toBe('ModuleNotFoundError');
    expect(result.message).toContain('flask');
  });

  it('parses TypeError', () => {
    const result = parseError(pythonTypeError);
    expect(result.errorType).toBe('TypeError');
  });
});

describe('Rust Parser', () => {
  it('parses compiler error with code', () => {
    const result = parseError(rustCompilerError);
    expect(result.errorType).toContain('E0308');
    expect(result.message).toContain('mismatched types');
    expect(result.language).toBe('rust');
  });

  it('parses borrow checker error', () => {
    const result = parseError(rustBorrowError);
    expect(result.errorType).toContain('E0502');
    expect(result.message).toContain('borrow');
  });
});

describe('Go Parser', () => {
  it('parses compile error', () => {
    const result = parseError(goCompileError);
    expect(result.errorType).toBeTruthy();
    expect(result.language).toBe('go');
  });

  it('parses panic', () => {
    const result = parseError(goPanicError);
    expect(result.message).toContain('index out of range');
  });
});

describe('Shell Parser', () => {
  it('parses command not found', () => {
    const result = parseError(shellCommandNotFound);
    expect(result.message).toContain('command not found');
    expect(result.language).toBe('shell');
  });

  it('parses permission denied', () => {
    const result = parseError(shellPermissionDenied);
    expect(result.message).toContain('Permission denied');
  });

  it('parses npm error', () => {
    const result = parseError(npmError);
    expect(result.message).toBeTruthy();
  });
});

describe('Generic fallback', () => {
  it('handles unknown error format gracefully', () => {
    const result = parseError('Something went wrong: unexpected token');
    expect(result.errorType).toBeTruthy();
    expect(result.message).toBeTruthy();
  });

  it('handles empty string', () => {
    const result = parseError('');
    expect(result).toBeTruthy();
  });
});
