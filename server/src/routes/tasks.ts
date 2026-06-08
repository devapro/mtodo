import { Router } from 'express';
import { prepare as db_prepare } from '../db';
const db = { prepare: db_prepare };
import { authRequired } from '../auth';
import { accessibleListIds, canEditList, getListAccess } from '../access';
import { TaskRow, TagRow, RepeatType } from '../types';
import {
  validateBody,
  validateParams,
  idParamSchema,
  createTaskSchema,
  updateTaskSchema,
} from '../validate';

const router = Router();
router.use(authRequired);

const REPEAT_TYPES: RepeatType[] = ['none', 'daily', 'weekly', 'monthly', 'custom'];

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

interface TaskDTO extends Omit<TaskRow, 'completed'> {
  completed: boolean;
  tags: string[];
}

function getTags(taskId: number): string[] {
  const rows = db
    .prepare(
      `SELECT t.name FROM tags t
       JOIN task_tags tt ON tt.tag_id = t.id
       WHERE tt.task_id = ?
       ORDER BY t.name COLLATE NOCASE ASC`
    )
    .all(taskId) as { name: string }[];
  return rows.map((r) => r.name);
}

function serialize(row: TaskRow): TaskDTO {
  return {
    ...row,
    completed: !!row.completed,
    repeat_days: row.repeat_days,
    tags: getTags(row.id),
  };
}

/** Resolve a list of tag names to tag ids for a user, creating missing tags. */
function resolveTagIds(userId: number, names: string[]): number[] {
  const ids: number[] = [];
  const findStmt = db.prepare(
    'SELECT * FROM tags WHERE user_id = ? AND name = ? COLLATE NOCASE'
  );
  const insertStmt = db.prepare('INSERT INTO tags (user_id, name) VALUES (?, ?)');
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
  db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(taskId);
  const link = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)');
  for (const id of ids) link.run(taskId, id);
}

function parseRepeatDays(value: unknown): number[] | null {
  if (Array.isArray(value)) return value.map((v) => Number(v)).filter((n) => !Number.isNaN(n));
  return null;
}

/** Can the user see this task? (their own, or in a list they can access) */
function canViewTask(userId: number, task: TaskRow): boolean {
  if (task.user_id === userId) return true;
  if (task.list_id != null && getListAccess(userId, task.list_id) !== null) return true;
  return false;
}

/** Can the user modify this task? (their own, or in a list they can edit) */
function canModifyTask(userId: number, task: TaskRow): boolean {
  if (task.user_id === userId) return true;
  if (task.list_id != null && canEditList(userId, task.list_id)) return true;
  return false;
}

/** Does a recurring/dated task occur on the given YYYY-MM-DD date? */
function occursOnDate(row: TaskRow, dateStr: string): boolean {
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
          (date.getFullYear() - start.getFullYear()) * 12 +
          (date.getMonth() - start.getMonth());
        return monthDiff % interval === 0 && date.getDate() === start.getDate();
      }
      return false;
    }
    default:
      return false;
  }
}

// GET /tasks?listId=&date=&today=true
router.get('/', (req, res) => {
  const userId = req.user!.id;
  const { listId, date, today } = req.query;

  // The user can see their own tasks plus any task in a list shared with them.
  const accessible = accessibleListIds(userId);
  let rows: TaskRow[];
  if (accessible.length) {
    const placeholders = accessible.map(() => '?').join(',');
    rows = db
      .prepare(
        `SELECT * FROM tasks
         WHERE user_id = ? OR list_id IN (${placeholders})
         ORDER BY created_at DESC`
      )
      .all(userId, ...accessible) as TaskRow[];
  } else {
    rows = db
      .prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as TaskRow[];
  }

  if (listId !== undefined && listId !== '') {
    rows = rows.filter((r) => r.list_id === Number(listId));
  }

  if (today === 'true' || date) {
    const target =
      typeof date === 'string' && date ? date : new Date().toISOString().slice(0, 10);
    rows = rows.filter((r) => occursOnDate(r, target));
  }

  res.json(rows.map(serialize));
});

router.get('/:id', validateParams(idParamSchema), (req, res) => {
  const row = db
    .prepare('SELECT * FROM tasks WHERE id = ?')
    .get(Number(req.params.id)) as TaskRow | undefined;
  if (!row || !canViewTask(req.user!.id, row)) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json(serialize(row));
});

