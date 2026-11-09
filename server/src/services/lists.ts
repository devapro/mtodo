import { prepare } from '../db';
import { getListAccess } from '../access';
import { listAudience, publish } from '../events';
import { ServiceError, badRequest, forbidden, notFound } from '../errors';
import { ListDTO, ListRow, ListShareDTO, UserRow } from '../types';
import { Actor } from './context';

/**
 * List + sharing operations shared by the REST API and the MCP server. Every
 * mutation enforces ownership and publishes a realtime event to the list's
 * audience (owner + members).
 */

export interface ListFields {
  name?: string;
  color?: string | null;
  emoji?: string | null;
}

// Keep emoji values small and tidy. Empty string clears the emoji.
function normalizeEmoji(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  return [...s].slice(0, 16).join('');
}

function loadList(id: number): ListRow | undefined {
  return prepare('SELECT * FROM lists WHERE id = ?').get(id) as ListRow | undefined;
}

export function toListDTO(list: ListRow, viewerId: number): ListDTO {
  const owner = prepare('SELECT email FROM users WHERE id = ?').get(list.user_id) as
    | { email: string }
    | undefined;
  const isOwner = list.user_id === viewerId;

  let role: ListDTO['role'] = 'owner';
  let canEdit = true;
  if (!isOwner) {
    const share = prepare('SELECT can_edit FROM list_shares WHERE list_id = ? AND user_id = ?').get(
      list.id,
      viewerId
    ) as { can_edit: number } | undefined;
    canEdit = !!share?.can_edit;
    role = canEdit ? 'editor' : 'viewer';
  }

  const sharedCount = prepare('SELECT COUNT(*) AS c FROM list_shares WHERE list_id = ?').get(
    list.id
  ) as { c: number };

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

function assertOwner(actor: Actor, listId: number, message: string): ListRow {
  const access = getListAccess(actor.userId, listId);
  if (access === null) throw notFound('List');
  if (access !== 'owner') throw forbidden(message);
  return loadList(listId)!;
}

// ----- Lists -----

/** Owned lists + lists shared with the actor, oldest first. */
export function listLists(actor: Actor): ListDTO[] {
  const { userId } = actor;
  const owned = prepare('SELECT * FROM lists WHERE user_id = ?').all(userId) as ListRow[];
  const shared = prepare(
    `SELECT l.* FROM lists l
     JOIN list_shares s ON s.list_id = l.id
     WHERE s.user_id = ?`
  ).all(userId) as ListRow[];

  return [...owned, ...shared]
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
    .map((l) => toListDTO(l, userId));
}

export function getList(actor: Actor, id: number): ListDTO {
  if (getListAccess(actor.userId, id) === null) throw notFound('List');
  return toListDTO(loadList(id)!, actor.userId);
}

export function createList(actor: Actor, b: ListFields & { name: string }): ListDTO {
  const info = prepare('INSERT INTO lists (user_id, name, color, emoji) VALUES (?, ?, ?, ?)').run(
    actor.userId,
    b.name.trim(),
    b.color || null,
    normalizeEmoji(b.emoji)
  );
  const list = loadList(Number(info.lastInsertRowid))!;
  publish([actor.userId], { type: 'lists', source: actor.source });
  return toListDTO(list, actor.userId);
}

/** Only the owner can rename / recolor the list. */
export function updateList(actor: Actor, id: number, b: ListFields): ListDTO {
  const existing = assertOwner(actor, id, 'Only the list owner can edit this list');
  prepare('UPDATE lists SET name = ?, color = ?, emoji = ? WHERE id = ?').run(
    b.name !== undefined ? b.name.trim() : existing.name,
    b.color !== undefined ? b.color || null : existing.color,
    b.emoji !== undefined ? normalizeEmoji(b.emoji) : existing.emoji,
    id
  );
  publish(listAudience(id), { type: 'lists', source: actor.source });
  return toListDTO(loadList(id)!, actor.userId);
}

/** Only the owner can delete a list. Its tasks are kept, detached from the list. */
export function deleteList(actor: Actor, id: number): void {
  assertOwner(actor, id, 'Only the list owner can delete this list');
  const audience = listAudience(id);
  prepare('DELETE FROM lists WHERE id = ?').run(id);
  publish(audience, { type: 'lists', source: actor.source });
  publish(audience, { type: 'tasks', source: actor.source });
}

// ----- Sharing -----

export function listShares(actor: Actor, listId: number): ListShareDTO[] {
  assertOwner(actor, listId, 'Only the list owner can manage sharing');
  return shareDTOs(listId);
}

function shareDTOs(listId: number): ListShareDTO[] {
  const rows = prepare(
    `SELECT s.user_id, s.can_edit, u.email
     FROM list_shares s JOIN users u ON u.id = s.user_id
     WHERE s.list_id = ?
     ORDER BY u.email COLLATE NOCASE ASC`
  ).all(listId) as { user_id: number; can_edit: number; email: string }[];
  return rows.map((r) => ({ user_id: r.user_id, email: r.email, can_edit: !!r.can_edit }));
}

/** Share (or change the permission of) a list with a user by email. Owner only. */
export function shareList(
  actor: Actor,
  listId: number,
  email: string,
  canEdit: boolean
): ListShareDTO[] {
  assertOwner(actor, listId, 'Only the list owner can share this list');

  const target = prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  if (!target) throw new ServiceError(404, 'No user found with that email');
  if (target.id === actor.userId) throw badRequest('You already own this list');

  prepare(
    `INSERT INTO list_shares (list_id, user_id, can_edit) VALUES (?, ?, ?)
     ON CONFLICT(list_id, user_id) DO UPDATE SET can_edit = excluded.can_edit`
  ).run(listId, target.id, canEdit ? 1 : 0);

  const audience = listAudience(listId);
  publish(audience, { type: 'lists', source: actor.source });
  publish([target.id], { type: 'tasks', source: actor.source });
  return shareDTOs(listId);
}

/** Owner can revoke anyone; a member can remove themselves (leave). */
export function removeShare(actor: Actor, listId: number, targetUserId: number): void {
  const isOwner = getListAccess(actor.userId, listId) === 'owner';
  if (!isOwner && targetUserId !== actor.userId) throw forbidden('Not allowed');

  const audience = listAudience(listId);
  const info = prepare('DELETE FROM list_shares WHERE list_id = ? AND user_id = ?').run(
    listId,
    targetUserId
  );
  if (Number(info.changes) === 0) throw notFound('Share');

  publish(audience, { type: 'lists', source: actor.source });
  publish([targetUserId], { type: 'tasks', source: actor.source });
}
