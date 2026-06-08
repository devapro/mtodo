import { Router } from 'express';
import { prepare as db_prepare } from '../db';
const db = { prepare: db_prepare };
import { authRequired } from '../auth';
import { ListRow } from '../types';

const router = Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const lists = db
    .prepare('SELECT * FROM lists WHERE user_id = ? ORDER BY created_at ASC')
    .all(req.user!.id) as ListRow[];
  res.json(lists);
});

router.post('/', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const color = req.body?.color ? String(req.body.color) : null;
  if (!name) return res.status(400).json({ error: 'List name is required' });

  const info = db
    .prepare('INSERT INTO lists (user_id, name, color) VALUES (?, ?, ?)')
    .run(req.user!.id, name, color);
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(Number(info.lastInsertRowid));
  res.status(201).json(list);
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db
    .prepare('SELECT * FROM lists WHERE id = ? AND user_id = ?')
    .get(id, req.user!.id) as ListRow | undefined;
  if (!existing) return res.status(404).json({ error: 'List not found' });

  const name = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;
  const color = req.body?.color !== undefined ? req.body.color : existing.color;
  db.prepare('UPDATE lists SET name = ?, color = ? WHERE id = ?').run(name, color, id);
  res.json(db.prepare('SELECT * FROM lists WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = db
    .prepare('DELETE FROM lists WHERE id = ? AND user_id = ?')
    .run(id, req.user!.id);
  if (Number(info.changes) === 0) return res.status(404).json({ error: 'List not found' });
  res.status(204).end();
});

export default router;
