import crypto from 'crypto';
import { prepare } from '../db';
import { badRequest, notFound } from '../errors';
import { AuthPayload, UserRow } from '../types';

/**
 * Personal access tokens, used by AI agents to call the MCP endpoint.
 *
 * Format: `mtd_<43 base64url chars>`. Only the SHA-256 hash is stored, so a
 * token is shown exactly once at creation time. Tokens act as the user who
 * created them and are accepted ONLY on /api/mcp (not on the REST API).
 */

export const TOKEN_PREFIX = 'mtd_';
const MAX_TOKENS_PER_USER = 20;

export interface ApiTokenDTO {
  id: number;
  name: string;
  /** First characters of the token, to help users recognise it. */
  prefix: string;
  created_at: string;
  last_used_at: string | null;
}

interface ApiTokenRow extends ApiTokenDTO {
  user_id: number;
  token_prefix: string;
  token_hash: string;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function toDTO(row: ApiTokenRow): ApiTokenDTO {
  return {
    id: row.id,
    name: row.name,
    prefix: row.token_prefix,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
  };
}

export function listApiTokens(userId: number): ApiTokenDTO[] {
  const rows = prepare(
    'SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC, id DESC'
  ).all(userId) as ApiTokenRow[];
  return rows.map(toDTO);
}

export function createApiToken(
  userId: number,
  name: string
): { token: string; info: ApiTokenDTO } {
  const count = prepare('SELECT COUNT(*) AS c FROM api_tokens WHERE user_id = ?').get(userId) as {
    c: number;
  };
  if (Number(count.c) >= MAX_TOKENS_PER_USER) {
    throw badRequest(`You can have at most ${MAX_TOKENS_PER_USER} tokens`);
  }
  const token = TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
  const info = prepare(
    'INSERT INTO api_tokens (user_id, name, token_hash, token_prefix) VALUES (?, ?, ?, ?)'
  ).run(userId, name, hashToken(token), token.slice(0, TOKEN_PREFIX.length + 6));
  const row = prepare('SELECT * FROM api_tokens WHERE id = ?').get(
    Number(info.lastInsertRowid)
  ) as ApiTokenRow;
  return { token, info: toDTO(row) };
}

export function revokeApiToken(userId: number, id: number): void {
  const info = prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?').run(id, userId);
  if (Number(info.changes) === 0) throw notFound('Token');
}

/** Resolve a raw bearer token to its user, recording when it was last used. */
export function authenticateApiToken(token: string): AuthPayload | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const row = prepare('SELECT * FROM api_tokens WHERE token_hash = ?').get(hashToken(token)) as
    | ApiTokenRow
    | undefined;
  if (!row) return null;
  const user = prepare('SELECT * FROM users WHERE id = ?').get(row.user_id) as UserRow | undefined;
  if (!user) return null;
  prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?").run(row.id);
  return { id: user.id, email: user.email, role: user.role };
}
