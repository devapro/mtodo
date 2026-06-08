import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';

/**
 * Build an Express middleware that validates `req.body` against a Zod schema.
 * On success the parsed (and coerced) value replaces `req.body`, so route
 * handlers receive clean, typed data. On failure it responds with 400 and a
 * readable message instead of letting malformed input reach the database.
 */
export function validateBody<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      res.status(400).json({ error: formatZodError(result.error) });
      return;
    }
    req.body = result.data;
    next();
  };
}

/** Validate `req.params` (e.g. numeric ids). */
export function validateParams<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.status(400).json({ error: formatZodError(result.error) });
      return;
    }
    Object.assign(req.params, result.data);
    next();
  };
}

function formatZodError(error: ZodError): string {
  const first = error.issues[0];
  if (!first) return 'Invalid request';
  const path = first.path.join('.');
  return path ? `${path}: ${first.message}` : first.message;
}

// ----- Reusable field schemas -----

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .max(254, 'Email is too long')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'A valid email is required');

export const passwordSchema = z
  .string()
  .min(6, 'Password must be at least 6 characters')
  .max(200, 'Password is too long');

// Route param: a positive integer id coerced from the URL string.
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine((s) => !Number.isNaN(new Date(s + 'T00:00:00').getTime()), 'Invalid date');

const repeatType = z.enum(['none', 'daily', 'weekly', 'monthly', 'custom']);
const repeatUnit = z.enum(['day', 'week', 'month']);

const tagsSchema = z
  .array(z.string().trim().min(1).max(50))
  .max(50, 'Too many tags')
  .optional();

const repeatDaysSchema = z.array(z.coerce.number().int().min(0).max(31)).max(31);

// ----- Auth -----

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

// Sign-in stays lenient on shape (we never reveal which field was wrong).
export const signinSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().max(200),
});

// ----- Lists -----

const colorSchema = z
  .string()
  .trim()
  .max(32)
  .regex(/^#?[0-9a-zA-Z]+$/, 'Invalid color')
  .nullable()
  .optional();

const emojiSchema = z.string().max(16).nullable().optional();

export const createListSchema = z.object({
  name: z.string().trim().min(1, 'List name is required').max(120, 'List name is too long'),
  color: colorSchema,
  emoji: emojiSchema,
});

export const updateListSchema = z.object({
  name: z.string().trim().min(1, 'List name is required').max(120).optional(),
  color: colorSchema,
  emoji: emojiSchema,
});

export const shareListSchema = z.object({
  email: emailSchema,
  can_edit: z.coerce.boolean().optional().default(false),
});

// ----- Tags -----

export const createTagSchema = z.object({
  name: z.string().trim().min(1, 'Tag name is required').max(50, 'Tag name is too long'),
});

// ----- Tasks -----

const taskBase = {
  title: z.string().trim().min(1, 'Task title is required').max(500, 'Task title is too long'),
  description: z.string().max(20000).nullable().optional(),
  list_id: z.coerce.number().int().positive().nullable().optional(),
  due_date: dateSchema.nullable().optional(),
  repeat_type: repeatType.optional(),
  repeat_interval: z.coerce.number().int().min(1).max(1000).nullable().optional(),
  repeat_unit: repeatUnit.nullable().optional(),
  repeat_days: repeatDaysSchema.nullable().optional(),
  tags: tagsSchema,
  completed: z.coerce.boolean().optional(),
};

export const createTaskSchema = z.object(taskBase);

// On update every field is optional (partial PUT/PATCH semantics).
export const updateTaskSchema = z.object({
  ...taskBase,
  title: taskBase.title.optional(),
});

// ----- Admin -----

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['user', 'admin']).optional().default('user'),
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});
