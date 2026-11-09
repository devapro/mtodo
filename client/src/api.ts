import {
  AdminUser,
  ApiToken,
  ChangeEvent,
  UserSettings,
  List,
  ListShare,
  Tag,
  Task,
  TaskInput,
  TelegramConfig,
  TelegramLoginData,
  User,
} from './types';

export const API_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:4000/api';

/**
 * Random id for this browser tab, sent with every request as X-Client-Id. The
 * server echoes it in realtime events so a tab can skip refetching for changes
 * it made itself (it already applied them).
 */
export const CLIENT_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const TOKEN_KEY = 'mtodo_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Id': CLIENT_ID,
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 204) return undefined as T;

  const data = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : null;

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export const api = {
  // auth
  signup: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  signin: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: User }>('/auth/me'),

  // settings
  updateSettings: (patch: Partial<UserSettings>) =>
    request<{ settings: UserSettings }>('/auth/settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  // personal access tokens (MCP)
  getApiTokens: () => request<ApiToken[]>('/auth/tokens'),
  createApiToken: (name: string) =>
    request<{ token: string; info: ApiToken }>('/auth/tokens', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  revokeApiToken: (id: number) => request<void>(`/auth/tokens/${id}`, { method: 'DELETE' }),

  // telegram
  telegramConfig: () => request<TelegramConfig>('/auth/telegram/config'),
  telegramLogin: (data: TelegramLoginData) =>
    request<{ token: string; user: User }>('/auth/telegram', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  telegramLinkCode: () =>
    request<{ code: string; botUsername: string }>('/auth/telegram/link-code', {
      method: 'POST',
    }),
  telegramUnlink: () =>
    request<{ user: User }>('/auth/telegram/unlink', { method: 'POST' }),

  // lists
  getLists: () => request<List[]>('/lists'),
  createList: (name: string, opts: { color?: string | null; emoji?: string | null } = {}) =>
    request<List>('/lists', {
      method: 'POST',
      body: JSON.stringify({ name, color: opts.color, emoji: opts.emoji }),
    }),
  updateList: (
    id: number,
    body: Partial<{ name: string; color: string | null; emoji: string | null }>
  ) => request<List>(`/lists/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteList: (id: number) => request<void>(`/lists/${id}`, { method: 'DELETE' }),

  // list sharing
  getShares: (listId: number) => request<ListShare[]>(`/lists/${listId}/shares`),
  shareList: (listId: number, email: string, canEdit: boolean) =>
    request<ListShare[]>(`/lists/${listId}/shares`, {
      method: 'POST',
      body: JSON.stringify({ email, can_edit: canEdit }),
    }),
  removeShare: (listId: number, userId: number) =>
    request<void>(`/lists/${listId}/shares/${userId}`, { method: 'DELETE' }),
  leaveList: (listId: number, myUserId: number) =>
    request<void>(`/lists/${listId}/shares/${myUserId}`, { method: 'DELETE' }),

  // tags
  getTags: () => request<Tag[]>('/tags'),
  createTag: (name: string) =>
    request<Tag>('/tags', { method: 'POST', body: JSON.stringify({ name }) }),

  // tasks
  getTasks: (params: { listId?: number; date?: string; today?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (params.listId !== undefined) q.set('listId', String(params.listId));
    if (params.date) q.set('date', params.date);
    if (params.today) q.set('today', 'true');
    const qs = q.toString();
    return request<Task[]>(`/tasks${qs ? `?${qs}` : ''}`);
  },
  createTask: (body: TaskInput) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (id: number, body: Partial<TaskInput>) =>
    request<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  toggleTask: (id: number) => request<Task>(`/tasks/${id}/toggle`, { method: 'PATCH' }),
  deleteTask: (id: number) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),

  // admin
  getUsers: () => request<AdminUser[]>('/admin/users'),
  createUser: (email: string, password: string, role: 'user' | 'admin') =>
    request<AdminUser>('/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, role }),
    }),
  resetUserPassword: (id: number, password: string) =>
    request<void>(`/admin/users/${id}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password }),
    }),
  deleteUser: (id: number) => request<void>(`/admin/users/${id}`, { method: 'DELETE' }),
};

/** Absolute URL of the MCP endpoint, for display in Settings. */
export function mcpEndpointUrl(): string {
  return new URL(`${API_URL}/mcp`, window.location.origin).toString();
}

/**
 * Open the realtime event stream (Server-Sent Events over fetch, so the JWT
 * goes in the Authorization header instead of the URL). Resolves when the
 * stream ends; rejects on network/HTTP errors. `onReady` fires on every
 * (re)connect so callers can resync anything missed while disconnected.
 */
export async function streamEvents(
  signal: AbortSignal,
  handlers: {
    onReady: () => void;
    onChange: (event: ChangeEvent) => void;
    /** Any bytes received, including heartbeats (for a liveness watchdog). */
    onActivity?: () => void;
  }
): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}/events`, {
    headers: { Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: 'no-store',
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Realtime connection failed (${res.status})`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    handlers.onActivity?.();
    buffer += value;
    // SSE messages are separated by a blank line.
    let sep: RegExpExecArray | null;
    while ((sep = /\r?\n\r?\n/.exec(buffer))) {
      const raw = buffer.slice(0, sep.index);
      buffer = buffer.slice(sep.index + sep[0].length);
      let event = 'message';
      const data: string[] = [];
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (event === 'ready') handlers.onReady();
      else if (event === 'change' && data.length) {
        try {
          handlers.onChange(JSON.parse(data.join('\n')) as ChangeEvent);
        } catch {
          // Ignore malformed payloads.
        }
      }
    }
  }
}
