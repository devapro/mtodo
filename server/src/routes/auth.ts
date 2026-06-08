import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prepare as db_prepare } from '../db';
const db = { prepare: db_prepare };
import { signToken, authRequired } from '../auth';
import { UserRow, PublicUser } from '../types';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toPublic(u: UserRow): PublicUser {
  return { id: u.id, email: u.email, role: u.role, created_at: u.created_at };
}

router.post('/signup', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)')
    .run(email, hash, 'user');

  const user = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as UserRow;

  const token = signToken({ id: user.id, email: user.email, role: user.role });
  return res.status(201).json({ token, user: toPublic(user) });
});

router.post('/signin', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
    | UserRow
    | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role });
  return res.json({ token, user: toPublic(user) });
});

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as
    | UserRow
    | undefined;
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ user: toPublic(user) });
});

export default router;
