import { prepare } from '../db';
import { accessibleListIds, canEditList, getListAccess } from '../access';
import { publish, taskAudience } from '../events';
import { forbidden, notFound } from '../errors';
import { RepeatType, TagRow, TaskRow } from '../types';
import { Actor } from './context';

/**
 * Task operations shared by the REST API and the MCP server. Every mutation
 * enforces list permissions and publishes a realtime event.
 */

const REPEAT_TYPES: RepeatType[] = ['none', 'daily', 'weekly', 'monthly', 'custom'];

export interface TaskDTO extends Omit<TaskRow, 'completed'> {
  completed: boolean;
  tags: string[];
}

/** Validated task fields (see createTaskSchema / updateTaskSchema). */
export interface TaskFields {
  title?: string;
  description?: string | null;
  list_id?: number | null;
  due_date?: string | null;
  repeat_type?: RepeatType;
  repeat_interval?: number | null;
  repeat_unit?: string | null;
  repeat_days?: number[] | null;
  tags?: string[];
  completed?: boolean;
}

export interface TaskQuery {
  listId?: number;
  /** YYYY-MM-DD; only tasks occurring on that date (recurrence-aware). */
  date?: string;
  includeCompleted?: boolean;
  /** Case-insensitive substring match on title/description/tags. */
  search?: string;
}

/**
 * Parse the persisted `repeat_days` JSON safely. A malformed value (e.g. from a
 * manual DB edit or an older bug) must never crash a request, so we swallow
 * parse errors and fall back to `null`.
 */
function safeParseRepeatDays(value: string | null): number[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const nums = parsed.map((v) => Number(v)).filter((n) => !Number.isNaN(n));
    return nums.length ? nums : null;
  } catch {
    return null;
  }
}

function getTags(taskId: number): string[] {
  const rows = prepare(
    `SELECT t.name FROM tags t
     JOIN task_tags tt ON tt.tag_id = t.id
     WHERE tt.task_id = ?
     ORDER BY t.name COLLATE NOCASE ASC`
  ).all(taskId) as { name: string }[];
  return rows.map((r) => r.name);
}

export function serializeTask(row: TaskRow): TaskDTO {
  return { ...row, completed: !!row.completed, tags: getTags(row.id) };
}

/** Resolve a list of tag names to tag ids for a user, creating missing tags. */
function resolveTagIds(userId: number, names: string[]): number[] {
  const ids: number[] = [];
  const findStmt = prepare('SELECT * FROM tags WHERE user_id = ? AND name = ? COLLATE NOCASE');
  const insertStmt = prepare('INSERT INTO tags (user_id, name) VALUES (?, ?)');
  for (const raw of names) {
    const name = String(raw).trim();
    if (!name) continue;
    const existing = findStmt.get(userId, name) as TagRow | undefined;
    if (existing) {
      ids.push(existing.id);
    } else {
      const info = insertStmt.run(userId, name);
      ids.push(Number(info.lastInsertRowid));
    }
  }
  return ids;
}

function setTaskTags(userId: number, taskId: number, names: string[]): void {
  const ids = resolveTagIds(userId, names);
  prepare('DELETE FROM task_tags WHERE task_id = ?').run(taskId);
  const link = prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)');
  for (const id of ids) link.run(taskId, id);
}

/** Can the user see this task? (their own, or in a list they can access) */
function canViewTask(userId: number, task: TaskRow): boolean {
  if (task.user_id === userId) return true;
  return task.list_id != null && getListAccess(userId, task.list_id) !== null;
}

/** Can the user modify this task? (their own, or in a list they can edit) */
function canModifyTask(userId: number, task: TaskRow): boolean {
  if (task.user_id === userId) return true;
  return task.list_id != null && canEditList(userId, task.list_id);
}

function assertCanWriteToList(userId: number, listId: number): void {
  const access = getListAccess(userId, listId);
  if (access === null) throw notFound('List');
  if (access === 'viewer') throw forbidden('This list is read-only');
}

function loadTask(id: number): TaskRow | undefined {
  return prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
}

/** Load a task the actor can see, or throw 404. */
function loadVisibleTask(actor: Actor, id: number): TaskRow {
  const row = loadTask(id);
  if (!row || !canViewTask(actor.userId, row)) throw notFound('Task');
  return row;
}

/** Load a task the actor can modify, or throw 404/403. */
function loadModifiableTask(actor: Actor, id: number, verb: string): TaskRow {
  const row = loadVisibleTask(actor, id);
  if (!canModifyTask(actor.userId, row)) {
    throw forbidden(`You do not have permission to ${verb} this task`);
  }
  return row;
}

/** Does a recurring/dated task occur on the given YYYY-MM-DD date? */
export function occursOnDate(row: TaskRow, dateStr: string): boolean {
  const date = new Date(dateStr + 'T00:00:00');
  if (row.repeat_type === 'none') {
    return row.due_date === dateStr;
  }

  // Recurrence starts from due_date if present, otherwise creation date.
  const startStr = (row.due_date || row.created_at || '').slice(0, 10);
  const start = startStr ? new Date(startStr + 'T00:00:00') : null;
  if (start && date < start) return false;

  const days = safeParseRepeatDays(row.repeat_days);

  switch (row.repeat_type) {
    case 'daily':
      return true;
    case 'weekly': {
      if (days && days.length) return days.includes(date.getDay());
      return start ? date.getDay() === start.getDay() : true;
    }
    case 'monthly': {
      if (days && days.length) return days.includes(date.getDate());
      return start ? date.getDate() === start.getDate() : true;
    }
    case 'custom': {
      const interval = row.repeat_interval && row.repeat_interval > 0 ? row.repeat_interval : 1;
      const unit = row.repeat_unit || 'day';
      if (!start) return false;
      const msPerDay = 86400000;
      const diffDays = Math.round((date.getTime() - start.getTime()) / msPerDay);
      if (unit === 'day') return diffDays % interval === 0;
      if (unit === 'week') return diffDays % (interval * 7) === 0;
      if (unit === 'month') {
        const monthDiff =
          (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth());
        return monthDiff % interval === 0 && date.getDate() === start.getDate();
      }
      return false;
    }
    default:
      return false;
  }
}

