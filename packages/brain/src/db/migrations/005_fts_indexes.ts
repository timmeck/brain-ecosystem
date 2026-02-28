import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    -- Full-text search for errors
    CREATE VIRTUAL TABLE IF NOT EXISTS errors_fts USING fts5(
      type, message, raw_output, context, file_path,
      content='errors',
      content_rowid='id'
    );

    -- Sync triggers for errors_fts
    CREATE TRIGGER IF NOT EXISTS errors_ai AFTER INSERT ON errors BEGIN
      INSERT INTO errors_fts(rowid, type, message, raw_output, context, file_path)
      VALUES (new.id, new.type, new.message, new.raw_output, new.context, new.file_path);
    END;

    CREATE TRIGGER IF NOT EXISTS errors_ad AFTER DELETE ON errors BEGIN
      INSERT INTO errors_fts(errors_fts, rowid, type, message, raw_output, context, file_path)
      VALUES ('delete', old.id, old.type, old.message, old.raw_output, old.context, old.file_path);
    END;

    CREATE TRIGGER IF NOT EXISTS errors_au AFTER UPDATE ON errors BEGIN
      INSERT INTO errors_fts(errors_fts, rowid, type, message, raw_output, context, file_path)
      VALUES ('delete', old.id, old.type, old.message, old.raw_output, old.context, old.file_path);
      INSERT INTO errors_fts(rowid, type, message, raw_output, context, file_path)
      VALUES (new.id, new.type, new.message, new.raw_output, new.context, new.file_path);
    END;

    -- Full-text search for solutions
    CREATE VIRTUAL TABLE IF NOT EXISTS solutions_fts USING fts5(
      description, commands, code_change,
      content='solutions',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS solutions_ai AFTER INSERT ON solutions BEGIN
      INSERT INTO solutions_fts(rowid, description, commands, code_change)
      VALUES (new.id, new.description, new.commands, new.code_change);
    END;

    CREATE TRIGGER IF NOT EXISTS solutions_ad AFTER DELETE ON solutions BEGIN
      INSERT INTO solutions_fts(solutions_fts, rowid, description, commands, code_change)
      VALUES ('delete', old.id, old.description, old.commands, old.code_change);
    END;

    CREATE TRIGGER IF NOT EXISTS solutions_au AFTER UPDATE ON solutions BEGIN
      INSERT INTO solutions_fts(solutions_fts, rowid, description, commands, code_change)
      VALUES ('delete', old.id, old.description, old.commands, old.code_change);
      INSERT INTO solutions_fts(rowid, description, commands, code_change)
      VALUES (new.id, new.description, new.commands, new.code_change);
    END;

    -- Full-text search for code modules
    CREATE VIRTUAL TABLE IF NOT EXISTS code_modules_fts USING fts5(
      name, file_path, description, language,
      content='code_modules',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS code_modules_ai AFTER INSERT ON code_modules BEGIN
      INSERT INTO code_modules_fts(rowid, name, file_path, description, language)
      VALUES (new.id, new.name, new.file_path, new.description, new.language);
    END;

    CREATE TRIGGER IF NOT EXISTS code_modules_ad AFTER DELETE ON code_modules BEGIN
      INSERT INTO code_modules_fts(code_modules_fts, rowid, name, file_path, description, language)
      VALUES ('delete', old.id, old.name, old.file_path, old.description, old.language);
    END;

    CREATE TRIGGER IF NOT EXISTS code_modules_au AFTER UPDATE ON code_modules BEGIN
      INSERT INTO code_modules_fts(code_modules_fts, rowid, name, file_path, description, language)
      VALUES ('delete', old.id, old.name, old.file_path, old.description, old.language);
      INSERT INTO code_modules_fts(rowid, name, file_path, description, language)
      VALUES (new.id, new.name, new.file_path, new.description, new.language);
    END;
  `);
}
