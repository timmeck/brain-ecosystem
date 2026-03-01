import { describe, it, expect } from 'vitest';
import { nodeParser } from '../../../src/parsing/parsers/node.js';

describe('nodeParser', () => {
  describe('canParse', () => {
    it('returns true for TypeError with stack trace', () => {
      const input = `TypeError: Cannot read properties of undefined (reading 'map')
    at UserList (/app/src/components/UserList.tsx:15:23)
    at renderWithHooks (/app/node_modules/react-dom/cjs/react-dom.development.js:14985:18)`;
      expect(nodeParser.canParse(input)).toBe(true);
    });

    it('returns true for bare Error: prefix', () => {
      expect(nodeParser.canParse('Error: something broke')).toBe(true);
    });

    it('returns true for stack trace with at file:line:col', () => {
      expect(nodeParser.canParse('at /app/src/index.ts:10:5')).toBe(true);
    });

    it('returns false for Python traceback', () => {
      expect(nodeParser.canParse('Traceback (most recent call last):\n  File "main.py", line 1')).toBe(false);
    });

    it('returns false for plain text without error patterns', () => {
      expect(nodeParser.canParse('all systems operational')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses TypeError and extracts message', () => {
      const input = `TypeError: Cannot read properties of undefined (reading 'map')
    at UserList (/app/src/components/UserList.tsx:15:23)
    at renderWithHooks (/app/node_modules/react-dom/cjs/react-dom.development.js:14985:18)`;
      const result = nodeParser.parse(input);
      expect(result).not.toBeNull();
      expect(result!.errorType).toBe('TypeError');
      expect(result!.message).toBe("Cannot read properties of undefined (reading 'map')");
      expect(result!.language).toBe('javascript');
    });

    it('extracts stack frames from V8 format', () => {
      const input = `TypeError: Cannot read properties of undefined (reading 'map')
    at UserList (/app/src/components/UserList.tsx:15:23)
    at renderWithHooks (/app/node_modules/react-dom/cjs/react-dom.development.js:14985:18)`;
      const result = nodeParser.parse(input)!;
      expect(result.frames).toHaveLength(2);
      expect(result.frames[0]!.function_name).toBe('UserList');
      expect(result.frames[0]!.file_path).toBe('/app/src/components/UserList.tsx');
      expect(result.frames[0]!.line_number).toBe(15);
      expect(result.frames[0]!.column_number).toBe(23);
    });

    it('sets sourceFile and sourceLine from first frame', () => {
      const input = `ReferenceError: process is not defined
    at Object.<anonymous> (/app/src/utils/env.ts:3:18)
    at Module._compile (node:internal/modules/cjs/loader:1234:14)`;
      const result = nodeParser.parse(input)!;
      expect(result.sourceFile).toBe('/app/src/utils/env.ts');
      expect(result.sourceLine).toBe(3);
    });

    it('parses SyntaxError', () => {
      const input = `SyntaxError: Unexpected token '}'
    at wrapSafe (node:internal/modules/cjs/loader:1278:20)
    at Module._compile (node:internal/modules/cjs/loader:1320:27)`;
      const result = nodeParser.parse(input)!;
      expect(result.errorType).toBe('SyntaxError');
      expect(result.message).toBe("Unexpected token '}'");
    });

    it('parses bare stack frames without function name', () => {
      const input = `SyntaxError: Unexpected token '}'
    at wrapSafe (node:internal/modules/cjs/loader:1278:20)
    at /app/src/parser.ts:42:5`;
      const result = nodeParser.parse(input)!;
      // The bare frame at /app/src/parser.ts:42:5
      const bareFrame = result.frames.find(f => f.file_path === '/app/src/parser.ts');
      expect(bareFrame).toBeTruthy();
      expect(bareFrame!.function_name).toBeNull();
      expect(bareFrame!.line_number).toBe(42);
      expect(bareFrame!.column_number).toBe(5);
    });

    it('generates normalized field for frames', () => {
      const input = `TypeError: x is not a function
    at doWork (/app/src/worker.ts:10:5)`;
      const result = nodeParser.parse(input)!;
      expect(result.frames[0]!.normalized).toBe('doWork@worker.ts');
    });

    it('returns null when no error type line is found', () => {
      const result = nodeParser.parse('just some text without an error type');
      expect(result).toBeNull();
    });
  });
});
