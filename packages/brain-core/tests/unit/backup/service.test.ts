import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { BackupService } from '../../../src/backup/service.js';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('BackupService', () => {
  let db: Database.Database;
  let service: BackupService;
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-backup-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO items VALUES (1, 'Alpha');
      INSERT INTO items VALUES (2, 'Beta');
      INSERT INTO items VALUES (3, 'Charlie');
    `);
    service = new BackupService(db, dbPath, { backupDir: path.join(tmpDir, 'backups') });
  });

  afterEach(() => {
    try { db.close(); } catch { /* may already be closed */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* Windows lock */ }
  });

  describe('create', () => {
    it('creates a backup file', () => {
      const backup = service.create();
      expect(backup.filename).toMatch(/^backup-.*\.db$/);
      expect(fs.existsSync(backup.path)).toBe(true);
      expect(backup.size).toBeGreaterThan(0);
    });

    it('creates backup with label', () => {
      const backup = service.create('before-migration');
      expect(backup.filename).toContain('-before-migration');
    });

    it('verifies backup integrity', () => {
      const backup = service.create();
      const ok = service.checkIntegrity(backup.path);
      expect(ok).toBe(true);
    });

    it('backup contains the same data', () => {
      const backup = service.create();
      const backupDb = new Database(backup.path, { readonly: true });
      const rows = backupDb.prepare('SELECT * FROM items').all() as { id: number; name: string }[];
      backupDb.close();

      expect(rows).toHaveLength(3);
      expect(rows[0]!.name).toBe('Alpha');
    });
  });

  describe('list', () => {
    it('lists all backups', () => {
      service.create('first');
      service.create('second');

      const list = service.list();
      expect(list).toHaveLength(2);
      // Newest first
      expect(list[0]!.filename).toContain('second');
    });

    it('returns empty array when no backups', () => {
      expect(service.list()).toEqual([]);
    });
  });

  describe('restore', () => {
    it('restores from a backup', () => {
      // Create backup with original data
      const backup = service.create();

      // Modify data
      db.exec(`DELETE FROM items WHERE id = 1`);
      expect((db.prepare('SELECT COUNT(*) as c FROM items').get() as { c: number }).c).toBe(2);

      // Restore
      const result = service.restore(backup.filename);
      expect(result.success).toBe(true);
      expect(result.integrityOk).toBe(true);

      // Reopen DB and verify data restored
      db = new Database(dbPath);
      const count = (db.prepare('SELECT COUNT(*) as c FROM items').get() as { c: number }).c;
      expect(count).toBe(3);

      // Update service reference for cleanup
      service = new BackupService(db, dbPath, { backupDir: path.join(tmpDir, 'backups') });
    });

    it('creates safety backup before restore', () => {
      const backup = service.create();

      service.restore(backup.filename);

      // Reopen DB
      db = new Database(dbPath);
      service = new BackupService(db, dbPath, { backupDir: path.join(tmpDir, 'backups') });

      // Safety backup is a .db file in the backups dir containing "pre-restore"
      const backupDir = path.join(tmpDir, 'backups');
      const files = fs.readdirSync(backupDir);
      const safetyFile = files.find(f => f.includes('pre-restore'));
      expect(safetyFile).toBeDefined();
    });

    it('throws for non-existent backup', () => {
      expect(() => service.restore('nonexistent.db')).toThrow('Backup not found');
    });
  });

  describe('delete', () => {
    it('deletes a backup file', () => {
      const backup = service.create();
      expect(service.delete(backup.filename)).toBe(true);
      expect(fs.existsSync(backup.path)).toBe(false);
    });

    it('returns false for non-existent file', () => {
      expect(service.delete('nonexistent.db')).toBe(false);
    });
  });

  describe('getInfo', () => {
    it('returns database size info', () => {
      const info = service.getInfo();
      expect(info.dbSize).toBeGreaterThan(0);
      expect(info.backupCount).toBe(0);
      expect(info.backupTotalSize).toBe(0);
    });

    it('includes backup counts after creating backups', () => {
      service.create();
      service.create();
      const info = service.getInfo();
      expect(info.backupCount).toBe(2);
      expect(info.backupTotalSize).toBeGreaterThan(0);
    });
  });

  describe('auto-cleanup', () => {
    it('removes old backups beyond maxBackups', () => {
      const smallService = new BackupService(db, dbPath, {
        backupDir: path.join(tmpDir, 'backups'),
        maxBackups: 2,
      });

      smallService.create('one');
      smallService.create('two');
      smallService.create('three'); // should trigger cleanup of 'one'

      const list = smallService.list();
      expect(list).toHaveLength(2);
      expect(list.find(b => b.filename.includes('one'))).toBeUndefined();
    });
  });

  describe('checkIntegrity', () => {
    it('returns true for valid database', () => {
      expect(service.checkIntegrity()).toBe(true);
    });

    it('returns false for non-existent file', () => {
      expect(service.checkIntegrity(path.join(tmpDir, 'nonexistent.db'))).toBe(false);
    });
  });
});
