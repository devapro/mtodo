// Import/export of the user's lists (and the tasks they contain) as JSON.
//
// Export produces a portable, versioned envelope. Import validates that
// envelope and returns plain objects the caller can recreate through the API.
// This module is intentionally free of network calls so it stays easy to test
// and reuse; orchestration lives in SettingsPage.

import type { List, RepeatType, Task } from '../types';
import { safeParseRepeatDays } from '../utils';

export const LISTS_EXPORT_VERSION = 1;
const FILE_KIND = 'mtodo-lists';

const REPEAT_TYPES: RepeatType[] = ['none', 'daily', 'weekly', 'monthly', 'custom'];

export interface ExportTask {
  title: string;
  description: string | null;
  due_date: string | null;
  repeat_type: RepeatType;
  repeat_interval: number | null;
  repeat_unit: string | null;
  repeat_days: number[];
  completed: boolean;
  tags: string[];
}

export interface ExportList {
  name: string;
  color: string | null;
  emoji: string | null;
  tasks: ExportTask[];
}

export interface ListsFile {
  kind: typeof FILE_KIND;
  version: number;
  exportedAt: string;
  lists: ExportList[];
}

/** Map an API task into its portable export shape. */
export function taskToExport(task: Task): ExportTask {
  return {
    title: task.title,
    description: task.description,
    due_date: task.due_date,
    repeat_type: task.repeat_type,
    repeat_interval: task.repeat_interval,
    repeat_unit: task.repeat_unit,
    repeat_days: safeParseRepeatDays(task.repeat_days),
    completed: task.completed,
    tags: task.tags ?? [],
  };
}

/** Combine an API list with its tasks into the portable export shape. */
export function listToExport(list: List, tasks: Task[]): ExportList {
  return {
    name: list.name,
    color: list.color,
    emoji: list.emoji,
    tasks: tasks.map(taskToExport),
  };
}

export function buildListsFile(lists: ExportList[]): ListsFile {
  return {
    kind: FILE_KIND,
    version: LISTS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    lists,
  };
}

export function serializeLists(lists: ExportList[]): string {
  return JSON.stringify(buildListsFile(lists), null, 2);
}

/** Trigger a browser download of the lists as a JSON file. */
export function downloadLists(lists: ExportList[]): void {
  const blob = new Blob([serializeLists(lists)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `mtodo-lists-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export class ListsParseError extends Error {}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseTask(value: unknown): ExportTask {
  if (!value || typeof value !== 'object') {
    throw new ListsParseError('invalidShape');
  }
  const t = value as Record<string, unknown>;
  const title = typeof t.title === 'string' ? t.title.trim() : '';
  if (!title) throw new ListsParseError('missingTaskTitle');

  const repeatType =
    typeof t.repeat_type === 'string' && (REPEAT_TYPES as string[]).includes(t.repeat_type)
      ? (t.repeat_type as RepeatType)
      : 'none';

  const repeatDays = Array.isArray(t.repeat_days)
    ? t.repeat_days.map((d) => Number(d)).filter((n) => !Number.isNaN(n))
    : [];

  const tags = Array.isArray(t.tags)
    ? t.tags.map((x) => String(x).trim()).filter(Boolean)
    : [];

  return {
    title,
    description: asString(t.description),
    due_date: asString(t.due_date),
    repeat_type: repeatType,
    repeat_interval: typeof t.repeat_interval === 'number' ? t.repeat_interval : null,
    repeat_unit: asString(t.repeat_unit),
    repeat_days: repeatDays,
    completed: Boolean(t.completed),
    tags,
  };
}

function parseList(value: unknown): ExportList {
  if (!value || typeof value !== 'object') {
    throw new ListsParseError('invalidShape');
  }
  const l = value as Record<string, unknown>;
  const name = typeof l.name === 'string' ? l.name.trim() : '';
  if (!name) throw new ListsParseError('missingListName');

  const tasks = Array.isArray(l.tasks) ? l.tasks.map(parseTask) : [];

  return {
    name,
    color: asString(l.color),
    emoji: asString(l.emoji),
    tasks,
  };
}

/**
 * Parse and validate a lists JSON string.
 *
 * Accepts the full export envelope (`{ kind, version, lists: [...] }`) or a
 * bare array of lists. Throws a {@link ListsParseError} with a reason code so
 * the caller can show a localized message.
 */
export function parseListsFile(text: string): ExportList[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ListsParseError('invalidJson');
  }

  let rawLists: unknown;
  if (Array.isArray(data)) {
    rawLists = data;
  } else if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).lists)) {
    rawLists = (data as Record<string, unknown>).lists;
  } else {
    throw new ListsParseError('invalidShape');
  }

  return (rawLists as unknown[]).map(parseList);
}
