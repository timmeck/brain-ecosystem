import { describe, it, expect } from 'vitest';
import { compilerParser } from '../../../src/parsing/parsers/compiler.js';

describe('compilerParser', () => {
  describe('canParse', () => {
    it('returns true for gcc-style error', () => {
      expect(compilerParser.canParse('main.c:10:5: error: expected declaration')).toBe(true);
    });

    it('returns true for javac error', () => {
      expect(compilerParser.canParse('Main.java:5: error: cannot find symbol')).toBe(true);
    });

    it('returns true for fatal error keyword', () => {
      expect(compilerParser.canParse('fatal error: stdio.h: No such file or directory')).toBe(true);
    });

    it('returns true for compilation failed', () => {
      expect(compilerParser.canParse('compilation failed for module X')).toBe(true);
    });

    it('returns false for plain text', () => {
      expect(compilerParser.canParse('Build succeeded in 2s')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses gcc error with file, line, column, message', () => {
      const input = 'main.c:10:5: error: expected declaration or statement at end of input';
      const result = compilerParser.parse(input)!;
      expect(result.errorType).toBe('CompilerError');
      expect(result.message).toBe('expected declaration or statement at end of input');
      expect(result.sourceFile).toBe('main.c');
      expect(result.sourceLine).toBe(10);
      expect(result.frames[0]!.column_number).toBe(5);
      expect(result.language).toBe('c');
    });

    it('parses gcc warning', () => {
      const input = 'utils.c:20:10: warning: unused variable x';
      const result = compilerParser.parse(input)!;
      expect(result.errorType).toBe('CompilerWarning');
      expect(result.message).toBe('unused variable x');
    });

    it('detects C++ language from .cpp extension', () => {
      const input = 'app.cpp:15:3: error: no matching function for call';
      const result = compilerParser.parse(input)!;
      expect(result.language).toBe('cpp');
    });

    it('parses javac error', () => {
      const input = 'Main.java:5: error: cannot find symbol';
      const result = compilerParser.parse(input)!;
      expect(result.errorType).toBe('CompilerError');
      expect(result.message).toBe('cannot find symbol');
      expect(result.language).toBe('java');
      expect(result.sourceFile).toBe('Main.java');
      expect(result.sourceLine).toBe(5);
      expect(result.frames[0]!.column_number).toBeNull();
    });

    it('parses generic compiler fatal error', () => {
      const input = 'module.swift:42:10: fatal: segmentation fault during compilation';
      const result = compilerParser.parse(input)!;
      expect(result.errorType).toBe('CompilerError');
      expect(result.message).toBe('segmentation fault during compilation');
      expect(result.language).toBe('swift');
    });

    it('generates normalized frame field', () => {
      const input = 'src/lib.c:30:1: error: implicit declaration of function';
      const result = compilerParser.parse(input)!;
      expect(result.frames[0]!.normalized).toBe('<compiler>@lib.c');
    });

    it('returns null when no compiler pattern matches', () => {
      const result = compilerParser.parse('random text that is not a compiler error');
      expect(result).toBeNull();
    });
  });
});
