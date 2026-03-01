import { describe, it, expect } from 'vitest';
import { pythonParser } from '../../../src/parsing/parsers/python.js';

describe('pythonParser', () => {
  describe('canParse', () => {
    it('returns true for Traceback header', () => {
      expect(pythonParser.canParse('Traceback (most recent call last):\n  File "main.py", line 1')).toBe(true);
    });

    it('returns true for File "...", line N pattern', () => {
      expect(pythonParser.canParse('  File "/app/main.py", line 42, in <module>')).toBe(true);
    });

    it('returns false for Node.js error', () => {
      expect(pythonParser.canParse('TypeError: Cannot read properties of undefined\n    at foo (/app/index.js:5:10)')).toBe(false);
    });

    it('returns false for plain text', () => {
      expect(pythonParser.canParse('everything is fine')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses KeyError from traceback', () => {
      const input = `Traceback (most recent call last):
  File "/app/main.py", line 42, in <module>
    result = process_data(data)
  File "/app/processor.py", line 15, in process_data
    return data["key"]["nested"]
KeyError: 'nested'`;
      const result = pythonParser.parse(input)!;
      expect(result.errorType).toBe('KeyError');
      expect(result.message).toBe("'nested'");
      expect(result.language).toBe('python');
    });

    it('extracts stack frames from Python traceback', () => {
      const input = `Traceback (most recent call last):
  File "/app/main.py", line 42, in <module>
    result = process_data(data)
  File "/app/processor.py", line 15, in process_data
    return data["key"]["nested"]
KeyError: 'nested'`;
      const result = pythonParser.parse(input)!;
      expect(result.frames).toHaveLength(2);
      expect(result.frames[0]!.file_path).toBe('/app/main.py');
      expect(result.frames[0]!.line_number).toBe(42);
      expect(result.frames[0]!.function_name).toBe('<module>');
      expect(result.frames[1]!.file_path).toBe('/app/processor.py');
      expect(result.frames[1]!.line_number).toBe(15);
      expect(result.frames[1]!.function_name).toBe('process_data');
    });

    it('sets sourceFile and sourceLine from last frame (innermost)', () => {
      const input = `Traceback (most recent call last):
  File "/app/main.py", line 42, in <module>
    result = process_data(data)
  File "/app/processor.py", line 15, in process_data
    return data["key"]["nested"]
KeyError: 'nested'`;
      const result = pythonParser.parse(input)!;
      expect(result.sourceFile).toBe('/app/processor.py');
      expect(result.sourceLine).toBe(15);
    });

    it('parses ModuleNotFoundError', () => {
      const input = `Traceback (most recent call last):
  File "/app/server.py", line 1, in <module>
    from flask import Flask
ModuleNotFoundError: No module named 'flask'`;
      const result = pythonParser.parse(input)!;
      expect(result.errorType).toBe('ModuleNotFoundError');
      expect(result.message).toContain('flask');
    });

    it('parses TypeError with operand info', () => {
      const input = `Traceback (most recent call last):
  File "/app/calc.py", line 10, in compute
    return x + y
TypeError: unsupported operand type(s) for +: 'int' and 'str'`;
      const result = pythonParser.parse(input)!;
      expect(result.errorType).toBe('TypeError');
      expect(result.message).toContain("unsupported operand type(s)");
    });

    it('parses ValueError', () => {
      const input = `Traceback (most recent call last):
  File "/app/parser.py", line 25, in parse_int
    return int(value)
ValueError: invalid literal for int() with base 10: 'abc'`;
      const result = pythonParser.parse(input)!;
      expect(result.errorType).toBe('ValueError');
      expect(result.message).toContain("invalid literal");
    });

    it('generates normalized frame field', () => {
      const input = `Traceback (most recent call last):
  File "/app/main.py", line 42, in <module>
    foo()
KeyError: 'x'`;
      const result = pythonParser.parse(input)!;
      expect(result.frames[0]!.normalized).toBe('<module>@main.py');
    });

    it('column_number is always null for Python frames', () => {
      const input = `Traceback (most recent call last):
  File "/app/main.py", line 42, in <module>
    foo()
KeyError: 'x'`;
      const result = pythonParser.parse(input)!;
      expect(result.frames[0]!.column_number).toBeNull();
    });

    it('falls back to last line as message when no error type matches', () => {
      const input = `  File "/app/main.py", line 1
some weird output`;
      const result = pythonParser.parse(input)!;
      expect(result.message).toBe('some weird output');
    });
  });
});
