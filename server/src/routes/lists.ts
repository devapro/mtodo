import { Router } from 'express';
import { prepare as db_prepare } from '../db';
const db = { prepare: db_prepare };
import { authRequired } from '../auth';
import { getListAccess } from '../access';
import { ListRow, ListDTO, ListShareDTO, UserRow } from '../types';
import {
  validateBody,
  validateParams,
  idParamSchema,
  createListSchema,
  updateListSchema,
  shareListSchema,
} from '../validate';

const router = Router();
router.use(authRequired);

// Keep emoji values small and tidy. Empty string clears the emoji.
function normalizeEmoji(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  return [...s].slice(0, 16).join('');
}

function toDTO(list: ListRow, viewerId: number): ListDTO {
  const owner = db
    .prepare('SELECT email FROM users WHERE id = ?')
    .get(list.user_id) as { email: string } | undefined;
  const isOwner = list.user_id === viewerId;

  let role: ListDTO['role'] = 'owner';
  let canEdit = true;
  if (!isOwner) {
    const share = db
      .prepare('SELECT can_edit FROM list_shares WHERE list_id = ? AND user_id = ?')
      .get(list.id, viewerId) as { can_edit: number } | undefined;
    canEdit = !!share?.can_edit;
    role = canEdit ? 'editor' : 'viewer';
  }

  const sharedCount = db
    .prepare('SELECT COUNT(*) AS c FROM list_shares WHERE list_id = ?')
    .get(list.id) as { c: number };

  return {
    id: list.id,
    user_id: list.user_id,
    name: list.name,
    color: list.color,
    emoji: list.emoji,
    created_at: list.created_at,
    owner_id: list.user_id,
    owner_email: owner?.email || '',
    role,
    can_edit: canEdit,
    shared_count: Number(sharedCount.c),
  };
}

// GET /lists - owned lists + lists shared with the current user
router.get('/', (req, res) => {
  const userId = req.user!.id;
  const owned = db
    .prepare('SELECT * FROM lists WHERE user_id = ?')
    .all(userId) as ListRow[];
  const shared = db
    .prepare(
      `SELECT l.* FROM lists l
       JOIN list_shares s ON s.list_id = l.id
       WHERE s.user_id = ?`
    )
    .all(userId) as ListRow[];

  const all = [...owned, ...shared].sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
  );
  res.json(all.map((l) => toDTO(l, userId)));
});

router.post('/', validateBody(createListSchema), (req, res) => {
  const name = String(req.body.name).trim();
  const color = req.body.color ? String(req.body.color) : null;
  const emoji = normalizeEmoji(req.body.emoji);

  const info = db
    .prepare('INSERT INTO lists (user_id, name, color, emoji) VALUES (?, ?, ?, ?)')
    .run(req.user!.id, name, color, emoji);
  const list = db
    .prepare('SELECT * FROM lists WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as ListRow;
  res.status(201).json(toDTO(list, req.user!.id));
});

router.put('/:id', validateParams(idParamSchema), validateBody(updateListSchema), (req, res) => {
  const id = Number(req.params.id);
  // Only the owner can rename / recolor the list.
  const existing = db
    .prepare('SELECT * FROM lists WHERE id = ? AND user_id = ?')
    .get(id, req.user!.id) as ListRow | undefined;
  if (!existing) return res.status(404).json({ error: 'List not found' });

  const name = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;
  const color = req.body?.color !== undefined ? req.body.color : existing.color;
  const emoji =
    req.body?.emoji !== undefined ? normalizeEmoji(req.body.emoji) : existing.emoji;
  db.prepare('UPDATE lists SET name = ?, color = ?, emoji = ? WHERE id = ?').run(
    name,
    color,
    emoji,
    id
  );
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(id) as ListRow;
  res.json(toDTO(list, req.user!.id));
});

router.delete('/:id', validateParams(idParamSchema), (req, res) => {
  const id = Number(req.params.id);
  const info = db
    .prepare('DELETE FROM lists WHERE id = ? AND user_id = ?')
    .run(id, req.user!.id);
  if (Number(info.changes) === 0) return res.status(404).json({ error: 'List not found' });
  res.status(204).end();
});

// ----- Sharing -----

function shareDTOs(listId: number): ListShareDTO[] {
  const rows = db
    .prepare(
      `SELECT s.user_id, s.can_edit, u.email
       FROM list_shares s JOIN users u ON u.id = s.user_id
       WHERE s.list_id = ?
       ORDER BY u.email COLLATE NOCASE ASC`
    )
    .all(listId) as { user_id: number; can_edit: number; email: string }[];
  return rows.map((r) => ({ user_id: r.user_id, email: r.email, can_edit: !!r.can_edit }));
}

function ownsList(userId: number, listId: number): boolean {
  return getListAccess(userId, listId) === 'owner';
}

// GET /lists/:id/shares - owner only
router.get('/:id/shares', validateParams(idParamSchema), (req, res) => {
  const id = Number(req.params.id);
  if (!ownsList(req.user!.id, id)) {
    return res.status(403).json({ error: 'Only the list owner can manage sharing' });
  }
  res.json(shareDTOs(id));
});

// POST /lists/:id/shares { email, can_edit } - owner only, upsert
router.post('/:id/shares', validateParams(idParamSchema), validateBody(shareListSchema), (req, res) => {
  const id = Number(req.params.id);
  if (!ownsList(req.user!.id, id)) {
    return res.status(403).json({ error: 'Only the list owner can share this list' });
  }

  const email = String(req.body.email);
  const canEdit = req.body.can_edit ? 1 : 0;

  const target = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
    | UserRow
    | undefined;
  if (!target) return res.status(404).json({ error: 'No user found with that email' });
  if (target.id === req.user!.id) {
    return res.status(400).json({ error: 'You already own this list' });
  }

  db.prepare(
    `INSERT INTO list_shares (list_id, user_id, can_edit) VALUES (?, ?, ?)
     ON CONFLICT(list_id, user_id) DO UPDATE SET can_edit = excluded.can_edit`
  ).run(id, target.id, canEdit);

  res.status(201).json(shareDTOs(id));
});

// DELETE /lists/:id/shares/:userId
// Owner can revoke anyone; a shared user can remove themselves (leave).
router.delete('/:id/shares/:userId', (req, res) => {
  const id = Number(req.params.id);
  const targetUserId = Number(req.params.userId);
  const isOwner = ownsList(req.user!.id, id);

  if (!isOwner && targetUserId !== req.user!.id) {
    return res.status(403).json({ error: 'Not allowed' });
  }

  const info = db
    .prepare('DELETE FROM list_shares WHERE list_id = ? AND user_id = ?')
    .run(id, targetUserId);
  if (Number(info.changes) === 0) return res.status(404).json({ error: 'Share not found' });
  res.status(204).end();
});

export default router;
