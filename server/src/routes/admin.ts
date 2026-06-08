import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prepare as db_prepare } from '../db';
const db = { prepare: db_prepare };
import { authRequired, adminRequired } from '../auth';
import { PublicUser, Role } from '../types';
import {
  validateBody,
  validateParams,
  idParamSchema,
  createUserSchema,
  resetPasswordSchema,
} from '../validate';

const router = Router();
router.use(authRequired, adminRequired);

// GET /admin/users - list all users with task counts
router.get('/users', (_req, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.email, u.role, u.created_at,
              u.telegram_id, u.telegram_username,
              (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id) AS task_count
       FROM users u
       ORDER BY u.created_at ASC`
    )
    .all() as (PublicUser & { task_count: number })[];
  res.json(users);
});

// POST /admin/users - create a new user
router.post('/users', validateBody(createUserSchema), (req, res) => {
  const email = String(req.body.email);
  const password = String(req.body.password);
  const role: Role = req.body.role === 'admin' ? 'admin' : 'user';

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)')
    .run(email, hash, role);

  const user = db
    .prepare(
      `SELECT u.id, u.email, u.role, u.created_at,
              u.telegram_id, u.telegram_username,
              (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id) AS task_count
       FROM users u WHERE u.id = ?`
    )
    .get(Number(info.lastInsertRowid)) as PublicUser & { task_count: number };

  res.status(201).json(user);
});

// PATCH /admin/users/:id/password - reset a user's password
router.patch(
  '/users/:id/password',
  validateParams(idParamSchema),
  validateBody(resetPasswordSchema),
  (req, res) => {
  const id = Number(req.params.id);
  const password = String(req.body.password);

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id) as
    | { id: number }
    | undefined;
  if (!user) return res.status(404).json({ error: 'User not found' });

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
  res.status(204).end();
});

// DELETE /admin/users/:id - remove a user (cannot remove yourself)
router.delete('/users/:id', validateParams(idParamSchema), (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (Number(info.changes) === 0) return res.status(404).json({ error: 'User not found' });
  res.status(204).end();
});

export default router;
