import { Router } from 'express';
import { prepare as db_prepare } from '../db';
const db = { prepare: db_prepare };
import { authRequired, adminRequired } from '../auth';
import { PublicUser } from '../types';

const router = Router();
router.use(authRequired, adminRequired);

// GET /admin/users - list all users with task counts
router.get('/users', (_req, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.email, u.role, u.created_at,
              (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id) AS task_count
       FROM users u
       ORDER BY u.created_at ASC`
    )
    .all() as (PublicUser & { task_count: number })[];
  res.json(users);
});

// DELETE /admin/users/:id - remove a user (cannot remove yourself)
router.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (Number(info.changes) === 0) return res.status(404).json({ error: 'User not found' });
  res.status(204).end();
});

export default router;
