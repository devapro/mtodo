import { prepare } from './db';
import { ListRole, ListRow, ListShareRow } from './types';

/**
 * Determine a user's access level to a list.
 * - 'owner'  : the user created the list
 * - 'editor' : the list is shared with the user with edit rights
 * - 'viewer' : the list is shared read-only
 * - null     : no access
 */
export function getListAccess(userId: number, listId: number): ListRole | null {
  const list = prepare('SELECT * FROM lists WHERE id = ?').get(listId) as ListRow | undefined;
  if (!list) return null;
  if (list.user_id === userId) return 'owner';

  const share = prepare(
    'SELECT * FROM list_shares WHERE list_id = ? AND user_id = ?'
  ).get(listId, userId) as ListShareRow | undefined;
  if (!share) return null;
  return share.can_edit ? 'editor' : 'viewer';
}

/** Can the user modify tasks within this list (owner or editor)? */
export function canEditList(userId: number, listId: number): boolean {
  const access = getListAccess(userId, listId);
  return access === 'owner' || access === 'editor';
}

/** All list ids the user can at least view (owned + shared with them). */
export function accessibleListIds(userId: number): number[] {
  const owned = prepare('SELECT id FROM lists WHERE user_id = ?').all(userId) as {
    id: number;
  }[];
  const shared = prepare('SELECT list_id AS id FROM list_shares WHERE user_id = ?').all(
    userId
  ) as { id: number }[];
  const ids = new Set<number>();
  for (const r of owned) ids.add(r.id);
  for (const r of shared) ids.add(r.id);
  return [...ids];
}
