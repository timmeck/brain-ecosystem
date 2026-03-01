import { describe, it, expect } from 'vitest';
import { goParser } from '../../../src/parsing/parsers/go.js';

describe('goParser', () => {
  describe('canParse', () => {
    it('returns true for Go compile error', () => {
      expect(goParser.canParse('./main.go:15:2: undefined: fmt.Prinln')).toBe(true);
    });

    it('returns true for panic', () => {
      expect(goParser.canParse('panic: runtime error: index out of range')).toBe(true);
    });

    it('returns true for fatal error', () => {
      expect(goParser.canParse('fatal error: all goroutines are asleep - deadlock!')).toBe(true);
    });

    it('returns false for Python error', () => {
      expect(goParser.canParse('Traceback (most recent call last):\n  File "main.py", line 1')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses Go compile error with file, line, column, message', () => {
      const input = './main.go:15:2: undefined: fmt.Prinln';
      const result = goParser.parse(input)!;
      expect(result.errorType).toBe('CompilerError');
      expect(result.message).toBe('undefined: fmt.Prinln');
      expect(result.language).toBe('go');
      expect(result.sourceFile).toBe('main.go');
      expect(result.sourceLine).toBe(15);
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0]!.column_number).toBe(2);
    });

    it('parses panic with goroutine stack trace', () => {
      const input = `panic: runtime error: index out of range [5] with length 3

goroutine 1 [running]:
main.main()
	/app/main.go:12 +0x40`;
      const result = goParser.parse(input)!;
      expect(result.errorType).toBe('PanicError');
      expect(result.message).toBe('runtime error: index out of range [5] with length 3');
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0]!.file_path).toBe('/app/main.go');
      expect(result.frames[0]!.line_number).toBe(12);
      expect(result.frames[0]!.function_name).toBe('main.main');
    });

    it('parses fatal error', () => {
      const input = 'fatal error: all goroutines are asleep - deadlock!';
      const result = goParser.parse(input)!;
      expect(result.errorType).toBe('FatalError');
      expect(result.message).toBe('all goroutines are asleep - deadlock!');
      expect(result.language).toBe('go');
      expect(result.frames).toHaveLength(0);
      expect(result.sourceFile).toBeNull();
    });

    it('returns null for non-matching input', () => {
      const result = goParser.parse('just plain text');
      expect(result).toBeNull();
    });
  });
});
