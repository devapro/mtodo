import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prepare as db_prepare } from '../db';
const db = { prepare: db_prepare };
import { signToken, authRequired } from '../auth';
import { config, isTelegramEnabled } from '../config';
import { UserRow, PublicUser, TelegramLoginData } from '../types';
import { verifyTelegramLogin } from '../telegram/verify';
import { validateBody, signupSchema, signinSchema } from '../validate';
import {
  createLinkCode,
  findOrCreateUserByTelegramLogin,
  findUserById,
  unlinkTelegram,
} from '../telegram/service';

const router = Router();

function toPublic(u: UserRow): PublicUser {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    created_at: u.created_at,
    telegram_id: u.telegram_id ?? null,
    telegram_username: u.telegram_username ?? null,
  };
}

router.post('/signup', validateBody(signupSchema), (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

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

router.post('/signin', validateBody(signinSchema), (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

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

// ----- Telegram integration -----

// Public: whether the Telegram login/link feature is available, plus the bot
// username the client needs to render the login widget & build deep links.
router.get('/telegram/config', (_req, res) => {
  res.json({
    enabled: isTelegramEnabled(),
    botUsername: config.telegram.botUsername || null,
  });
});

// Public: sign in with the Telegram Login Widget payload.
router.post('/telegram', (req, res) => {
  if (!isTelegramEnabled()) {
    return res.status(503).json({ error: 'Telegram login is not configured' });
  }
  const data = req.body as TelegramLoginData;
  if (!data || !data.id || !data.hash) {
    return res.status(400).json({ error: 'Invalid Telegram payload' });
  }
  if (!verifyTelegramLogin(data)) {
    return res.status(401).json({ error: 'Telegram authorization could not be verified' });
  }

  const user = findOrCreateUserByTelegramLogin(data);
  const token = signToken({ id: user.id, email: user.email, role: user.role });
  return res.json({ token, user: toPublic(user) });
});

// Generate a one-time code to link Telegram via the bot (`/start <code>`).
router.post('/telegram/link-code', authRequired, (req, res) => {
  if (!isTelegramEnabled()) {
    return res.status(503).json({ error: 'Telegram integration is not configured' });
  }
  const user = findUserById(req.user!.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.telegram_id) {
    return res.status(409).json({ error: 'Telegram is already linked' });
  }
  const code = createLinkCode(user.id);
  res.json({ code, botUsername: config.telegram.botUsername });
});

// Disconnect the linked Telegram account.
router.post('/telegram/unlink', authRequired, (req, res) => {
  unlinkTelegram(req.user!.id);
  const user = findUserById(req.user!.id);
  res.json({ user: user ? toPublic(user) : null });
});

export default router;
