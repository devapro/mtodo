import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prepare } from '../db';
import { canEditList, getListAccess } from '../access';
import { ListRow, TaskRow, TelegramLoginData, UserRow } from '../types';
import { generateLinkCode } from './verify';

const LINK_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function findUserById(id: number): UserRow | undefined {
  return prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function findUserByTelegramId(telegramId: string): UserRow | undefined {
  return prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as
    | UserRow
    | undefined;
}

/**
 * Create (or refresh) a one-time link code for an account. The user later
 * sends this code to the bot via `/start <code>` to connect their Telegram.
 */
export function createLinkCode(userId: number): string {
  const code = generateLinkCode();
  const expires = new Date(Date.now() + LINK_CODE_TTL_MS).toISOString();
  prepare(
    'UPDATE users SET telegram_link_code = ?, telegram_link_expires = ? WHERE id = ?'
  ).run(code, expires, userId);
  return code;
}

export interface LinkResult {
  ok: boolean;
  reason?: 'invalid' | 'expired' | 'already_linked';
  user?: UserRow;
}

/** Link a Telegram account to the app account identified by a one-time code. */
export function linkByCode(
  code: string,
  telegramId: string,
  username: string | null,
  firstName: string | null
): LinkResult {
  const normalized = String(code).trim().toUpperCase();
  if (!normalized) return { ok: false, reason: 'invalid' };

  // Reject if this Telegram account is already attached to another user.
  const existing = findUserByTelegramId(telegramId);
  if (existing) {
    if (existing.telegram_link_code === normalized) {
      // Idempotent: same code already consumed by the same account.
      return { ok: true, user: existing };
    }
    return { ok: false, reason: 'already_linked', user: existing };
  }

  const user = prepare('SELECT * FROM users WHERE telegram_link_code = ?').get(
    normalized
  ) as UserRow | undefined;
  if (!user) return { ok: false, reason: 'invalid' };

  if (user.telegram_link_expires && new Date(user.telegram_link_expires) < new Date()) {
    return { ok: false, reason: 'expired' };
  }

  prepare(
    `UPDATE users
       SET telegram_id = ?, telegram_username = ?, telegram_first_name = ?,
           telegram_link_code = NULL, telegram_link_expires = NULL
     WHERE id = ?`
  ).run(telegramId, username, firstName, user.id);

  return { ok: true, user: findUserById(user.id) };
}

export function unlinkTelegram(userId: number): void {
  prepare(
    `UPDATE users
       SET telegram_id = NULL, telegram_username = NULL, telegram_first_name = NULL,
           telegram_link_code = NULL, telegram_link_expires = NULL
     WHERE id = ?`
  ).run(userId);
}

/**
 * Resolve a user for a Telegram Login Widget sign-in. If no account is linked
 * to the Telegram id yet, a fresh account is provisioned on the fly.
 */
export function findOrCreateUserByTelegramLogin(data: TelegramLoginData): UserRow {
  const telegramId = String(data.id);
  const username = data.username ? String(data.username) : null;
  const firstName = data.first_name ? String(data.first_name) : null;

  const existing = findUserByTelegramId(telegramId);
  if (existing) {
    // Keep the cached profile fields fresh on every login.
    prepare(
      'UPDATE users SET telegram_username = ?, telegram_first_name = ? WHERE id = ?'
    ).run(username, firstName, existing.id);
    return findUserById(existing.id)!;
  }

  const email = `tg${telegramId}@telegram.local`;

  // A previously auto-provisioned account may still exist (e.g. after an
  // unlink). Reuse it instead of hitting the unique-email constraint.
  const byEmail = prepare('SELECT * FROM users WHERE email = ?').get(email) as
    | UserRow
    | undefined;
  if (byEmail) {
    prepare(
      'UPDATE users SET telegram_id = ?, telegram_username = ?, telegram_first_name = ? WHERE id = ?'
    ).run(telegramId, username, firstName, byEmail.id);
    return findUserById(byEmail.id)!;
  }

  const randomPassword = crypto.randomBytes(24).toString('hex');
  const hash = bcrypt.hashSync(randomPassword, 10);

  const info = prepare(
    `INSERT INTO users (email, password_hash, role, telegram_id, telegram_username, telegram_first_name)
     VALUES (?, ?, 'user', ?, ?, ?)`
  ).run(email, hash, telegramId, username, firstName);

  return findUserById(Number(info.lastInsertRowid))!;
}

// ----- Bot data access (todo lists & tasks) -----

export interface BotList {
  id: number;
  name: string;
  emoji: string | null;
  open_count: number;
}

/** Lists the user owns or has been given access to, with open-task counts. */
export function getListsForUser(userId: number): BotList[] {
  const owned = prepare('SELECT * FROM lists WHERE user_id = ?').all(userId) as ListRow[];
  const shared = prepare(
    `SELECT l.* FROM lists l
     JOIN list_shares s ON s.list_id = l.id
     WHERE s.user_id = ?`
  ).all(userId) as ListRow[];

  const all = [...owned, ...shared];
  return all.map((l) => {
    const c = prepare(
      'SELECT COUNT(*) AS c FROM tasks WHERE list_id = ? AND completed = 0'
    ).get(l.id) as { c: number };
    return { id: l.id, name: l.name, emoji: l.emoji, open_count: Number(c.c) };
  });
}

export function getListForUser(userId: number, listId: number): ListRow | null {
  if (getListAccess(userId, listId) === null) return null;
  return (prepare('SELECT * FROM lists WHERE id = ?').get(listId) as ListRow) || null;
}

export function getTasksForList(userId: number, listId: number): TaskRow[] | null {
  if (getListAccess(userId, listId) === null) return null;
  return prepare(
    'SELECT * FROM tasks WHERE list_id = ? ORDER BY completed ASC, created_at DESC'
  ).all(listId) as TaskRow[];
}

export function getTaskForUser(userId: number, taskId: number): TaskRow | null {
  const task = prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as
    | TaskRow
    | undefined;
  if (!task) return null;
  if (task.user_id === userId) return task;
  if (task.list_id != null && getListAccess(userId, task.list_id) !== null) return task;
  return null;
}

export function addTaskToList(
  userId: number,
  listId: number,
  title: string
): TaskRow | { error: string } {
  const access = getListAccess(userId, listId);
  if (access === null) return { error: 'List not found' };
  if (access === 'viewer') return { error: 'This list is read-only' };

  const info = prepare(
    `INSERT INTO tasks (user_id, list_id, title, repeat_type, completed)
     VALUES (?, ?, ?, 'none', 0)`
  ).run(userId, listId, title);
  return prepare('SELECT * FROM tasks WHERE id = ?').get(
    Number(info.lastInsertRowid)
  ) as TaskRow;
}

export function toggleTaskForUser(userId: number, taskId: number): TaskRow | null {
  const task = getTaskForUser(userId, taskId);
  if (!task) return null;
  const canEdit =
    task.user_id === userId ||
    (task.list_id != null && canEditList(userId, task.list_id));
  if (!canEdit) return null;

  prepare(
    "UPDATE tasks SET completed = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(task.completed ? 0 : 1, taskId);
  return prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow;
}
