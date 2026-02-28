import type Database from 'better-sqlite3';
import { PatternExtractor, type ContentPattern } from '../learning/pattern-extractor.js';
import { getLogger } from '../utils/logger.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface PostTimeSuggestion {
  time: string;       // ISO 8601 string
  day: string;        // e.g. "Monday"
  hour: number;       // 0-23
  reason: string;
  confidence: number;
}

export interface WeeklySlot {
  day: string;
  time: string;       // e.g. "09:00"
  reason: string;
  confidence: number;
}

// Default platform-specific best times (fallback when no data)
const DEFAULT_TIMES: Record<string, Array<{ day: number; hour: number }>> = {
  x:        [{ day: 2, hour: 9 }, { day: 3, hour: 12 }, { day: 4, hour: 10 }],
  linkedin: [{ day: 2, hour: 8 }, { day: 3, hour: 10 }, { day: 4, hour: 9 }],
  reddit:   [{ day: 1, hour: 10 }, { day: 3, hour: 14 }, { day: 5, hour: 11 }],
  bluesky:  [{ day: 1, hour: 9 }, { day: 3, hour: 11 }, { day: 5, hour: 10 }],
};

export class CalendarService {
  private logger = getLogger();
  private patternExtractor: PatternExtractor;

  constructor(private db: Database.Database) {
    this.patternExtractor = new PatternExtractor(db);
  }

  suggestNextPostTime(platform?: string): PostTimeSuggestion {
    const patterns = this.patternExtractor.extractPatterns();
    const timingPatterns = patterns
      .filter(p => p.category === 'timing')
      .sort((a, b) => b.multiplier - a.multiplier);

    // Get last post time to avoid posting too soon
    const lastPost = this.getLastPostTime(platform);
    const now = new Date();
    const minNextTime = lastPost
      ? new Date(Math.max(now.getTime(), lastPost.getTime() + 4 * 60 * 60 * 1000)) // min 4 hours gap
      : now;

    // Try to find the best time from patterns
    if (timingPatterns.length > 0) {
      const suggestion = this.findNextTimeFromPatterns(timingPatterns, minNextTime);
      if (suggestion) return suggestion;
    }

    // Fallback to platform defaults or generic best time
    return this.getDefaultSuggestion(platform, minNextTime);
  }

  getWeeklySchedule(platform?: string): WeeklySlot[] {
    const patterns = this.patternExtractor.extractPatterns();
    const timingPatterns = patterns
      .filter(p => p.category === 'timing')
      .sort((a, b) => b.multiplier - a.multiplier);

    const slots: WeeklySlot[] = [];

    if (timingPatterns.length > 0) {
      // Use learned patterns to build weekly schedule
      const usedDays = new Set<string>();

      for (const pattern of timingPatterns) {
        const parsed = this.parseTimingPattern(pattern);
        if (!parsed) continue;

        for (const slot of parsed) {
          if (usedDays.has(slot.day)) continue;
          usedDays.add(slot.day);

          slots.push({
            day: slot.day,
            time: this.formatHour(slot.hour),
            reason: pattern.pattern,
            confidence: pattern.confidence,
          });
        }
      }
    }

    // Fill remaining days with platform defaults
    if (slots.length < 3) {
      const defaultTimes = DEFAULT_TIMES[platform ?? 'x'] ?? DEFAULT_TIMES['x']!;
      const usedDays = new Set(slots.map(s => s.day));

      for (const dt of defaultTimes) {
        const dayName = DAY_NAMES[dt.day]!;
        if (usedDays.has(dayName)) continue;
        usedDays.add(dayName);

        slots.push({
          day: dayName,
          time: this.formatHour(dt.hour),
          reason: `Default recommended time for ${platform ?? 'general'} posting`,
          confidence: 0.3,
        });
      }
    }

    // Sort by day of week
    return slots.sort((a, b) => {
      const dayA = DAY_NAMES.indexOf(a.day);
      const dayB = DAY_NAMES.indexOf(b.day);
      return dayA - dayB;
    });
  }

