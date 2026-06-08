import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { config } from './config';

const dbPath = path.resolve(config.databaseFile);
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

export interface RunResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}

export interface Stmt {
  get: (...params: unknown[]) => any;
  all: (...params: unknown[]) => any[];
  run: (...params: unknown[]) => RunResult;
}

/**
 * Thin typed wrapper around node:sqlite prepared statements.
 * node:sqlite returns `Record<string, SQLOutputValue>` which does not overlap
 * with our row interfaces, so we expose `any` and let callers cast to their
 * domain types via `as RowType`.
 */
export function prepare(sql: string): Stmt {
  const stmt = db.prepare(sql);
  return {
    get: (...params: unknown[]) => stmt.get(...(params as never[])),
    all: (...params: unknown[]) => stmt.all(...(params as never[])) as any[],
    run: (...params: unknown[]) => stmt.run(...(params as never[])) as RunResult,
  };
}

export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      emoji TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      list_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      repeat_type TEXT NOT NULL DEFAULT 'none',
      repeat_interval INTEGER,
      repeat_unit TEXT,
      repeat_days TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      UNIQUE (user_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_tags (
      task_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (task_id, tag_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS list_shares (
      list_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      can_edit INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (list_id, user_id),
      FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id);
    CREATE INDEX IF NOT EXISTS idx_lists_user ON lists(user_id);
    CREATE INDEX IF NOT EXISTS idx_list_shares_user ON list_shares(user_id);
  `);

  runMigrations();
  seedAdmin();
}

function columnExists(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

// Lightweight, idempotent schema migrations for pre-existing databases that
// were created before a column was introduced.
function runMigrations(): void {
  if (!columnExists('lists', 'emoji')) {
    db.exec('ALTER TABLE lists ADD COLUMN emoji TEXT');
  }
}

function seedAdmin(): void {
  const existing = db
    .prepare('SELECT id, role FROM users WHERE email = ?')
    .get(config.admin.email) as { id: number; role: string } | undefined;

  const hash = bcrypt.hashSync(config.admin.password, 10);

  if (!existing) {
    db.prepare(
      'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)'
    ).run(config.admin.email, hash, 'admin');
    // eslint-disable-next-line no-console
    console.log(`[db] Seeded admin user: ${config.admin.email}`);
  } else if (existing.role !== 'admin') {
    // Make sure the configured admin email always has admin rights.
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', existing.id);
  }
}
