export type Role = 'user' | 'admin';

export interface User {
  id: number;
  email: string;
  role: Role;
  created_at: string;
}

export interface AdminUser extends User {
  task_count: number;
}

export interface List {
  id: number;
  user_id: number;
  name: string;
  color: string | null;
  created_at: string;
}

export interface Tag {
  id: number;
  user_id: number;
  name: string;
}

export type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';
export type RepeatUnit = 'day' | 'week' | 'month';

export interface Task {
  id: number;
  user_id: number;
  list_id: number | null;
  title: string;
  description: string | null;
  due_date: string | null;
  repeat_type: RepeatType;
  repeat_interval: number | null;
  repeat_unit: string | null;
  repeat_days: string | null;
  completed: boolean;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface TaskInput {
  title: string;
  description?: string | null;
  list_id?: number | null;
  due_date?: string | null;
  repeat_type?: RepeatType;
  repeat_interval?: number | null;
  repeat_unit?: string | null;
  repeat_days?: number[] | null;
  tags?: string[];
  completed?: boolean;
}
