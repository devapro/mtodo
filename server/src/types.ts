export type Role = 'user' | 'admin';

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  role: Role;
  created_at: string;
  telegram_id: string | null;
  telegram_username: string | null;
  telegram_first_name: string | null;
  telegram_link_code: string | null;
  telegram_link_expires: string | null;
}

export interface PublicUser {
  id: number;
  email: string;
  role: Role;
  created_at: string;
  telegram_id: string | null;
  telegram_username: string | null;
}

export interface TelegramLoginData {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
}

export interface ListRow {
  id: number;
  user_id: number;
  name: string;
  color: string | null;
  emoji: string | null;
  created_at: string;
}

export type ListRole = 'owner' | 'editor' | 'viewer';

export interface ListShareRow {
  list_id: number;
  user_id: number;
  can_edit: number; // 0 | 1
  created_at: string;
}

export interface ListDTO {
  id: number;
  user_id: number; // owner id (kept for backwards compatibility with the client)
  name: string;
  color: string | null;
  emoji: string | null;
  created_at: string;
  owner_id: number;
  owner_email: string;
  role: ListRole;
  can_edit: boolean;
  shared_count: number;
}

export interface ListShareDTO {
  user_id: number;
  email: string;
  can_edit: boolean;
}

export type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';

export interface TaskRow {
  id: number;
  user_id: number;
  list_id: number | null;
  title: string;
  description: string | null;
  due_date: string | null; // YYYY-MM-DD
  repeat_type: RepeatType;
  repeat_interval: number | null; // for custom: every N units
  repeat_unit: string | null; // 'day' | 'week' | 'month' for custom
  repeat_days: string | null; // JSON array of weekday numbers / specific dates
  completed: number; // 0 | 1
  created_at: string;
  updated_at: string;
}

export interface TagRow {
  id: number;
  user_id: number;
  name: string;
}

export interface AuthPayload {
  id: number;
  email: string;
  role: Role;
}
