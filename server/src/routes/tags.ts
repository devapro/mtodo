import { Router } from 'express';
import { prepare as db_prepare } from '../db';
const db = { prepare: db_prepare };
import { authRequired } from '../auth';
import { TagRow } from '../types';
import { validateBody, validateParams, idParamSchema, createTagSchema } from '../validate';

const router = Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const tags = db
    .prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name COLLATE NOCASE ASC')
    .all(req.user!.id) as TagRow[];
  res.json(tags);
});

router.post('/', validateBody(createTagSchema), (req, res) => {
  const name = String(req.body.name).trim();

  const existing = db
    .prepare('SELECT * FROM tags WHERE user_id = ? AND name = ? COLLATE NOCASE')
    .get(req.user!.id, name) as TagRow | undefined;
  if (existing) return res.status(200).json(existing);

  const info = db
    .prepare('INSERT INTO tags (user_id, name) VALUES (?, ?)')
    .run(req.user!.id, name);
  res.status(201).json(
    db.prepare('SELECT * FROM tags WHERE id = ?').get(Number(info.lastInsertRowid))
  );
});

router.delete('/:id', validateParams(idParamSchema), (req, res) => {
  const id = Number(req.params.id);
  const info = db
    .prepare('DELETE FROM tags WHERE id = ? AND user_id = ?')
    .run(id, req.user!.id);
  if (Number(info.changes) === 0) return res.status(404).json({ error: 'Tag not found' });
  res.status(204).end();
});

export default router;