function notify(actor: Actor, audience: number[], withTags = false): void {
  publish(audience, { type: 'tasks', source: actor.source });
  // Tags are per user and auto-created by name on the actor's account.
  if (withTags) publish([actor.userId], { type: 'tags', source: actor.source });
}

// ----- Queries -----

export function listTasks(actor: Actor, query: TaskQuery = {}): TaskDTO[] {
  const { userId } = actor;
  // The user can see their own tasks plus any task in a list shared with them.
  const accessible = accessibleListIds(userId);
  let rows: TaskRow[];
  if (accessible.length) {
    const placeholders = accessible.map(() => '?').join(',');
    rows = prepare(
      `SELECT * FROM tasks
       WHERE user_id = ? OR list_id IN (${placeholders})
       ORDER BY created_at DESC`
    ).all(userId, ...accessible) as TaskRow[];
  } else {
    rows = prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC').all(
      userId
    ) as TaskRow[];
  }

  if (query.listId !== undefined) rows = rows.filter((r) => r.list_id === query.listId);
  if (query.date) rows = rows.filter((r) => occursOnDate(r, query.date!));
  if (query.includeCompleted === false) rows = rows.filter((r) => !r.completed);

  let tasks = rows.map(serializeTask);
  const q = query.search?.trim().toLowerCase();
  if (q) {
    tasks = tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }
  return tasks;
}

export function getTask(actor: Actor, id: number): TaskDTO {
  return serializeTask(loadVisibleTask(actor, id));
}

// ----- Mutations -----

export function createTask(actor: Actor, b: TaskFields & { title: string }): TaskDTO {
  const { userId } = actor;
  if (b.list_id) assertCanWriteToList(userId, b.list_id);

  const repeatType: RepeatType =
    b.repeat_type && REPEAT_TYPES.includes(b.repeat_type) ? b.repeat_type : 'none';
  const repeatDays = Array.isArray(b.repeat_days) ? b.repeat_days : null;

  const info = prepare(
    `INSERT INTO tasks
      (user_id, list_id, title, description, due_date, repeat_type, repeat_interval, repeat_unit, repeat_days, completed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
    b.list_id || null,
    b.title.trim(),
    b.description || null,
    b.due_date || null,
    repeatType,
    b.repeat_interval || null,
    b.repeat_unit || null,
    repeatDays ? JSON.stringify(repeatDays) : null,
    b.completed ? 1 : 0
  );

  const taskId = Number(info.lastInsertRowid);
  if (Array.isArray(b.tags)) setTaskTags(userId, taskId, b.tags);

  const row = loadTask(taskId)!;
  notify(actor, taskAudience(row), Array.isArray(b.tags) && b.tags.length > 0);
  return serializeTask(row);
}

export function updateTask(actor: Actor, id: number, b: TaskFields): TaskDTO {
  const { userId } = actor;
  const existing = loadModifiableTask(actor, id, 'edit');

  // If moving the task to a different list, ensure the user can edit that list.
  if (b.list_id) assertCanWriteToList(userId, b.list_id);

  const before = taskAudience(existing);
  const pick = <K extends keyof TaskFields, V>(key: K, fallback: V, map: (v: TaskFields[K]) => V) =>
    b[key] !== undefined ? map(b[key]) : fallback;

  prepare(
    `UPDATE tasks SET
       list_id = ?, title = ?, description = ?, due_date = ?,
       repeat_type = ?, repeat_interval = ?, repeat_unit = ?, repeat_days = ?,
       completed = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    pick('list_id', existing.list_id, (v) => v || null),
    pick('title', existing.title, (v) => String(v).trim()),
    pick('description', existing.description, (v) => v || null),
    pick('due_date', existing.due_date, (v) => v || null),
    pick('repeat_type', existing.repeat_type, (v) =>
      v && REPEAT_TYPES.includes(v) ? v : existing.repeat_type
    ),
    pick('repeat_interval', existing.repeat_interval, (v) => v || null),
    pick('repeat_unit', existing.repeat_unit, (v) => v || null),
    pick('repeat_days', existing.repeat_days, (v) =>
      Array.isArray(v) && v.length ? JSON.stringify(v) : null
    ),
    pick('completed', existing.completed, (v) => (v ? 1 : 0)),
    id
  );

  if (Array.isArray(b.tags)) setTaskTags(userId, id, b.tags);

  const row = loadTask(id)!;
  notify(actor, [...before, ...taskAudience(row)], Array.isArray(b.tags) && b.tags.length > 0);
  return serializeTask(row);
}

export function toggleTask(actor: Actor, id: number): TaskDTO {
  const existing = loadModifiableTask(actor, id, 'edit');
  prepare("UPDATE tasks SET completed = ?, updated_at = datetime('now') WHERE id = ?").run(
    existing.completed ? 0 : 1,
    id
  );
  const row = loadTask(id)!;
  notify(actor, taskAudience(row));
  return serializeTask(row);
}

export function deleteTask(actor: Actor, id: number): void {
  const existing = loadModifiableTask(actor, id, 'delete');
  const audience = taskAudience(existing);
  prepare('DELETE FROM tasks WHERE id = ?').run(id);
  notify(actor, audience);
}
