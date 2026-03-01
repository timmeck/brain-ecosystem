import { describe, it, expect } from 'vitest';
import { rustParser } from '../../../src/parsing/parsers/rust.js';

describe('rustParser', () => {
  describe('canParse', () => {
    it('returns true for error[E0308]', () => {
      expect(rustParser.canParse('error[E0308]: mismatched types')).toBe(true);
    });

    it('returns true for bare error: prefix', () => {
      expect(rustParser.canParse('error: could not compile `my_crate`')).toBe(true);
    });

    it('returns false for Node.js error', () => {
      expect(rustParser.canParse('TypeError: Cannot read properties of undefined')).toBe(false);
    });

    it('returns false for plain text', () => {
      expect(rustParser.canParse('compilation succeeded')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses error with code and location', () => {
      const input = `error[E0308]: mismatched types
 --> src/main.rs:10:5
  |
9 | fn get_count() -> u32 {
  |                   --- expected \`u32\` because of return type
10|     "hello"
  |     ^^^^^^^ expected \`u32\`, found \`&str\``;
      const result = rustParser.parse(input)!;
      expect(result.errorType).toBe('E0308');
      expect(result.message).toBe('mismatched types');
      expect(result.language).toBe('rust');
      expect(result.sourceFile).toBe('src/main.rs');
      expect(result.sourceLine).toBe(10);
    });

    it('extracts frame from --> location', () => {
      const input = `error[E0502]: cannot borrow \`v\` as mutable
 --> src/main.rs:6:5`;
      const result = rustParser.parse(input)!;
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0]!.file_path).toBe('src/main.rs');
      expect(result.frames[0]!.line_number).toBe(6);
      expect(result.frames[0]!.column_number).toBe(5);
    });

    it('generates normalized frame field', () => {
      const input = `error[E0106]: missing lifetime specifier
 --> src/lib.rs:5:16`;
      const result = rustParser.parse(input)!;
      expect(result.frames[0]!.normalized).toBe('<compiler>@lib.rs');
    });

    it('parses bare error without code', () => {
      const input = `error: could not compile \`my_crate\` due to previous error`;
      const result = rustParser.parse(input)!;
      expect(result.errorType).toBe('CompilerError');
      expect(result.message).toContain('could not compile');
      expect(result.frames).toHaveLength(0);
    });

    it('returns null when no error pattern matches', () => {
      const result = rustParser.parse('warning: unused variable');
      expect(result).toBeNull();
    });
  });
});
