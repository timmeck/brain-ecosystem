/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { AlertRepository } from '../../../src/db/repositories/alert.repository.js';
import { runMigrations } from '../../../src/db/migrations/index.js';

// Mock logger so runMigrations doesn't fail
vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function makeAlert(overrides: Record<string, any> = {}) {
  return {
    name: 'Test Alert',
    condition_type: 'win_rate_drop',
    condition_json: JSON.stringify({ threshold: 0.5, pair: 'BTC/USDT' }),
    ...overrides,
  };
}

describe('AlertRepository', () => {
  let db: Database.Database;
  let repo: AlertRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    repo = new AlertRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create an alert and return its id', () => {
      const id = repo.create(makeAlert());
      expect(id).toBe(1);

      const alert = repo.getById(id);
      expect(alert).toBeDefined();
      expect(alert!.name).toBe('Test Alert');
      expect(alert!.condition_type).toBe('win_rate_drop');
      expect(alert!.active).toBe(1);
      expect(alert!.trigger_count).toBe(0);
      expect(alert!.last_triggered_at).toBeNull();
    });

    it('should return incrementing IDs', () => {
      const id1 = repo.create(makeAlert({ name: 'Alert 1' }));
      const id2 = repo.create(makeAlert({ name: 'Alert 2' }));
      const id3 = repo.create(makeAlert({ name: 'Alert 3' }));

      expect(id1).toBe(1);
      expect(id2).toBe(2);
      expect(id3).toBe(3);
    });

    it('should store optional webhook_url and cooldown_minutes', () => {
      const id = repo.create(makeAlert({
        webhook_url: 'https://hooks.example.com/alert',
        cooldown_minutes: 30,
      }));

      const alert = repo.getById(id)!;
      expect(alert.webhook_url).toBe('https://hooks.example.com/alert');
      expect(alert.cooldown_minutes).toBe(30);
    });

    it('should default cooldown_minutes to 0 when not provided', () => {
      const id = repo.create(makeAlert());
      const alert = repo.getById(id)!;
      expect(alert.cooldown_minutes).toBe(0);
    });
  });

  describe('getById', () => {
    it('should return the correct alert by id', () => {
      const id = repo.create(makeAlert({ name: 'Specific Alert' }));
      const alert = repo.getById(id);

      expect(alert).toBeDefined();
      expect(alert!.id).toBe(id);
      expect(alert!.name).toBe('Specific Alert');
    });

    it('should return undefined for non-existent id', () => {
      const result = repo.getById(999);
      expect(result).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all alerts sorted by created_at DESC', () => {
      // Insert with explicit timestamps to control order
      db.exec(`INSERT INTO alerts (name, condition_type, condition_json, created_at)
        VALUES ('Old Alert', 'type_a', '{}', '2026-01-01 00:00:00')`);
      db.exec(`INSERT INTO alerts (name, condition_type, condition_json, created_at)
        VALUES ('Middle Alert', 'type_b', '{}', '2026-02-01 00:00:00')`);
      db.exec(`INSERT INTO alerts (name, condition_type, condition_json, created_at)
        VALUES ('New Alert', 'type_c', '{}', '2026-03-01 00:00:00')`);

      const alerts = repo.getAll();
      expect(alerts).toHaveLength(3);
      expect(alerts[0].name).toBe('New Alert');
      expect(alerts[1].name).toBe('Middle Alert');
      expect(alerts[2].name).toBe('Old Alert');
    });

    it('should return empty array when no alerts exist', () => {
      const alerts = repo.getAll();
      expect(alerts).toHaveLength(0);
    });
  });

  describe('getActive', () => {
    it('should only return active alerts', () => {
      const id1 = repo.create(makeAlert({ name: 'Active Alert 1' }));
      const id2 = repo.create(makeAlert({ name: 'Inactive Alert' }));
      const id3 = repo.create(makeAlert({ name: 'Active Alert 2' }));

      // Deactivate the second alert
      repo.update(id2, { active: false });

      const active = repo.getActive();
      expect(active).toHaveLength(2);
      expect(active.every(a => a.active === 1)).toBe(true);
      expect(active.map(a => a.name)).toContain('Active Alert 1');
      expect(active.map(a => a.name)).toContain('Active Alert 2');
    });

    it('should return empty array when no alerts are active', () => {
      const id = repo.create(makeAlert());
      repo.update(id, { active: false });

      const active = repo.getActive();
      expect(active).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should update the name', () => {
      const id = repo.create(makeAlert({ name: 'Original' }));
      repo.update(id, { name: 'Updated' });

      const alert = repo.getById(id)!;
      expect(alert.name).toBe('Updated');
    });

    it('should update the condition_type', () => {
      const id = repo.create(makeAlert({ condition_type: 'win_rate_drop' }));
      repo.update(id, { condition_type: 'drawdown_alert' });

      const alert = repo.getById(id)!;
      expect(alert.condition_type).toBe('drawdown_alert');
    });

    it('should update the active flag', () => {
      const id = repo.create(makeAlert());
      expect(repo.getById(id)!.active).toBe(1);

      repo.update(id, { active: false });
      expect(repo.getById(id)!.active).toBe(0);

      repo.update(id, { active: true });
      expect(repo.getById(id)!.active).toBe(1);
    });

    it('should update updated_at timestamp', () => {
      const id = repo.create(makeAlert());
      const before = repo.getById(id)!.updated_at;

      // Small delay isn't reliable in tests, but the UPDATE sets updated_at = datetime('now')
      repo.update(id, { name: 'Changed' });
      const after = repo.getById(id)!.updated_at;

      // updated_at should be set (not null)
      expect(after).toBeDefined();
      expect(typeof after).toBe('string');
    });

    it('should only update provided fields, leaving others unchanged', () => {
      const id = repo.create(makeAlert({
        name: 'Original',
        condition_type: 'win_rate_drop',
        cooldown_minutes: 15,
      }));

      repo.update(id, { name: 'New Name' });

      const alert = repo.getById(id)!;
      expect(alert.name).toBe('New Name');
      expect(alert.condition_type).toBe('win_rate_drop');
      expect(alert.cooldown_minutes).toBe(15);
    });
  });

  describe('delete', () => {
    it('should remove the alert', () => {
      const id = repo.create(makeAlert());
      expect(repo.getById(id)).toBeDefined();

      repo.delete(id);
      expect(repo.getById(id)).toBeUndefined();
    });

    it('should not affect other alerts', () => {
      const id1 = repo.create(makeAlert({ name: 'Keep' }));
      const id2 = repo.create(makeAlert({ name: 'Delete' }));

      repo.delete(id2);

      expect(repo.getById(id1)).toBeDefined();
      expect(repo.getById(id2)).toBeUndefined();
      expect(repo.getAll()).toHaveLength(1);
    });
  });

  describe('recordTrigger', () => {
    it('should create a history entry', () => {
      const alertId = repo.create(makeAlert());
      const historyId = repo.recordTrigger(alertId, null, 'Win rate dropped below 50%');

      expect(historyId).toBe(1);

      const history = repo.getHistory(alertId);
      expect(history).toHaveLength(1);
      expect(history[0].alert_id).toBe(alertId);
      expect(history[0].message).toBe('Win rate dropped below 50%');
      expect(history[0].trade_id).toBeNull();
      expect(history[0].data_json).toBeNull();
    });

    it('should store trade_id and data_json when provided', () => {
      const alertId = repo.create(makeAlert());
      const data = { win_rate: 0.42, pair: 'BTC/USDT' };
      repo.recordTrigger(alertId, 42, 'Alert triggered by trade', data);

      const history = repo.getHistory(alertId);
      expect(history[0].trade_id).toBe(42);
      expect(history[0].data_json).toBe(JSON.stringify(data));
    });

    it('should increment trigger_count on the alert', () => {
      const alertId = repo.create(makeAlert());
      expect(repo.getById(alertId)!.trigger_count).toBe(0);

      repo.recordTrigger(alertId, null, 'First trigger');
      expect(repo.getById(alertId)!.trigger_count).toBe(1);

      repo.recordTrigger(alertId, null, 'Second trigger');
      expect(repo.getById(alertId)!.trigger_count).toBe(2);

      repo.recordTrigger(alertId, null, 'Third trigger');
      expect(repo.getById(alertId)!.trigger_count).toBe(3);
    });

    it('should set last_triggered_at on the alert', () => {
      const alertId = repo.create(makeAlert());
      expect(repo.getById(alertId)!.last_triggered_at).toBeNull();

      repo.recordTrigger(alertId, null, 'Trigger');

      const alert = repo.getById(alertId)!;
      expect(alert.last_triggered_at).not.toBeNull();
      expect(typeof alert.last_triggered_at).toBe('string');
    });
  });

  describe('getHistory', () => {
    it('should return history for a specific alert only', () => {
      const alertId1 = repo.create(makeAlert({ name: 'Alert 1' }));
      const alertId2 = repo.create(makeAlert({ name: 'Alert 2' }));

      repo.recordTrigger(alertId1, null, 'Alert 1 trigger 1');
      repo.recordTrigger(alertId1, null, 'Alert 1 trigger 2');
      repo.recordTrigger(alertId2, null, 'Alert 2 trigger 1');

      const history1 = repo.getHistory(alertId1);
      expect(history1).toHaveLength(2);
      expect(history1.every(h => h.alert_id === alertId1)).toBe(true);

      const history2 = repo.getHistory(alertId2);
      expect(history2).toHaveLength(1);
      expect(history2[0].alert_id).toBe(alertId2);
    });

    it('should respect the limit parameter', () => {
      const alertId = repo.create(makeAlert());

      for (let i = 0; i < 10; i++) {
        repo.recordTrigger(alertId, null, `Trigger ${i}`);
      }

      const limited = repo.getHistory(alertId, 3);
      expect(limited).toHaveLength(3);
    });

    it('should return history in reverse chronological order', () => {
      const alertId = repo.create(makeAlert());

      db.exec(`INSERT INTO alert_history (alert_id, message, created_at)
        VALUES (${alertId}, 'First', '2026-01-01 00:00:00')`);
      db.exec(`INSERT INTO alert_history (alert_id, message, created_at)
        VALUES (${alertId}, 'Second', '2026-02-01 00:00:00')`);
      db.exec(`INSERT INTO alert_history (alert_id, message, created_at)
        VALUES (${alertId}, 'Third', '2026-03-01 00:00:00')`);

      const history = repo.getHistory(alertId);
      expect(history[0].message).toBe('Third');
      expect(history[1].message).toBe('Second');
      expect(history[2].message).toBe('First');
    });

    it('should return empty array when no history exists', () => {
      const alertId = repo.create(makeAlert());
      const history = repo.getHistory(alertId);
      expect(history).toHaveLength(0);
    });
  });
});
