import { describe, it, expect } from 'vitest';
import { shellParser } from '../../../src/parsing/parsers/shell.js';

describe('shellParser', () => {
  describe('canParse', () => {
    it('returns true for command not found', () => {
      expect(shellParser.canParse('bash: docker-compose: command not found')).toBe(true);
    });

    it('returns true for Permission denied', () => {
      expect(shellParser.canParse('bash: ./deploy.sh: Permission denied')).toBe(true);
    });

    it('returns true for ENOENT', () => {
      expect(shellParser.canParse('Error: ENOENT: no such file or directory')).toBe(true);
    });

    it('returns true for ECONNREFUSED', () => {
      expect(shellParser.canParse('Error: connect ECONNREFUSED 127.0.0.1:3000')).toBe(true);
    });

    it('returns true for EADDRINUSE', () => {
      expect(shellParser.canParse('Error: listen EADDRINUSE: address already in use :::3000')).toBe(true);
    });

    it('returns false for plain text', () => {
      expect(shellParser.canParse('server started on port 3000')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses command not found', () => {
      const result = shellParser.parse('bash: docker-compose: command not found')!;
      expect(result.errorType).toBe('CommandNotFound');
      expect(result.message).toBe('bash: docker-compose: command not found');
      expect(result.language).toBe('shell');
      expect(result.stackTrace).toBeNull();
      expect(result.frames).toHaveLength(0);
    });

    it('parses Permission denied', () => {
      const result = shellParser.parse('bash: ./deploy.sh: Permission denied')!;
      expect(result.errorType).toBe('PermissionError');
    });

    it('parses EACCES as PermissionError', () => {
      const result = shellParser.parse('Error: EACCES: permission denied, open /etc/hosts')!;
      expect(result.errorType).toBe('PermissionError');
    });

    it('parses ENOENT as FileNotFound', () => {
      const result = shellParser.parse('No such file or directory: /app/config.json')!;
      expect(result.errorType).toBe('FileNotFound');
    });

    it('parses ETIMEDOUT as Timeout', () => {
      const result = shellParser.parse('Error: connect ETIMEDOUT 10.0.0.1:443')!;
      expect(result.errorType).toBe('Timeout');
    });

    it('parses ENOMEM as OutOfMemory', () => {
      const result = shellParser.parse('Error: ENOMEM: not enough memory')!;
      expect(result.errorType).toBe('OutOfMemory');
    });

    it('uses first line as message for multi-line input', () => {
      const input = `bash: git: command not found
Please install git first.`;
      const result = shellParser.parse(input)!;
      expect(result.message).toBe('bash: git: command not found');
    });

    it('has no source file or line info', () => {
      const result = shellParser.parse('bash: node: command not found')!;
      expect(result.sourceFile).toBeNull();
      expect(result.sourceLine).toBeNull();
    });
  });
});