router.post('/', validateBody(createTaskSchema), (req, res) => {
  const userId = req.user!.id;
  const b = req.body;
  const title = String(b.title).trim();

  // If the task targets a list, the user must be allowed to edit that list.
  if (b.list_id) {
    const access = getListAccess(userId, Number(b.list_id));
    if (access === null) return res.status(404).json({ error: 'List not found' });
    if (access === 'viewer') {
      return res.status(403).json({ error: 'This list is read-only' });
    }
  }

  const repeatType: RepeatType = REPEAT_TYPES.includes(b.repeat_type)
    ? b.repeat_type
    : 'none';
  const repeatDays = parseRepeatDays(b.repeat_days);

  const info = db
    .prepare(
      `INSERT INTO tasks
        (user_id, list_id, title, description, due_date, repeat_type, repeat_interval, repeat_unit, repeat_days, completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    )
    .run(
      userId,
      b.list_id ? Number(b.list_id) : null,
      title,
      b.description ? String(b.description) : null,
      b.due_date ? String(b.due_date) : null,
      repeatType,
      b.repeat_interval ? Number(b.repeat_interval) : null,
      b.repeat_unit ? String(b.repeat_unit) : null,
      repeatDays ? JSON.stringify(repeatDays) : null
    );

  const taskId = Number(info.lastInsertRowid);
  if (Array.isArray(b.tags)) setTaskTags(userId, taskId, b.tags);

  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow;
  res.status(201).json(serialize(row));
});

router.put('/:id', validateParams(idParamSchema), validateBody(updateTaskSchema), (req, res) => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
    | TaskRow
    | undefined;
  if (!existing || !canViewTask(userId, existing)) {
    return res.status(404).json({ error: 'Task not found' });
  }
  if (!canModifyTask(userId, existing)) {
    return res.status(403).json({ error: 'You do not have permission to edit this task' });
  }

  const b = req.body;
  const title = b.title !== undefined ? String(b.title).trim() : existing.title;

  // If moving the task to a different list, ensure the user can edit that list.
  if (b.list_id !== undefined && b.list_id) {
    const access = getListAccess(userId, Number(b.list_id));
    if (access === null) return res.status(404).json({ error: 'List not found' });
    if (access === 'viewer') return res.status(403).json({ error: 'This list is read-only' });
  }

  const repeatType: RepeatType =
    b.repeat_type !== undefined && REPEAT_TYPES.includes(b.repeat_type)
      ? b.repeat_type
      : existing.repeat_type;
  const repeatDays =
    b.repeat_days !== undefined ? parseRepeatDays(b.repeat_days) : null;

  db.prepare(
    `UPDATE tasks SET
       list_id = ?, title = ?, description = ?, due_date = ?,
       repeat_type = ?, repeat_interval = ?, repeat_unit = ?, repeat_days = ?,
       completed = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    b.list_id !== undefined ? (b.list_id ? Number(b.list_id) : null) : existing.list_id,
    title,
    b.description !== undefined ? (b.description ? String(b.description) : null) : existing.description,
    b.due_date !== undefined ? (b.due_date ? String(b.due_date) : null) : existing.due_date,
    repeatType,
    b.repeat_interval !== undefined ? (b.repeat_interval ? Number(b.repeat_interval) : null) : existing.repeat_interval,
    b.repeat_unit !== undefined ? (b.repeat_unit ? String(b.repeat_unit) : null) : existing.repeat_unit,
    b.repeat_days !== undefined ? (repeatDays ? JSON.stringify(repeatDays) : null) : existing.repeat_days,
    b.completed !== undefined ? (b.completed ? 1 : 0) : existing.completed,
    id
  );

  if (Array.isArray(b.tags)) setTaskTags(userId, id, b.tags);

  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow;
  res.json(serialize(row));
});

router.patch('/:id/toggle', validateParams(idParamSchema), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
    | TaskRow
    | undefined;
  if (!existing || !canViewTask(req.user!.id, existing)) {
    return res.status(404).json({ error: 'Task not found' });
  }
  if (!canModifyTask(req.user!.id, existing)) {
    return res.status(403).json({ error: 'You do not have permission to edit this task' });
  }
  db.prepare("UPDATE tasks SET completed = ?, updated_at = datetime('now') WHERE id = ?").run(
    existing.completed ? 0 : 1,
    id
  );
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow;
  res.json(serialize(row));
});

router.delete('/:id', validateParams(idParamSchema), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
    | TaskRow
    | undefined;
  if (!existing || !canViewTask(req.user!.id, existing)) {
    return res.status(404).json({ error: 'Task not found' });
  }
  if (!canModifyTask(req.user!.id, existing)) {
    return res.status(403).json({ error: 'You do not have permission to delete this task' });
  }
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  res.status(204).end();
});

export default router;
