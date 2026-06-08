import { Telegraf, Markup, Context } from 'telegraf';
import { config } from '../config';
import { TaskRow, UserRow } from '../types';
import {
  addTaskToList,
  findUserByTelegramId,
  getListForUser,
  getListsForUser,
  getTasksForList,
  linkByCode,
  toggleTaskForUser,
} from './service';

// Per-chat conversational state for the multi-step "add task" flow.
interface PendingAdd {
  listId: number;
}
const pendingAdd = new Map<number, PendingAdd>();

function telegramIdOf(ctx: Context): string | null {
  return ctx.from ? String(ctx.from.id) : null;
}

function requireUser(ctx: Context): UserRow | null {
  const tgId = telegramIdOf(ctx);
  if (!tgId) return null;
  return findUserByTelegramId(tgId) || null;
}

function notLinkedMessage(): string {
  return (
    '👋 This Telegram account is not linked to an mTodo account yet.\n\n' +
    'Open *Settings → Telegram* in the mTodo web app, generate a link code, ' +
    'then send it here as `/start <code>`.'
  );
}

function listsKeyboard(userId: number) {
  const lists = getListsForUser(userId);
  if (!lists.length) {
    return { text: 'You have no todo lists yet. Create one in the mTodo web app.', keyboard: undefined };
  }
  const rows = lists.map((l) => [
    Markup.button.callback(
      `${l.emoji ? l.emoji + ' ' : '🗂️ '}${l.name} (${l.open_count})`,
      `list:${l.id}`
    ),
  ]);
  return {
    text: '*Your todo lists*\nPick a list to see its tasks:',
    keyboard: Markup.inlineKeyboard(rows),
  };
}

function taskLine(task: TaskRow): string {
  const box = task.completed ? '✅' : '⬜️';
  return `${box} ${task.title}`;
}

