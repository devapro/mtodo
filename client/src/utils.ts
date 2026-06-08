// Shared client-side helpers: safe JSON parsing, date math/formatting and the
// natural-language quick-add parser.

/** Parse a persisted `repeat_days` JSON string without ever throwing. */
export function safeParseRepeatDays(value: string | null | undefined): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => Number(v)).filter((n) => !Number.isNaN(n));
  } catch {
    return [];
  }
}

/** Local (not UTC) YYYY-MM-DD for the given date (defaults to now). */
export function toDateStr(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function todayStr(): string {
  return toDateStr();
}

/** Difference in whole days between a YYYY-MM-DD string and today (negative = past). */
export function daysFromToday(dateStr: string): number {
  const today = new Date(todayStr() + 'T00:00:00');
  const target = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(target.getTime())) return 0;
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function isOverdue(dateStr: string | null, completed: boolean): boolean {
  if (!dateStr || completed) return false;
  return daysFromToday(dateStr) < 0;
}

export interface RelativeDate {
  label: string; // e.g. "Today", "Tomorrow", "in 3d", "2d ago"
  tone: 'overdue' | 'today' | 'soon' | 'future';
}

/**
 * Human-friendly relative description of a due date. `labels` supplies the
 * translated words for the special cases so this stays i18n-aware.
 */
export function describeDueDate(
  dateStr: string,
  labels: { today: string; tomorrow: string; yesterday: string }
): RelativeDate {
  const diff = daysFromToday(dateStr);
  if (diff === 0) return { label: labels.today, tone: 'today' };
  if (diff === 1) return { label: labels.tomorrow, tone: 'soon' };
  if (diff === -1) return { label: labels.yesterday, tone: 'overdue' };
  if (diff < 0) return { label: dateStr, tone: 'overdue' };
  if (diff <= 7) return { label: dateStr, tone: 'soon' };
  return { label: dateStr, tone: 'future' };
}

const WEEKDAY_TOKENS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

export interface ParsedQuickAdd {
  title: string;
  tags: string[];
  dueDate: string | null;
}

/**
 * Parse a quick-add string into a title, #tags and an optional due date.
 *
 * Supported date tokens (case-insensitive):
 *   - "today", "tomorrow"
 *   - a weekday name ("mon", "friday") → the next such weekday
 *   - "in 3d" / "in 2w" → relative offsets
 *   - an ISO date "2026-01-15"
 * Tags are written as "#tag". Recognized tokens are stripped from the title.
 */
export function parseQuickAdd(raw: string): ParsedQuickAdd {
  const tags: string[] = [];
  let dueDate: string | null = null;

  // Extract #tags first.
  let text = raw.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (_m, _pre, tag: string) => {
    if (!tags.includes(tag)) tags.push(tag);
    return ' ';
  });

  // "in N d/w" relative offset.
  text = text.replace(/(^|\s)in\s+(\d{1,3})\s*([dw])\b/i, (_m, _pre, n: string, unit: string) => {
    if (dueDate) return _m;
    const days = parseInt(n, 10) * (unit.toLowerCase() === 'w' ? 7 : 1);
    const d = new Date();
    d.setDate(d.getDate() + days);
    dueDate = toDateStr(d);
    return ' ';
  });

  // ISO date.
  text = text.replace(/(^|\s)(\d{4}-\d{2}-\d{2})\b/, (_m, _pre, iso: string) => {
    if (dueDate) return _m;
    if (!Number.isNaN(new Date(iso + 'T00:00:00').getTime())) dueDate = iso;
    return ' ';
  });

  // Keyword / weekday tokens.
  text = text.replace(/(^|\s)(today|tomorrow|[a-z]+)\b/gi, (m, _pre, word: string) => {
    if (dueDate) return m;
    const w = word.toLowerCase();
    if (w === 'today') {
      dueDate = todayStr();
      return ' ';
    }
    if (w === 'tomorrow') {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      dueDate = toDateStr(d);
      return ' ';
    }
    if (w in WEEKDAY_TOKENS) {
      const target = WEEKDAY_TOKENS[w];
      const d = new Date();
      let delta = (target - d.getDay() + 7) % 7;
      if (delta === 0) delta = 7; // next occurrence, not today
      d.setDate(d.getDate() + delta);
      dueDate = toDateStr(d);
      return ' ';
    }
    return m;
  });

  const title = text.replace(/\s+/g, ' ').trim();
  return { title, tags, dueDate };
}
