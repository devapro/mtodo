import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ServiceError } from '../errors';
import { Actor } from '../services/context';
import * as lists from '../services/lists';
import * as tasks from '../services/tasks';
import { prepare } from '../db';
import { dateSchema } from '../validate';

/**
 * MCP server exposing mTodo lists and tasks to AI agents. One instance is built
 * per HTTP request (stateless Streamable HTTP, see routes/mcp.ts) and is bound
 * to the user who owns the access token. All operations go through the same
 * service layer as the REST API, so permissions, validation and realtime
 * updates behave identically.
 */

const SERVER_INFO = { name: 'mtodo', version: '1.0.0' };

const INSTRUCTIONS = `mTodo is a TODO app. Tasks optionally belong to a list; lists can be shared
with other users as read-only ("viewer") or editable ("editor"). Only list owners can rename,
delete or re-share a list. Dates are YYYY-MM-DD. Use list_lists to find list ids before
creating tasks in a list. Changes appear live in the user's open web app.`;

// ----- Shared field schemas -----

const id = (what: string) => z.number().int().positive().describe(`The ${what} id`);

const listFields = {
  color: z
    .string()
    .trim()
    .max(32)
    .regex(/^#?[0-9a-zA-Z]+$/, 'Invalid color')
    .nullable()
    .optional()
    .describe('CSS color such as "#0d6efd"; null clears it'),
  emoji: z.string().max(16).nullable().optional().describe('Emoji icon; null clears it'),
};

const taskFields = {
  description: z
    .string()
    .max(20000)
    .nullable()
    .optional()
    .describe('Markdown description; null clears it'),
  list_id: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .describe('List to put the task in; null = no list'),
  due_date: dateSchema.nullable().optional().describe('Due date YYYY-MM-DD; null clears it'),
  repeat_type: z
    .enum(['none', 'daily', 'weekly', 'monthly', 'custom'])
    .optional()
    .describe('Recurrence. weekly/monthly use repeat_days; custom uses repeat_interval + repeat_unit'),
  repeat_interval: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .nullable()
    .optional()
    .describe('For custom recurrence: every N units'),
  repeat_unit: z
    .enum(['day', 'week', 'month'])
    .nullable()
    .optional()
    .describe('For custom recurrence: the unit of repeat_interval'),
  repeat_days: z
    .array(z.number().int().min(0).max(31))
    .max(31)
    .nullable()
    .optional()
    .describe('weekly: weekdays 0=Sun..6=Sat; monthly: days of month 1..31'),
  tags: z
    .array(z.string().trim().min(1).max(50))
    .max(50)
    .optional()
    .describe('Tag names; replaces all tags on update. Unknown tags are created'),
  completed: z.boolean().optional().describe('Whether the task is done'),
};

// ----- Result helpers -----

function ok(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: data === undefined ? 'OK' : JSON.stringify(data, null, 2) }],
  };
}

function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/** Run a service call, mapping ServiceErrors to MCP tool errors. */
function run(fn: () => unknown): CallToolResult {
  try {
    return ok(fn());
  } catch (err) {
    if (err instanceof ServiceError) return fail(err.message);
    throw err;
  }
}

