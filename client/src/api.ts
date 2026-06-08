import { AdminUser, List, ListShare, Tag, Task, TaskInput, User } from './types';

const API_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:4000/api';

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
