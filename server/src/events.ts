import { prepare } from './db';

/**
 * In-process realtime event bus.
 *
 * Every data mutation (REST, MCP, Telegram bot) publishes a small "something
 * changed" event to the users who can see the affected data. Connected web
 * clients receive it over Server-Sent Events (see routes/events.ts) and refetch
 * the relevant resource. Events carry no payload beyond the resource kind, so
 * the server never has to work out per-user DTOs for pushes and clients always
 * end up with authoritative data.
 *
 * This is a single-process bus: it assumes one API server instance.
 */

export type ChangeKind = 'tasks' | 'lists' | 'tags' | 'settings';

export interface ChangeEvent {
  type: ChangeKind;
  /** Optional id of the browser tab that caused the change (X-Client-Id). */
  source?: string;
}

type Listener = (event: ChangeEvent) => void;

const listeners = new Map<number, Set<Listener>>();

export function subscribe(userId: number, listener: Listener): () => void {
  let set = listeners.get(userId);
  if (!set) {
    set = new Set();
    listeners.set(userId, set);
  }
  set.add(listener);
  return () => {
    const current = listeners.get(userId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(userId);
  };
}

export function publish(userIds: Iterable<number>, event: ChangeEvent): void {
  for (const id of new Set(userIds)) {
    const set = listeners.get(id);
    if (!set) continue;
    for (const listener of set) {
      try {
        listener(event);
      } catch {
        // A broken connection must not stop delivery to the others.
      }
    }
  }
}

/** Number of open realtime connections (for diagnostics). */
export function connectionCount(): number {
  let n = 0;
  for (const set of listeners.values()) n += set.size;
  return n;
}

/** Owner + every member of a list. Compute BEFORE deleting the list/shares. */
export function listAudience(listId: number): number[] {
  const owner = prepare('SELECT user_id FROM lists WHERE id = ?').get(listId) as
    | { user_id: number }
    | undefined;
  if (!owner) return [];
  const members = prepare('SELECT user_id FROM list_shares WHERE list_id = ?').all(listId) as {
    user_id: number;
  }[];
  return [owner.user_id, ...members.map((m) => m.user_id)];
}

/** Everyone who can see a task: its creator plus the audience of its list. */
export function taskAudience(task: { user_id: number; list_id: number | null }): number[] {
  const ids = [task.user_id];
  if (task.list_id != null) ids.push(...listAudience(task.list_id));
  return ids;
}