export function createMcpServer(actor: Actor): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });

  const readOnly = { readOnlyHint: true, openWorldHint: false };
  const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  const destructive = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

  // ----- Lists -----

  server.registerTool(
    'list_lists',
    {
      title: 'List todo lists',
      description:
        'All lists the user owns or that are shared with them, with their role ' +
        '(owner/editor/viewer) and open/total task counts.',
      inputSchema: {},
      annotations: readOnly,
    },
    () =>
      run(() => {
        const all = tasks.listTasks(actor);
        return lists.listLists(actor).map((l) => {
          const inList = all.filter((t) => t.list_id === l.id);
          return {
            ...l,
            open_count: inList.filter((t) => !t.completed).length,
            task_count: inList.length,
          };
        });
      })
  );

  server.registerTool(
    'create_list',
    {
      title: 'Create list',
      description: 'Create a new todo list owned by the user.',
      inputSchema: { name: z.string().trim().min(1).max(120).describe('List name'), ...listFields },
      annotations: write,
    },
    (args) => run(() => lists.createList(actor, args))
  );

  server.registerTool(
    'update_list',
    {
      title: 'Update list',
      description: 'Rename a list or change its color/emoji. Only the list owner can do this.',
      inputSchema: {
        list_id: id('list'),
        name: z.string().trim().min(1).max(120).optional().describe('New name'),
        ...listFields,
      },
      annotations: { ...write, idempotentHint: true },
    },
    ({ list_id, ...fields }) => run(() => lists.updateList(actor, list_id, fields))
  );

  server.registerTool(
    'delete_list',
    {
      title: 'Delete list',
      description:
        'Delete a list (owner only). Its tasks are NOT deleted; they are kept without a list.',
      inputSchema: { list_id: id('list') },
      annotations: destructive,
    },
    ({ list_id }) =>
      run(() => {
        lists.deleteList(actor, list_id);
        return { deleted: true, list_id };
      })
  );

  // ----- Tasks -----

  server.registerTool(
    'list_tasks',
    {
      title: 'List tasks',
      description:
        "Find the user's tasks (including tasks in lists shared with them). All filters are optional.",
      inputSchema: {
        list_id: z.number().int().positive().optional().describe('Only tasks in this list'),
        date: dateSchema
          .optional()
          .describe('Only tasks that occur on this date (YYYY-MM-DD), recurrence-aware'),
        today: z.boolean().optional().describe("Shortcut for date = today's date (server time)"),
        include_completed: z
          .boolean()
          .optional()
          .describe('Include completed tasks (default true)'),
        search: z
          .string()
          .max(200)
          .optional()
          .describe('Case-insensitive text match on title, description and tags'),
      },
      annotations: readOnly,
    },
    (args) =>
      run(() =>
        tasks.listTasks(actor, {
          listId: args.list_id,
          date: args.date ?? (args.today ? new Date().toISOString().slice(0, 10) : undefined),
          includeCompleted: args.include_completed,
          search: args.search,
        })
      )
  );

  server.registerTool(
    'get_task',
    {
      title: 'Get task',
      description: 'Get a single task by id.',
      inputSchema: { task_id: id('task') },
      annotations: readOnly,
    },
    ({ task_id }) => run(() => tasks.getTask(actor, task_id))
  );

  server.registerTool(
    'create_task',
    {
      title: 'Create task',
      description:
        'Create a task. Put it in a list with list_id (the user must own or be able to edit the list).',
      inputSchema: {
        title: z.string().trim().min(1).max(500).describe('Task title'),
        ...taskFields,
      },
      annotations: write,
    },
    (args) => run(() => tasks.createTask(actor, args))
  );

  server.registerTool(
    'update_task',
    {
      title: 'Update task',
      description:
        'Update a task. Only the fields you pass are changed; pass null to clear a nullable field.',
      inputSchema: {
        task_id: id('task'),
        title: z.string().trim().min(1).max(500).optional().describe('New title'),
        ...taskFields,
      },
      annotations: { ...write, idempotentHint: true },
    },
    ({ task_id, ...fields }) => run(() => tasks.updateTask(actor, task_id, fields))
  );

  server.registerTool(
    'set_task_completed',
    {
      title: 'Complete / reopen task',
      description: 'Mark a task as done (completed=true) or reopen it (completed=false).',
      inputSchema: {
        task_id: id('task'),
        completed: z.boolean().default(true).describe('true = done, false = reopen'),
      },
      annotations: { ...write, idempotentHint: true },
    },
    ({ task_id, completed }) => run(() => tasks.updateTask(actor, task_id, { completed }))
  );

  server.registerTool(
    'delete_task',
    {
      title: 'Delete task',
      description: 'Permanently delete a task.',
      inputSchema: { task_id: id('task') },
      annotations: destructive,
    },
    ({ task_id }) =>
      run(() => {
        tasks.deleteTask(actor, task_id);
        return { deleted: true, task_id };
      })
  );

  // ----- Tags -----

  server.registerTool(
    'list_tags',
    {
      title: 'List tags',
      description: "The user's existing tag names (useful to reuse consistent tags).",
      inputSchema: {},
      annotations: readOnly,
    },
    () =>
      run(() =>
        (
          prepare('SELECT name FROM tags WHERE user_id = ? ORDER BY name COLLATE NOCASE').all(
            actor.userId
          ) as { name: string }[]
        ).map((t) => t.name)
      )
  );

  return server;
}