function listView(userId: number, listId: number) {
  const list = getListForUser(userId, listId);
  if (!list) return null;
  const tasks = getTasksForList(userId, listId) || [];

  const header = `*${list.emoji ? list.emoji + ' ' : ''}${list.name}*`;
  const body = tasks.length
    ? tasks.map(taskLine).join('\n')
    : '_No tasks yet._';

  const taskButtons = tasks.map((task) => [
    Markup.button.callback(
      `${task.completed ? '↩️ Reopen' : '✔️ Done'}: ${truncate(task.title, 24)}`,
      `toggle:${task.id}:${listId}`
    ),
  ]);

  const keyboard = Markup.inlineKeyboard([
    ...taskButtons,
    [Markup.button.callback('➕ Add task', `add:${listId}`)],
    [Markup.button.callback('⬅️ Back to lists', 'lists')],
  ]);

  return { text: `${header}\n\n${body}`, keyboard };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function createBot(): Telegraf {
  const bot = new Telegraf(config.telegram.botToken);

  bot.start(async (ctx) => {
    const payload = (ctx.payload || '').trim();
    const tgId = telegramIdOf(ctx);
    if (!tgId) return;

    if (payload) {
      const username = ctx.from?.username || null;
      const firstName = ctx.from?.first_name || null;
      const result = linkByCode(payload, tgId, username, firstName);
      if (result.ok) {
        await ctx.reply(
          `✅ Linked to *${result.user?.email}*.\nUse /lists to get started.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
      const reason =
        result.reason === 'expired'
          ? '⌛️ That code has expired. Generate a new one in the web app.'
          : result.reason === 'already_linked'
            ? '⚠️ This Telegram account is already linked to another mTodo user.'
            : '❌ Invalid link code. Generate a fresh one in *Settings → Telegram*.';
      await ctx.reply(reason, { parse_mode: 'Markdown' });
      return;
    }

    const user = findUserByTelegramId(tgId);
    if (!user) {
      await ctx.reply(notLinkedMessage(), { parse_mode: 'Markdown' });
      return;
    }
    await ctx.reply(
      `👋 Welcome back, *${user.telegram_first_name || user.email}*!\nUse /lists to view your todo lists.`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      [
        '*mTodo bot*',
        '',
        '/lists — show your todo lists',
        '/start <code> — link this chat to your mTodo account',
        '',
        'From a list you can review tasks, add a new task and mark tasks as completed.',
      ].join('\n'),
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('lists', async (ctx) => {
    const user = requireUser(ctx);
    if (!user) {
      await ctx.reply(notLinkedMessage(), { parse_mode: 'Markdown' });
      return;
    }
    pendingAdd.delete(ctx.chat!.id);
    const { text, keyboard } = listsKeyboard(user.id);
    await ctx.reply(text, { parse_mode: 'Markdown', ...(keyboard || {}) });
  });

  // Refresh the list-of-lists view.
  bot.action('lists', async (ctx) => {
    const user = requireUser(ctx);
    await ctx.answerCbQuery();
    if (!user) return;
    pendingAdd.delete(ctx.chat!.id);
    const { text, keyboard } = listsKeyboard(user.id);
    await editOrReply(ctx, text, keyboard);
  });

  // Open a single list.
  bot.action(/^list:(\d+)$/, async (ctx) => {
    const user = requireUser(ctx);
    await ctx.answerCbQuery();
    if (!user) return;
    const listId = Number(ctx.match[1]);
    const view = listView(user.id, listId);
    if (!view) {
      await ctx.reply('List not found.');
      return;
    }
    await editOrReply(ctx, view.text, view.keyboard);
  });

  // Toggle a task's completion, then refresh the list view.
  bot.action(/^toggle:(\d+):(\d+)$/, async (ctx) => {
    const user = requireUser(ctx);
    if (!user) {
      await ctx.answerCbQuery('Not linked');
      return;
    }
    const taskId = Number(ctx.match[1]);
    const listId = Number(ctx.match[2]);
    const updated = toggleTaskForUser(user.id, taskId);
    await ctx.answerCbQuery(
      updated ? (updated.completed ? 'Marked done ✅' : 'Reopened') : 'Not allowed'
    );
    const view = listView(user.id, listId);
    if (view) await editOrReply(ctx, view.text, view.keyboard);
  });

  // Begin the add-task flow for a list.
  bot.action(/^add:(\d+)$/, async (ctx) => {
    const user = requireUser(ctx);
    await ctx.answerCbQuery();
    if (!user) return;
    const listId = Number(ctx.match[1]);
    if (!getListForUser(user.id, listId)) {
      await ctx.reply('List not found.');
      return;
    }
    pendingAdd.set(ctx.chat!.id, { listId });
    await ctx.reply('✏️ Send me the title for the new task (or /cancel).');
  });

  bot.command('cancel', async (ctx) => {
    if (pendingAdd.delete(ctx.chat!.id)) {
      await ctx.reply('Cancelled.');
    }
  });

  // Free-text handler: completes the add-task flow when one is pending.
  bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const pending = pendingAdd.get(chatId);
    if (!pending) return; // ignore arbitrary chatter

    const user = requireUser(ctx);
    if (!user) {
      pendingAdd.delete(chatId);
      await ctx.reply(notLinkedMessage(), { parse_mode: 'Markdown' });
      return;
    }

    const title = ctx.message.text.trim();
    if (!title || title.startsWith('/')) {
      await ctx.reply('Please send a non-empty task title, or /cancel.');
      return;
    }

    const result = addTaskToList(user.id, pending.listId, title);
    pendingAdd.delete(chatId);
    if ('error' in result) {
      await ctx.reply(`❌ ${result.error}`);
      return;
    }
    const view = listView(user.id, pending.listId);
    if (view) {
      await ctx.reply(`➕ Added *${title}*`, { parse_mode: 'Markdown' });
      await ctx.reply(view.text, { parse_mode: 'Markdown', ...view.keyboard });
    }
  });

  return bot;
}

/** Edit the message in place when triggered from a button; fall back to a new message. */
async function editOrReply(ctx: Context, text: string, keyboard: unknown): Promise<void> {
  const extra = { parse_mode: 'Markdown' as const, ...((keyboard as object) || {}) };
  try {
    await ctx.editMessageText(text, extra);
  } catch {
    await ctx.reply(text, extra);
  }
}