  private getLastPostTime(platform?: string): Date | null {
    let stmt;
    if (platform) {
      stmt = this.db.prepare(`
        SELECT published_at FROM posts
        WHERE status = 'published' AND platform = ?
        ORDER BY published_at DESC LIMIT 1
      `);
      const row = stmt.get(platform) as { published_at: string } | undefined;
      return row ? new Date(row.published_at) : null;
    } else {
      stmt = this.db.prepare(`
        SELECT published_at FROM posts
        WHERE status = 'published'
        ORDER BY published_at DESC LIMIT 1
      `);
      const row = stmt.get() as { published_at: string } | undefined;
      return row ? new Date(row.published_at) : null;
    }
  }

  private findNextTimeFromPatterns(patterns: ContentPattern[], minTime: Date): PostTimeSuggestion | null {
    for (const pattern of patterns) {
      const parsed = this.parseTimingPattern(pattern);
      if (!parsed || parsed.length === 0) continue;

      // Find the next occurrence of any parsed day/hour after minTime
      for (const slot of parsed) {
        const nextTime = this.getNextOccurrence(slot.dayIndex, slot.hour, minTime);
        return {
          time: nextTime.toISOString(),
          day: slot.day,
          hour: slot.hour,
          reason: pattern.pattern,
          confidence: pattern.confidence,
        };
      }
    }
    return null;
  }

  private parseTimingPattern(pattern: ContentPattern): Array<{ day: string; dayIndex: number; hour: number }> | null {
    const results: Array<{ day: string; dayIndex: number; hour: number }> = [];

    // Match day names
    for (let i = 0; i < DAY_NAMES.length; i++) {
      if (pattern.pattern.includes(DAY_NAMES[i]!)) {
        results.push({ day: DAY_NAMES[i]!, dayIndex: i, hour: 9 }); // default hour 9
      }
    }

    // Match time blocks
    if (pattern.pattern.includes('early morning')) {
      const hour = 7;
      if (results.length === 0) {
        // Add weekday defaults
        results.push({ day: 'Tuesday', dayIndex: 2, hour }, { day: 'Thursday', dayIndex: 4, hour });
      } else {
        for (const r of results) r.hour = hour;
      }
    } else if (pattern.pattern.includes('morning (9')) {
      const hour = 10;
      if (results.length === 0) {
        results.push({ day: 'Tuesday', dayIndex: 2, hour }, { day: 'Thursday', dayIndex: 4, hour });
      } else {
        for (const r of results) r.hour = hour;
      }
    } else if (pattern.pattern.includes('afternoon')) {
      const hour = 14;
      if (results.length === 0) {
        results.push({ day: 'Wednesday', dayIndex: 3, hour }, { day: 'Friday', dayIndex: 5, hour });
      } else {
        for (const r of results) r.hour = hour;
      }
    } else if (pattern.pattern.includes('evening')) {
      const hour = 18;
      if (results.length === 0) {
        results.push({ day: 'Monday', dayIndex: 1, hour }, { day: 'Wednesday', dayIndex: 3, hour });
      } else {
        for (const r of results) r.hour = hour;
      }
    }

    return results.length > 0 ? results : null;
  }

  private getNextOccurrence(targetDay: number, targetHour: number, after: Date): Date {
    const next = new Date(after);
    next.setMinutes(0, 0, 0);

    // Find the next occurrence of targetDay
    const currentDay = next.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil < 0) daysUntil += 7;
    if (daysUntil === 0 && next.getHours() >= targetHour) daysUntil = 7;

    next.setDate(next.getDate() + daysUntil);
    next.setHours(targetHour);

    return next;
  }

  private getDefaultSuggestion(platform: string | undefined, minTime: Date): PostTimeSuggestion {
    const defaults = DEFAULT_TIMES[platform ?? 'x'] ?? DEFAULT_TIMES['x']!;
    const bestDefault = defaults[0]!;
    const nextTime = this.getNextOccurrence(bestDefault.day, bestDefault.hour, minTime);

    return {
      time: nextTime.toISOString(),
      day: DAY_NAMES[bestDefault.day]!,
      hour: bestDefault.hour,
      reason: `Default recommended time for ${platform ?? 'general'} posting (no learned patterns yet)`,
      confidence: 0.3,
    };
  }

  private formatHour(hour: number): string {
    return `${String(hour).padStart(2, '0')}:00`;
  }
}
