import { prepare } from '../db';
import { publish } from '../events';
import { UserSettings } from '../types';
import { Actor } from './context';

export const DEFAULT_SETTINGS: UserSettings = {
  show_completed: true,
};

/** Parse the stored JSON, dropping unknown keys and filling defaults. */
export function parseSettings(raw: string | null | undefined): UserSettings {
  let stored: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) stored = parsed;
    } catch {
      // Corrupt value: fall back to defaults.
    }
  }
  return {
    show_completed:
      typeof stored.show_completed === 'boolean'
        ? stored.show_completed
        : DEFAULT_SETTINGS.show_completed,
  };
}

export function getSettings(userId: number): UserSettings {
  const row = prepare('SELECT settings FROM users WHERE id = ?').get(userId) as
    | { settings: string | null }
    | undefined;
  return parseSettings(row?.settings);
}

/** Merge a partial update into the user's settings and notify their other sessions. */
export function updateSettings(actor: Actor, patch: Partial<UserSettings>): UserSettings {
  const next: UserSettings = { ...getSettings(actor.userId), ...patch };
  prepare('UPDATE users SET settings = ? WHERE id = ?').run(JSON.stringify(next), actor.userId);
  publish([actor.userId], { type: 'settings', source: actor.source });
  return next;
}
